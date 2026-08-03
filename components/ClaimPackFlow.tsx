import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { AddressCaptureSheet } from './AddressCapture';
import { type Address } from '../lib/api';
import { claimFreePack, shouldShowFreePack, snoozeFreePack, offerQualified, OFFER_QUALIFY_RECHARGE, FREE_PACK_DAILY_PRICE, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../lib/freePack';
import { formatDeliveryWindow } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { useUserLocation } from '../lib/userLocation';
import { useWallet } from '../store/wallet';

const FREE_PACK_IMG = require('../assets/products/gold.png');
const DELIVERY_WINDOW = '06:00-07:00'; // matches placeOrder's stamped window

// 'done' is reached ONLY on a real successful claim. A signed-out member lands
// on 'signin'; a failed gate (phone/device already claimed) lands on
// 'ineligible' with the gate's reason — never a false delivery promise.
type Step = 'intro' | 'confirm' | 'fund' | 'done' | 'signin' | 'ineligible';

// THE ₹500 RULE: the 2+2 offer redeems ONLY after the account's one-time
// qualifying recharge — a SINGLE top-up of ≥ OFFER_QUALIFY_RECHARGE. Smaller
// recharges keep the offer alive (it keeps showing) but never redeem it.
// The gate itself lives in lib/freePack (offerQualified / claimFreePack).

/**
 * "Start your subscription" onboarding: the 2 + 2 trial funnel. Claiming
 * auto-starts a daily taaza-500ml subscription from tomorrow and opens the
 * four-day trial: days 1–2 are PAID (₹29/day from the wallet), days 3–4 are
 * FREE, and from then on it CONTINUES at ₹29/day until paused/cancelled. The
 * sheet copy says exactly that — pay 2, get 2 free, no surprise charges. Walks
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
  const refreshWallet = useWallet((s) => s.refresh);
  const [step, setStep] = useState<Step>('intro');
  // The COMPLETE address captured through the shared CD-style flow (map with
  // search → full form). Saved once; shown on the confirm card.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [savedAddr, setSavedAddr] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  // Synchronous re-entry guard: setBusy only disables the button after a
  // re-render, so a fast double-tap would run confirm() twice without this ref.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const [subStarted, setSubStarted] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  // The delivery address is captured ONCE (before the funding step); this guards
  // against a second addAddress if the member bounces to recharge and back.
  const addressSavedRef = useRef(false);
  // We temporarily hide this modal while the full-screen recharge route is on top
  // (a native Modal would otherwise cover it), then reveal it again on return.
  const [navHidden, setNavHidden] = useState(false);
  // True while we are waiting for the member to fund the wallet before the trial
  // subscription is created. Read on screen re-focus to resume into the claim.
  const awaitingFundsRef = useRef(false);
  // Always-current pointer to finishClaim so the focus resume never fires a stale
  // closure (e.g. an out-of-date profile phone).
  const finishRef = useRef<() => Promise<void>>(async () => {});

  // Reset to a clean intro each time it opens (so a VIP re-open never prefills
  // the previous address).
  useEffect(() => {
    if (visible) {
      setStep('intro');
      setErr('');
      setCaptureOpen(false);
      setSavedAddr(null);
      setSubStarted(false);
      setBlockReason('');
      setNavHidden(false);
      addressSavedRef.current = false;
      awaitingFundsRef.current = false;
    }
  }, [visible]);

  // The shared capture saved a COMPLETE address (pin + flat + receiver + city +
  // pincode + preferences) — move straight to the confirm card.
  function onAddressSaved(addr: Address) {
    setSavedAddr(addr);
    addressSavedRef.current = true;
    setCaptureOpen(false);
    setErr('');
    setStep('confirm');
  }

  // STEP 1 (confirm): capture the delivery address, then GATE on wallet funds.
  // A trial subscription is NEVER created here unless the wallet already covers
  // MIN_SUB_DAYS_COVER days — otherwise we route to add funds first and resume.
  async function confirm() {
    if (busyRef.current) return; // synchronous double-tap guard
    busyRef.current = true;
    setBusy(true); setErr('');
    try {
      const phone = profile?.phone ?? '';
      // No signed-in phone → nothing to claim against. Never show the delivery
      // promise; send the member to sign in instead.
      if (!phone) { setStep('signin'); return; }
      // The COMPLETE address must already be captured (map + full form) — the
      // shared sheet saved it before this step was reachable.
      if (!addressSavedRef.current) { setCaptureOpen(true); return; }
      // ₹500 RULE: the offer redeems only via the one-time qualifying recharge
      // (a single ≥₹500 top-up) — not by any balance level.
      await refreshWallet();
      if (!(await offerQualified())) {
        goAddFunds();
        return;
      }
      await finishClaim();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not confirm just now. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Route to the wallet recharge screen for at least the shortfall, hiding this
  // modal while that full-screen route is on top. On return (screen re-focus) we
  // reveal the modal again and, once funded, finish the claim.
  function goAddFunds() {
    // The qualifying recharge is a SINGLE ≥₹500 top-up (recordRechargeForOffer
    // marks the account and auto-redeems the pending offer on success).
    const qs = new URLSearchParams({
      min: String(OFFER_QUALIFY_RECHARGE),
      amount: String(OFFER_QUALIFY_RECHARGE),
      reason: 'to unlock your 2+2 offer',
    }).toString();
    awaitingFundsRef.current = true;
    setStep('fund');
    setNavHidden(true);
    haptics.press();
    router.push(`/recharge?${qs}`);
  }

  // STEP 2 (post-funding): actually create the trial subscription, then show the
  // congrats screen. Only ever reached once the wallet is funded.
  async function finishClaim() {
    const phone = profile?.phone ?? '';
    if (!phone) { setStep('signin'); return; }
    setBusy(true); setErr('');
    try {
      // Claim = promo credit + auto-started daily subscription (+ test top-up).
      // The result decides the screen: only a REAL success reaches 'done'.
      let r: Awaited<ReturnType<typeof claimFreePack>>;
      try {
        r = await claimFreePack(phone);
      } catch (e: any) {
        // Hard failure (signed out mid-flow / storage error): nothing was
        // claimed, so it stays claimable — surface it and go back a step.
        if (/not signed in/i.test(String(e?.message ?? ''))) { setStep('signin'); return; }
        setErr(e?.message ?? 'Could not start just now. Please try again.');
        setStep('confirm');
        return;
      }
      if (!r.ok) {
        // Gate rejected (phone/device already claimed): show WHY, no promises.
        setBlockReason(r.reason ?? 'This trial has already been started.');
        setStep('ineligible');
        return;
      }
      setSubStarted(!!r.subscriptionId);
      try { await refreshWallet(); } catch { /* balance refreshes on next focus */ }
      haptics.confirm();
      setStep('done');
      onClaimed?.();
    } finally {
      setBusy(false);
    }
  }
  finishRef.current = finishClaim;

  // Resume-on-return: when the recharge route pops back to us, reveal the modal
  // and, if we were waiting on funds and they have now landed, create the
  // subscription and jump straight to the congrats screen.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      setNavHidden(false);
      if (visible && awaitingFundsRef.current) {
        (async () => {
          try { await refreshWallet(); } catch { /* retried on next focus */ }
          if (!on) return;
          // The ≥₹500 recharge marks the account qualified → land BACK ON THE
          // REVIEW CARD (confirm step) so the member re-reviews the
          // subscription + prices after funding, then taps to start.
          if (await offerQualified()) {
            awaitingFundsRef.current = false;
            setStep('confirm');
          }
        })();
      }
      return () => { on = false; };
    }, [visible, refreshWallet]),
  );

  // "Start shopping" always lands on the products/shop list first.
  function startShopping() {
    if (onStartShopping) { onStartShopping(); return; }
    onClose();
    router.replace('/(tabs)');
  }

  return (
    <>
    <Modal visible={visible && !navHidden && !captureOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
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
            <Serif color={colors.ink} style={{ fontSize: 22, textAlign: 'center', marginTop: 4 }}>
              {step === 'done'
                ? 'Congrats, you are all set'
                : step === 'ineligible'
                  ? 'Trial already started'
                  : step === 'signin'
                    ? 'Sign in to start'
                    : step === 'fund'
                      ? 'Add funds to start'
                      : `Pay ${TRIAL_PAID_DAYS} days, get ${TRIAL_FREE_DAYS} FREE`}
            </Serif>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5, textAlign: 'center', marginTop: 2 }}>
              {step === 'ineligible' || step === 'signin'
                ? 'PYAAS Gold Full Cream · 500 ml fresh every morning'
                : `PYAAS Gold Full Cream · 500 ml daily · ${TRIAL_PAID_DAYS} paid + ${TRIAL_FREE_DAYS} free`}
            </TextBody>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 'intro' ? (
              <Animated.View entering={FadeIn.duration(240)} style={{ gap: spacing.md }}>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Start your daily milk subscription. Pay for your first {TRIAL_PAID_DAYS} days, then the next {TRIAL_FREE_DAYS} days are FREE. Fresh at your door every morning.
                </TextBody>
                {/* The honest funnel explainer — exactly what starting does. */}
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8 }}>
                  <IntroLine icon="cash-outline" text={`First ${TRIAL_PAID_DAYS} days at ${rupee(FREE_PACK_DAILY_PRICE)}/day`} />
                  <IntroLine icon="sparkles" text={`Next ${TRIAL_FREE_DAYS} days FREE 🎉`} />
                  <IntroLine icon="infinite" text={`Then continues at ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet`} />
                  <IntroLine icon="pause-circle" text="Pause anytime" />
                </View>
                <PrimaryButton title="Start my subscription" onPress={() => { haptics.press(); setCaptureOpen(true); }} />
                <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {/* The address step is the shared CD-style AddressCaptureSheet (map
                with search → complete form) — opened from the intro button. */}

            {step === 'confirm' ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: spacing.md }}>
                <TextSemi style={{ fontSize: 16 }}>Confirm your subscription</TextSemi>
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10 }}>
                  <Row icon="cube" label="PYAAS Gold Full Cream Milk" value={`500 ml daily · ${TRIAL_PAID_DAYS} paid + ${TRIAL_FREE_DAYS} FREE`} />
                  <Row icon="location" label="Delivering to" value={savedAddr ? `${savedAddr.line1}${savedAddr.line2 ? ', ' + savedAddr.line2 : ''}, ${savedAddr.city} - ${savedAddr.pincode}` : '—'} />
                  <Row icon="time" label="First pack arrives tomorrow" value={formatDeliveryWindow(DELIVERY_WINDOW)} highlight />
                  <Row icon="wallet" label="Billing" value={`Pay ${TRIAL_PAID_DAYS} days · next ${TRIAL_FREE_DAYS} days FREE · then ${rupee(FREE_PACK_DAILY_PRICE)}/day · pause anytime`} />
                </View>
                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}
                <PrimaryButton title={busy ? 'Starting…' : 'Start my subscription'} loading={busy} onPress={confirm} />
                <Tap haptic={false} onPress={() => setCaptureOpen(true)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Change address</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {step === 'fund' ? (
              /* Prepaid gate: the subscription starts only after the wallet is
                 funded. Adding money routes to recharge, then we resume here. */
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="wallet" size={30} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Almost there. Add {rupee(OFFER_QUALIFY_RECHARGE)} in one recharge and your 2+2 offer unlocks right away. Milk is just {rupee(FREE_PACK_DAILY_PRICE)}/day from your balance, pause anytime.
                </TextBody>
                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}
                <PrimaryButton title={busy ? 'Starting…' : 'Add funds'} loading={busy} onPress={goAddFunds} />
                <Tap haptic={false} onPress={() => setStep('confirm')} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Back</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {step === 'done' ? (
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={34} color={colors.blue} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  {subStarted
                    ? `Congrats! Your PYAAS Gold subscription is live. Pay ${TRIAL_PAID_DAYS} days, get ${TRIAL_FREE_DAYS} free, then ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet. Pause anytime. Your first pack arrives ${formatDeliveryWindow(DELIVERY_WINDOW)} tomorrow.`
                    : `Your first PYAAS Gold pack arrives ${formatDeliveryWindow(DELIVERY_WINDOW)} tomorrow. We will notify you when the rider sets off.`}
                </TextBody>
                <PrimaryButton title="Start shopping" onPress={startShopping} />
              </Animated.View>
            ) : null}

            {step === 'ineligible' ? (
              /* Gate rejected (phone/device already used) — say WHY, promise nothing. */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="gift-outline" size={30} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  {blockReason} You can still get PYAAS Gold every morning. A daily subscription is just {rupee(FREE_PACK_DAILY_PRICE)}/day, pause anytime.
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
                <PrimaryButton title="Sign in" onPress={() => { onClose(); router.replace('/(auth)/sign-in'); }} />
                <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Not now</TextMed>
                </Tap>
              </Animated.View>
            ) : null}
          </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <AddressCaptureSheet visible={captureOpen} onClose={() => setCaptureOpen(false)} onSaved={onAddressSaved} />
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
      .then((show) => { if (cancelled) return; setVisible(show); if (show) openedRef.current = true; })
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

function Field({ label, value, onChangeText, placeholder, keyboardType, maxLength }: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; keyboardType?: 'number-pad'; maxLength?: number }) {
  return (
    <View style={{ gap: 5 }}>
      <TextMed color={colors.inkSoft} style={{ fontSize: 12.5 }}>{label}</TextMed>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMute}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={{ backgroundColor: colors.milk, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }}
      />
    </View>
  );
}

function IntroLine({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={16} color={colors.flameDeep} />
      <TextMed style={{ flex: 1, fontSize: 13, lineHeight: 18 }} color={colors.ink}>{text}</TextMed>
    </View>
  );
}

function Row({ icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: highlight ? colors.flameSoft : colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={15} color={colors.flameDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>{label}</TextBody>
        <TextMed style={{ fontSize: 13.5 }} color={highlight ? colors.flameDeep : colors.ink}>{value}</TextMed>
      </View>
    </View>
  );
}
