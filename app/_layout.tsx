import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
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
import { setOnAuthExpired } from '../lib/apiClient';
import { signOut } from '../lib/session';
import { colors } from '../lib/theme';
import { Splash } from '../components/Splash';
import { AppErrorBoundary } from '../components/AppErrorBoundary';

function RootNavigator() {
  const { session, profile, profileLoaded, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [minSplash, setMinSplash] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // PERMANENT auth-expiry handling: when the API layer declares the stored
  // session dead (refresh rejected / tokenless 401 — e.g. a server key
  // rotation), sign the LOCAL session out too. The gate below then routes to
  // the sign-in screen — no more half-signed-in screens printing raw
  // "authentication required" errors.
  useEffect(() => {
    setOnAuthExpired(() => {
      void signOut();
    });
  }, []);
  const [maxWaited, setMaxWaited] = useState(false);
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

    if (!session && !inAuthGroup) {
      // Phone OTP is the default sign-in path; email is a secondary option linked
      // from there.
      router.replace('/(auth)/otp');
      return;
    }
    if (session) {
      // Wait until we actually know the profile before deciding the gate, so we
      // never flash the tabs and bounce. New phone-OTP / metadata-less signups
      // land with no name → send them to complete their profile first.
      if (!profileLoaded) return;
      const needsProfile = !(profile?.full_name && profile.full_name.trim());
      if (needsProfile && !onComplete) {
        router.replace('/complete-profile');
      } else if (!needsProfile && (inAuthGroup || onSplash || onComplete)) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, profileLoaded, loading, segments, router]);

  // The app renders underneath; the Splash overlays it and fades out once we
  // actually know where to land (so there's no flash of the wrong screen, and
  // no abrupt swap). For signed-in users we wait for the profile too.
  const appReady = maxWaited || (fontsLoaded && !loading && minSplash && (!session || profileLoaded));
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.milk } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="payment" options={{ presentation: 'card' }} />
        <Stack.Screen name="search" options={{ presentation: 'card', animation: 'fade' }} />
        <Stack.Screen name="order-confirmed" options={{ presentation: 'card', gestureEnabled: false }} />
        <Stack.Screen name="address" options={{ presentation: 'modal' }} />
        <Stack.Screen name="order/[id]" options={{ presentation: 'card' }} />
      </Stack>
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
