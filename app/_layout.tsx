import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { AuthProvider, useAuth } from '../lib/auth';
import { ConsentWelcome } from '../components/ConsentWelcome';
import { hasAcceptedDataDisclosure, recordDataDisclosureAccepted, linkDisclosureToAccount } from '../lib/dataConsent';
import { getUserId } from '../lib/session';
import { setOnAuthExpired } from '../lib/apiClient';
import { runOneTimeLocalReset } from '../lib/localReset';
import { drainMirrorQueue } from '../lib/mirrorQueue';
import { warmBackend } from '../lib/warmup';
import { ToastHost } from '../components/Toast';
import { ensureChannels, ensureCategories, installForegroundHandler, onNotificationTap } from '../lib/notifications';
import { scheduleCartReminder, cancelCartReminder } from '../lib/cartReminder';
import { rescheduleTaglines } from '../lib/taglines';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hydrateProfileFromServer } from '../lib/profileApi';
// Importing consentSync also registers the 'consents' mirror handler at boot,
// before any drain can encounter (and would otherwise drop) a queued consent op.
import { hydrateConsentsFromServer } from '../lib/consentSync';
import { colors } from '../lib/theme';
import { Splash } from '../components/Splash';
import { AppErrorBoundary } from '../components/AppErrorBoundary';

/**
 * Legal and informational documents that must stay readable while signed out.
 * The signup screen links Terms and Privacy Policy, and an App Review tester
 * opens both BEFORE creating an account — bouncing them to the login screen
 * reads as a broken privacy-policy link (Guideline 5.1.1(i)). Each entry is a
 * top-level route file in app/, matched against segments[0].
 */
const PUBLIC_DOC_ROUTES = new Set([
  'terms',
  'privacy-policy',
  'refund-policy',
  // Welcome Litre §15.7 terms summary — MUST be reachable before registration
  // (campaign A-2; §6.2 "offer disclosed before registration begins").
  'offer-terms',
  'shipping-policy',
  'cancellation-policy',
  'legal',
  'contact-us',
  'about-us',
  'faq',
  'fssai-details',
]);

function RootNavigator() {
  const { session, profile, profileLoaded, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [minSplash, setMinSplash] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // PERSISTENT SESSION: a member who signed in STAYS signed in. When the API
  // layer declares the stored backend tokens dead (refresh rejected / tokenless
  // 401 after a server key rotation), we deliberately do NOT sign the local
  // session out any more — that was silently booting returning users to the
  // login screen. The tokens are already cleared by the api client; the app
  // keeps running on the local data layer and the next OTP sign-in re-mints
  // tokens. Only an explicit "Sign out" (or account deletion) ends the session.
  useEffect(() => {
    setOnAuthExpired(() => {
      // Keep the local session alive; nothing to do beyond the client's own
      // token cleanup. (Never call signOut() here.)
    });
  }, []);

  // The one-time versioned local reset is driven from the consent effect below,
  // NOT here — for a signed-in member it re-hydrates addresses + subscriptions
  // from the backend, and that authenticated fetch must never run underneath
  // the re-consent overlay (Play prominent-disclosure: no collection before the
  // current disclosure is accepted). See the consent effect.
  const [maxWaited, setMaxWaited] = useState(false);
  // Per-account "been through profile setup" flag (written by complete-profile
  // on save). null = still reading — the gate waits, so a nameless member is
  // neither bounced into the app nor back to the form on a coin flip. No
  // session (or no profile id yet) resolves to false so the gate can proceed.
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    const uid = profile?.id;
    if (!session) { setSetupDone(false); return; }
    if (!uid) { setSetupDone(profileLoaded ? false : null); return; }
    AsyncStorage.getItem(`pyaas_setup_done:${uid}`)
      .then((v) => { if (on) setSetupDone(v === '1'); })
      .catch(() => { if (on) setSetupDone(false); });
    return () => { on = false; };
  }, [session, profile?.id, profileLoaded]);
  // Premium type identity (Hanken Grotesk + Bricolage Grotesque), loaded at
  // runtime from bundled assets - no network, no native rebuild.
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
  });

  // Keep the branded splash up briefly (~700ms) for a polished cold start without
  // padding the perceived load time, but never longer than ~5s even if
  // auth/session hangs (so it can't wedge).
  useEffect(() => {
    warmBackend(); // wake the sleeping backend NOW, while the splash/consent plays
    // Notifications: register the Android channels and the foreground
    // presentation rule at boot. This asks for NOTHING — permission is only
    // ever requested from the notifications screen, where the member can read
    // what we would send first.
    installForegroundHandler();
    void ensureChannels();
    void ensureCategories(); // the "View Cart" button on the cart reminder
    const min = setTimeout(() => setMinSplash(true), 700);
    const max = setTimeout(() => setMaxWaited(true), 5000);
    return () => { clearTimeout(min); clearTimeout(max); };
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    // segments is [] only on the "/" splash, whose sole job is to redirect.
    const onSplash = (segments as string[]).length === 0;
    const onComplete = segments[0] === 'complete-profile';

    const onPublicDoc = PUBLIC_DOC_ROUTES.has(segments[0] as string);

    if (!session && !inAuthGroup && !onPublicDoc) {
      // Phone OTP is the default sign-in path; email is a secondary option linked
      // from there.
      router.replace('/(auth)/otp');
      return;
    }
    if (session) {
      // Wait until we actually know the profile before deciding the gate, so we
      // never flash the tabs and bounce. New phone-OTP / metadata-less signups
      // still visit complete-profile once — but the NAME is optional there
      // (§6.2 / CCPA Forced Action), so the gate also accepts the per-account
      // SETUP_DONE flag the screen writes: a member who chose not to give a
      // name must never be bounced back.
      if (!profileLoaded || setupDone === null) return;
      const needsProfile = !(profile?.full_name && profile.full_name.trim()) && !setupDone;
      if (needsProfile && !onComplete) {
        router.replace('/complete-profile');
      } else if (!needsProfile && (inAuthGroup || onSplash || onComplete)) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, profileLoaded, setupDone, loading, segments, router]);

  // The app renders underneath; the Splash overlays it and fades out once we
  // actually know where to land (so there's no flash of the wrong screen, and
  // no abrupt swap). For signed-in users we wait for the profile too.
  const appReady = maxWaited || (fontsLoaded && !loading && minSplash && (!session || profileLoaded));

  // SIGNED-IN CONSENT PARITY: the prominent disclosure used to exist only on
  // the sign-in screen, so a member with a persisted session (or one signed in
  // before a disclosure-version bump) could use the app — and have data
  // collected — without ever seeing the current disclosure. Any signed-in
  // session without the CURRENT version accepted gets the same full-screen
  // ConsentWelcome, once, before the app. Hidden while a public legal doc is
  // open so the Privacy Policy / Terms links inside it remain readable.
  const [needsConsent, setNeedsConsent] = useState(false);
  useEffect(() => {
    // Signed out: no re-consent needed, and the local reset can run (its
    // authenticated calls simply no-op without a session) to clear stale rows.
    if (!session) { setNeedsConsent(false); void runOneTimeLocalReset(); return; }
    let on = true;
    hasAcceptedDataDisclosure()
      .then((ok) => {
        if (!on) return;
        setNeedsConsent(!ok);
        // Re-hydrate from the backend ONLY once the signed-in member has the
        // current disclosure accepted — never fetch their data while the
        // re-consent overlay is still up (GAP-3).
        if (ok) {
          void runOneTimeLocalReset();
          // Land any queued mirrors from previous sessions, then pull the
          // server truths a reinstall forgets (profile fields). Error-soft.
          void drainMirrorQueue().catch(() => undefined);
          void hydrateProfileFromServer();
          // Fire-and-forget, never blocks session start: reinstall hydration
          // of channel consents (GET /users/me/consents). Silent no-op against
          // the deployed backend (404) and offline; skipped while a local
          // consent mirror is still pending so local intent is never clobbered.
          void hydrateConsentsFromServer();
        }
      })
      .catch(() => { if (on) setNeedsConsent(true); });
    return () => { on = false; };
  }, [session]);
  // Foreground = a connective moment: replay any mirror the last session
  // could not land (a pause queued on a dead network must reach the backend
  // the instant the app breathes again — it is billing truth, not UI state).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        warmBackend(); // returning after long background = likely-cold backend
        void drainMirrorQueue().catch(() => undefined);
        void cancelCartReminder(); // they came back: no "your cart is waiting"
      }
      // Leaving the app = re-plan the 2-hourly taglines from the member's
      // state right now (cart, orders, Offers preference). lib/taglines.
      // …and, with items in the cart, the 30-minute "Your cart is waiting".
      if (st === 'background') {
        void rescheduleTaglines();
        void scheduleCartReminder();
      }
    });
    return () => sub.remove();
  }, []);
  // …and once per signed-in launch, so a member who never backgrounds the app
  // cleanly (swiped away) still has the next 3 days planned.
  useEffect(() => {
    if (session) void rescheduleTaglines();
  }, [session]);
  // A tapped notification (or its View Cart button) opens what it is about:
  // the order, the cart, the recharge. Before this, a tap only opened the app.
  useEffect(() => onNotificationTap((href) => router.push(href as never)), [router]);

  const onPublicDocNow = PUBLIC_DOC_ROUTES.has(segments[0] as string);
  const acceptSignedInConsent = useCallback(async () => {
    await recordDataDisclosureAccepted();
    try {
      const uid = await getUserId();
      if (uid) await linkDisclosureToAccount(uid);
    } catch { /* attribution is best-effort */ }
    setNeedsConsent(false);
    // Consent just granted → NOW it is safe to re-hydrate from the backend.
    void runOneTimeLocalReset();
    // The [session] effect already ran (and skipped hydration) while the
    // overlay was up, so pull the account's consent state here instead.
    // Fire-and-forget; the pending disclosure mirror just queued means the
    // server-wins merge will stand aside until local intent has landed.
    void hydrateConsentsFromServer();
  }, []);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  // OUTER BACKSTOP for the splash overlay. maxWaited above only forces
  // `appReady`, which is the Splash's `ready` PROP — it never guaranteed the
  // overlay actually unmounts. If Splash fails to call onDone for any reason,
  // clear it from here so a working app can never stay hidden behind it.
  useEffect(() => {
    const bail = setTimeout(() => setSplashDone(true), 8000);
    return () => clearTimeout(bail);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.milk } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="cart" options={{ presentation: 'card' }} />
        <Stack.Screen name="recharge" options={{ presentation: 'card' }} />
        <Stack.Screen name="search" options={{ presentation: 'card', animation: 'fade' }} />
        <Stack.Screen name="order-confirmed" options={{ presentation: 'card', gestureEnabled: false }} />
        <Stack.Screen name="address" options={{ presentation: 'modal' }} />
        <Stack.Screen name="order/[id]" options={{ presentation: 'card' }} />
      </Stack>
      {/* App-wide quiet confirmations ("Added · Toned Milk"); presentation only. */}
      <ToastHost />
      {session && needsConsent && !onPublicDocNow && splashDone ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ConsentWelcome onAgree={() => { void acceptSignedInConsent(); }} />
        </View>
      ) : null}
      {!splashDone ? <Splash ready={appReady} onDone={onSplashDone} /> : null}
    </View>
  );
}

export default function RootLayout() {
  // iOS system font - no web-font download needed, so the app starts instantly.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AuthProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
