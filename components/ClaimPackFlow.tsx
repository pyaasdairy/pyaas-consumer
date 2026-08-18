import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import { SafeModal } from './SafeModal';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { shouldShowFreePack, snoozeFreePack, freePackEligible, freePackDailyPrice, FREE_PACK_PRODUCT_ID, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../lib/freePack';
import { minSubscriptionQty } from '../lib/subscriptionFloor';
import { getProduct } from '../constants/products';
import { usePopupSlot, anyPopupOpen } from '../lib/popupGate';

// The offer plan delivers the 1 L/day floor (2 × 500 ml), so every ₹/day the
// flow quotes is the floor quantity times the pack price — never the lone pack.
const OFFER_DAY_QTY = minSubscriptionQty(getProduct(FREE_PACK_PRODUCT_ID) ?? { id: FREE_PACK_PRODUCT_ID, category: 'milk', variant: '500ml' });
import { listSubscriptions } from '../lib/subscriptions';
import { useAuth } from '../lib/auth';
import { useUserLocation } from '../lib/userLocation';

const FREE_PACK_IMG = require('../assets/products/gold.png');

// The popup is ONLY the funnel DOOR now: the intro sells, then it hands over
// to the FULL-CREAM PRODUCT PAGE, where the standard SubscribeSheet runs the
// STRICT gate order — 1) delivery address (saved + pinned) → 2) funds (the
// qualifying recharge (OFFER_QUALIFY_RECHARGE) / top-up, only when short) → 3) review → Confirm
// LAST (the only step that creates; attachTrialAfterSubscribe hooks the 2+2
// on). 'subscribed' shows when a gold sub is already ACTIVE; 'ineligible'
// when the trial is completed.
type Step = 'intro' | 'signin' | 'ineligible' | 'subscribed';

// THE ₹500 RULE: the 2+2 offer redeems ONLY after the account's one-time
// qualifying recharge — a SINGLE top-up of ≥ OFFER_QUALIFY_RECHARGE. Smaller
// recharges keep the offer alive (it keeps showing) but never redeem it.
// The gate itself lives in lib/freePack (offerQualified / claimFreePack).

/**
 * "Start your subscription" onboarding: the 2 + 2 trial funnel. Claiming
 * auto-starts a daily taaza-500ml subscription from tomorrow and opens the
 * four-day trial: days 1–2 are PAID (₹29/day from the wallet), days 3–4 are
 * FREE, and from then on it CONTINUES at ₹29/day until paused/cancelled. The
 * sheet sells ONLY the hook ("2 days worth of free milk") with no sequence and
 * no mechanics; the confirm step still shows the real charge. Walks
 * the user from an intro card -> delivery address (typed + an EXACT map pin) -> a
 * confirmation box -> a delivery-window promise. Fires on first launch
 * (ClaimPackGate), from the home claim card and when a member starts their
 * PYAAS Plus trial. All money movement is in lib/freePack (idempotent).
 */
// ── Single-instance guard ────────────────────────────────────────────────────
// The flow is mounted in TWO places (the tabs-level ClaimPackGate and the home
// screen's own instance). Without coordination both can open at once and the
// sheets stack on top of each other. This module-level counter lets every
// opener check "is one already on screen?" before showing another.
let openFlows = 0;
export function claimFlowOnScreen(): boolean {
  return openFlows > 0;
}

export function ClaimPackFlow({ visible, onClose, onClaimed, onStartShopping }: { visible: boolean; onClose: () => void; onClaimed?: () => void; onStartShopping?: () => void }) {
  // Register this instance while its `visible` prop is up (see openFlows above).
  useEffect(() => {
    if (!visible) return;
    openFlows += 1;
    return () => { openFlows -= 1; };
  }, [visible]);
  const { profile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [busy, setBusy] = useState(false);
  // Synchronous re-entry guard: setBusy only disables the button after a
  // re-render, so a fast double-tap would run the gates twice without this ref.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const [blockReason, setBlockReason] = useState('');

  // Reset to a clean intro each time it opens.
  useEffect(() => {
    if (visible) {
      setStep('intro');
      setErr('');
      setBlockReason('');
    }
  }, [visible]);

  // THE DOOR: run the gates (sign-in → trial completed? → already subscribed?
  // → the qualifying recharge (OFFER_QUALIFY_RECHARGE)), then HAND OVER to the full-cream product
  // page — the standard SubscribeSheet (quantity, frequency, start date,
  // REVIEW → confirm) owns the creation, and attachTrialAfterSubscribe hooks
  // the 2+2 on after that confirm. This popup never creates anything itself.
  async function startFromIntro() {
    if (busyRef.current) return; // synchronous double-tap guard
    busyRef.current = true;
    setBusy(true); setErr('');
    try {
      const phone = profile?.phone ?? '';
      // No signed-in phone → nothing to claim against.
      if (!phone) { setStep('signin'); return; }
      // COMPLETED (2 paid days done) → the offer is over, honestly.
      const gate = await freePackEligible(phone);
      if (!gate.eligible) {
        setBlockReason(gate.reason ?? 'This trial has already been completed.');
        setStep('ineligible');
        return;
      }
      // A gold subscription is ALREADY running → say so, never re-sell.
      const subs = await listSubscriptions().catch(() => []);
      if (subs.some((s) => s.product_id === FREE_PACK_PRODUCT_ID && s.status === 'active' && s.frequency !== 'one_time')) {
        setStep('subscribed');
        return;
      }
      // Hand over. The qualifying recharge (OFFER_QUALIFY_RECHARGE) is asked on the product page
      // AFTER the delivery address — location always comes first.
      goProductPage();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not start just now. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Hand over: the product page opens with the subscribe sheet up (daily
  // full-cream pre-selected) — qty/date/review/confirm all live there.
  function goProductPage() {
    haptics.press();
    onClose();
    router.push(`/product/${FREE_PACK_PRODUCT_ID}?freq=daily&subscribe=1`);
  }

  // "Start shopping" always lands on the products/shop list first.
  function startShopping() {
    if (onStartShopping) { onStartShopping(); return; }
    onClose();
    router.replace('/(tabs)');
  }

  return (
    <>
    <SafeModal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', maxHeight: '88%', ...shadow.card }}>
          {/* White header: the transparent Taaza pack shot merges into the sheet,
              so only the blue packet reads as an image (no pink block behind it). */}
          <View style={{ backgroundColor: colors.white, alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
              <Tap haptic={false} onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </Tap>
            </View>
            <Image source={FREE_PACK_IMG} style={{ width: 130, height: 130 }} contentFit="contain" />
            <Serif color={colors.ink} style={{ fontSize: 23, lineHeight: 29, textAlign: 'center', marginTop: 4 }}>
              {step === 'subscribed'
                ? 'Already subscribed'
                : step === 'ineligible'
                  ? 'Trial already completed'
                  : step === 'signin'
                    ? 'Sign in to start'
                    : `Pay for ${TRIAL_PAID_DAYS} mornings.\nThe next ${TRIAL_FREE_DAYS} are on us.`}
            </Serif>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5, textAlign: 'center', marginTop: 2 }}>
              {step === 'ineligible' || step === 'signin' || step === 'subscribed'
                ? 'Parag Gold Full Cream · 1 L fresh every morning'
                : 'Parag Gold Full Cream · 1 L delivered daily, 5-7:30 AM'}
            </TextBody>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 'intro' ? (
              /* Founder's final layout (18 Aug): pack shot + the paid-first
                 pitch + the full scheme card. Every rupee figure is computed
                 from the live engine (pack price × the 1 L/day floor), so the
                 card can never promise money the sweep won't honour. */
              <Animated.View entering={FadeIn.duration(240)} style={{ gap: spacing.md }}>
                <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
                  Parag's trust, now at your door. Set your milk once and it arrives every morning while you're still getting up.
                </TextBody>
                <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
                  Recharge your wallet once. No daily payments, no chasing change.
                </TextBody>

                <View style={{ backgroundColor: colors.flameSoft, borderRadius: radius.lg, padding: spacing.md, gap: 12 }}>
                  {[
                    { icon: 'cash-outline' as const, body: <TextBody style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>Days 1 & {TRIAL_PAID_DAYS}: {rupee(freePackDailyPrice() * OFFER_DAY_QTY)}/day</TextBody> },
                    { icon: 'sparkles-outline' as const, body: <TextBody style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>Days {TRIAL_PAID_DAYS + 1} & {TRIAL_PAID_DAYS + TRIAL_FREE_DAYS}: <TextSemi color={colors.flameDeep} style={{ fontSize: 13.5 }}>free</TextSemi></TextBody> },
                    { icon: 'sync-outline' as const, body: <TextBody style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>From day {TRIAL_PAID_DAYS + TRIAL_FREE_DAYS + 1}: {rupee(freePackDailyPrice() * OFFER_DAY_QTY)}/day, paid from your wallet</TextBody> },
                    { icon: 'pause-outline' as const, body: <TextBody style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>Pause anytime, travelling or just a day off</TextBody> },
                    { icon: 'card-outline' as const, body: <TextBody style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>To begin, top up enough for your first {TRIAL_PAID_DAYS} paid days ({rupee(freePackDailyPrice() * OFFER_DAY_QTY * TRIAL_PAID_DAYS)})</TextBody> },
                  ].map((row, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={row.icon} size={16} color={colors.flameDeep} />
                      </View>
                      {row.body}
                    </View>
                  ))}
                </View>

                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5, textAlign: 'center' }}>{err}</TextBody> : null}
                <PrimaryButton title={busy ? 'Checking…' : 'Start my subscription'} loading={busy} onPress={() => { void startFromIntro(); }} />
                <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextMed>
                </Tap>
                <TextBody color={colors.inkMute} style={{ fontSize: 11, textAlign: 'center' }}>
                  New eligible subscribers. T&C apply.
                </TextBody>
              </Animated.View>
            ) : null}

            {step === 'subscribed' ? (
              /* A gold subscription is ALREADY running — never re-sell; point at
                 Manage instead (pause / quantity / cancel live there). */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={34} color={colors.blue} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  You are already subscribed. PYAAS Gold arrives every morning, billed day by day from your wallet. Pause, change quantity or cancel anytime from Manage.
                </TextBody>
                <PrimaryButton title="Manage subscription" onPress={() => { onClose(); router.push('/subscriptions'); }} />
                <Tap haptic={false} onPress={startShopping} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Start shopping</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {step === 'ineligible' ? (
              /* Gate rejected (phone/device already used) — say WHY, promise nothing. */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="gift-outline" size={30} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  {blockReason} You can still get PYAAS Gold every morning. A daily 1 L subscription is {rupee(freePackDailyPrice() * OFFER_DAY_QTY)}/day, pause anytime.
                </TextBody>
                <PrimaryButton title="Start shopping" onPress={startShopping} />
              </Animated.View>
            ) : null}

            {step === 'signin' ? (
              /* No signed-in phone — the claim is per phone number, so sign in first. */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person-circle-outline" size={32} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Your trial is tied to your phone number. Sign in (or finish setting up your profile) and come back, the offer will be waiting.
                </TextBody>
                {/* Phone OTP is the app's sign-in. This used to route to the
                    email/password screen, which is the only thing that reaches
                    signUpWithEmail — and that stores the password in CLEARTEXT in
                    unencrypted AsyncStorage (lib/session.ts), alongside the email,
                    name and phone of every account ever created on the handset.
                    The copy directly above already says the trial is tied to the
                    phone number, so OTP is also the correct destination. */}
                <PrimaryButton title="Sign in" onPress={() => { onClose(); router.replace('/(auth)/otp'); }} />
                <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Not now</TextMed>
                </Tap>
              </Animated.View>
            ) : null}
          </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeModal>
    </>
  );
}

/** Launch trigger: shows the claim flow to an eligible member and RE-ARMS it on
 *  every app open + screen focus + claim change, so it re-appears each session
 *  until the member claims or snoozes it away (shouldShowFreePack is per-USER and
 *  honours the "Maybe later" snooze, so re-checking freely self-suppresses). */
export function ClaimPackGate() {
  const { profile } = useAuth();
  const router = useRouter();
  const phone = profile?.phone ?? '';
  const [visible, setVisible] = useState(false);
  // Once the flow is on screen it stays until the MEMBER dismisses it (close()).
  // A re-check must never yank an OPEN flow shut — claiming fires
  // notifyFreePackChanged() from inside doClaimFreePack BEFORE the 'done' congrats
  // screen renders, so without this guard the modal would close mid-claim and the
  // member would never see the success screen.
  const openedRef = useRef(false);
  // Wait for the delivery location to be set first — the location gate owns the
  // screen on first launch, so the trial must not stack on top of it.
  const hasLocation = useUserLocation((s) => !!s.loc);
  const pickerOpen = useUserLocation((s) => s.pickerOpen);

  // Register with the popup arbiter while actually on screen, so the OOZ
  // sheet / money nudges never stack over (or under) the claim flow.
  usePopupSlot(visible && hasLocation && !pickerOpen);

  // Re-check show-eligibility. Returns a cleanup that cancels the in-flight check,
  // so it doubles as the effect / focus cleanup below.
  const recheck = useCallback(() => {
    if (openedRef.current) return () => {}; // already open — never hide it mid-flow
    // Another instance (the home screen's) is already showing the flow — never
    // stack a second sheet on top of it.
    if (claimFlowOnScreen()) return () => {};
    if (!phone) { setVisible(false); return () => {}; }
    let cancelled = false;
    shouldShowFreePack(phone)
      .then((show) => {
        if (cancelled) return;
        // One auto-popup at a time: if anything else presented itself while
        // the eligibility check ran, stand down (we re-arm on next focus).
        if (show && anyPopupOpen()) return;
        setVisible(show);
        if (show) openedRef.current = true;
      })
      .catch(() => { /* signed out / offline — leave hidden */ });
    return () => { cancelled = true; };
  }, [phone]);

  // On mount + whenever the signed-in phone changes (a new account is a fresh
  // first-time user, so the pop-up re-arms for them).
  useEffect(() => recheck(), [recheck]);
  // On screen focus (navigating back to the tab that hosts the gate).
  useFocusEffect(recheck);
  // On app FOREGROUND — the core "close app + open again → see it again" case.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') recheck(); });
    return () => sub.remove();
  }, [recheck]);

  // "Maybe later" / X / "Start shopping": SNOOZE (re-offer next session) instead of
  // losing the free pack forever, and release the open-guard so the gate can re-arm
  // next session. A successful claim marks it seen internally, so it never re-offers.
  function close() { void snoozeFreePack(); openedRef.current = false; setVisible(false); }
  // "Start shopping" deterministically lands on the Shop tab (a no-op if already there).
  function startShopping() { close(); router.replace('/(tabs)'); }
  return <ClaimPackFlow visible={visible && hasLocation && !pickerOpen} onClose={close} onStartShopping={startShopping} />;
}

function PrimaryButton({ title, onPress, disabled, loading }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  // alignSelf 'stretch' + horizontal padding: inside centered step layouts the
  // pill otherwise shrink-wraps its label and the text touches the edges.
  return (
    <Tap onPress={disabled || loading ? undefined : onPress} style={{ height: 52, alignSelf: 'stretch', paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: disabled ? colors.line : colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled ? 0.7 : 1, ...shadow.soft }}>
      {loading ? <ActivityIndicator color={colors.white} /> : null}
      <TextSemi color={colors.white} style={{ fontSize: 16 }} numberOfLines={1}>{title}</TextSemi>
    </Tap>
  );
}



