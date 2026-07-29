import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { getDeviceCoords, setAddressCoords } from '../lib/location';
import { addAddress } from '../lib/api';
import { claimFreePack, shouldShowFreePack, snoozeFreePack, FREE_PACK_DAILY_PRICE, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../lib/freePack';
import { formatDeliveryWindow } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { useWallet } from '../store/wallet';

const TAAZA = require('../assets/products/pyaas-toned-pouch.png');
const DELIVERY_WINDOW = '06:00-07:00'; // matches placeOrder's stamped window

// 'done' is reached ONLY on a real successful claim. A signed-out member lands
// on 'signin'; a failed gate (phone/device already claimed) lands on
// 'ineligible' with the gate's reason — never a false delivery promise.
type Step = 'intro' | 'address' | 'confirm' | 'done' | 'signin' | 'ineligible';

/**
 * "Start your subscription" onboarding — the 3 + 3 trial funnel. Claiming
 * auto-starts a daily taaza-500ml subscription from tomorrow and opens the
 * six-day trial: days 1–3 are PAID (₹29/day from the wallet), days 4–6 are
 * FREE, and from then on it CONTINUES at ₹29/day until paused/cancelled. The
 * sheet copy says exactly that — pay 3, get 3 free, no surprise charges. Walks
 * the user from an intro card -> delivery address (typed or from GPS) -> a
 * confirmation box -> a delivery-window promise. Fires on first launch
 * (ClaimPackGate), from the home claim card and when a member starts their
 * PYAAS Plus trial. All money movement is in lib/freePack (idempotent).
 */
export function ClaimPackFlow({ visible, onClose, onClaimed, onStartShopping }: { visible: boolean; onClose: () => void; onClaimed?: () => void; onStartShopping?: () => void }) {
  const { profile } = useAuth();
  const router = useRouter();
  const refreshWallet = useWallet((s) => s.refresh);
  const [step, setStep] = useState<Step>('intro');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  // Synchronous re-entry guard: setBusy only disables the button after a
  // re-render, so a fast double-tap would run confirm() twice without this ref.
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const [subStarted, setSubStarted] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  // Reset to a clean intro each time it opens (so a VIP re-open never prefills
  // the previous address).
  useEffect(() => {
    if (visible) {
      setStep('intro');
      setErr('');
      setLine1('');
      setCity('');
      setPincode('');
      setCoords(null);
      setSubStarted(false);
      setBlockReason('');
    }
  }, [visible]);

  const canContinue = line1.trim().length >= 4 && pincode.trim().replace(/\D/g, '').length >= 6;

  async function useMyLocation() {
    setLocBusy(true); setErr('');
    const c = await getDeviceCoords();
    setLocBusy(false);
    if (!c) { setErr('Location is off. Allow it in settings, or just type your address below.'); return; }
    setCoords(c);
    if (!city) setCity('Detected from GPS');
    haptics.success();
  }

  async function confirm() {
    if (busyRef.current) return; // synchronous double-tap guard
    busyRef.current = true;
    setBusy(true); setErr('');
    try {
      const phone = profile?.phone ?? '';
      // No signed-in phone → nothing to claim against. Never show the delivery
      // promise; send the member to sign in instead.
      if (!phone) { setStep('signin'); return; }
      const addr = await addAddress({ label: 'Home', line1: line1.trim(), line2: null, city: city.trim() || 'Lucknow', pincode: pincode.trim().replace(/\D/g, ''), is_default: true });
      if (coords) { try { await setAddressCoords(addr.id, coords); } catch { /* non-fatal */ } }
      // Claim = promo credit + auto-started daily subscription (+ test top-up).
      // The result decides the screen: only a REAL success reaches 'done'.
      let r: Awaited<ReturnType<typeof claimFreePack>>;
      try {
        r = await claimFreePack(phone);
      } catch (e: any) {
        // Hard failure (signed out mid-flow / storage error): nothing was
        // claimed, so it stays claimable — surface it and stay on this step.
        if (/not signed in/i.test(String(e?.message ?? ''))) { setStep('signin'); return; }
        setErr(e?.message ?? 'Could not claim just now. Please try again.');
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
    } catch (e: any) {
      setErr(e?.message ?? 'Could not confirm just now. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', maxHeight: '88%', ...shadow.card }}>
          {/* Flame header with the Taaza pack shot */}
          <View style={{ backgroundColor: colors.flameDeep, alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: 12, right: 12 }}>
              <Tap haptic={false} onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.white} />
              </Tap>
            </View>
            <Image source={TAAZA} style={{ width: 120, height: 120 }} contentFit="contain" />
            <Serif color={colors.white} style={{ fontSize: 22, textAlign: 'center', marginTop: 4 }}>
              {step === 'done'
                ? 'All set, see you at dawn'
                : step === 'ineligible'
                  ? 'Trial already started'
                  : step === 'signin'
                    ? 'Sign in to start'
                    : `Pay ${TRIAL_PAID_DAYS} days, get ${TRIAL_FREE_DAYS} FREE`}
            </Serif>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 2 }}>
              {step === 'ineligible' || step === 'signin'
                ? 'PYAAS Taaza · 500 ml fresh every morning'
                : `PYAAS Taaza · 500 ml daily · ${TRIAL_PAID_DAYS} paid + ${TRIAL_FREE_DAYS} free`}
            </TextBody>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 'intro' ? (
              <Animated.View entering={FadeIn.duration(240)} style={{ gap: spacing.md }}>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Start your daily milk subscription — pay for your first {TRIAL_PAID_DAYS} days, then the next {TRIAL_FREE_DAYS} days are FREE. Fresh at your door every morning.
                </TextBody>
                {/* The honest funnel explainer — exactly what starting does. */}
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8 }}>
                  <IntroLine icon="cash-outline" text={`First ${TRIAL_PAID_DAYS} days at ${rupee(FREE_PACK_DAILY_PRICE)}/day`} />
                  <IntroLine icon="sparkles" text={`Next ${TRIAL_FREE_DAYS} days FREE 🎉`} />
                  <IntroLine icon="infinite" text={`Then continues at ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet`} />
                  <IntroLine icon="pause-circle" text="Pause anytime" />
                </View>
                <PrimaryButton title="Start my subscription" onPress={() => { haptics.press(); setStep('address'); }} />
                <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {step === 'address' ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: spacing.sm }}>
                <TextSemi style={{ fontSize: 16 }}>Where should we deliver it?</TextSemi>
                <Tap onPress={useMyLocation} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: coords ? colors.blueSoft : colors.cream, borderRadius: radius.md, borderWidth: 1, borderColor: coords ? colors.blue : colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
                  {locBusy ? <ActivityIndicator color={colors.flameDeep} /> : <Ionicons name={coords ? 'checkmark-circle' : 'locate'} size={18} color={coords ? colors.blue : colors.flameDeep} />}
                  <TextMed style={{ flex: 1, fontSize: 14 }} color={colors.ink}>{coords ? 'Location captured' : 'Use my current location'}</TextMed>
                  {!coords ? <Ionicons name="chevron-forward" size={16} color={colors.inkMute} /> : null}
                </Tap>
                <Field label="Flat / house, area" value={line1} onChangeText={setLine1} placeholder="e.g. 12 Green Park, Gomti Nagar" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1.4 }}><Field label="City" value={city} onChangeText={setCity} placeholder="Lucknow" /></View>
                  <View style={{ flex: 1 }}><Field label="Pincode" value={pincode} onChangeText={setPincode} placeholder="226010" keyboardType="number-pad" maxLength={6} /></View>
                </View>
                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}
                <PrimaryButton title="Continue" disabled={!canContinue} onPress={() => { haptics.press(); setStep('confirm'); }} />
              </Animated.View>
            ) : null}

            {step === 'confirm' ? (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: spacing.md }}>
                <TextSemi style={{ fontSize: 16 }}>Confirm your subscription</TextSemi>
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10 }}>
                  <Row icon="cube" label="PYAAS Taaza Toned Milk" value={`500 ml daily · ${TRIAL_PAID_DAYS} paid + ${TRIAL_FREE_DAYS} FREE`} />
                  <Row icon="location" label="Delivering to" value={`${line1.trim()}${city ? ', ' + city.trim() : ''}${pincode ? ' - ' + pincode.trim().replace(/\D/g, '') : ''}`} />
                  <Row icon="time" label="First pack arrives tomorrow" value={formatDeliveryWindow(DELIVERY_WINDOW)} highlight />
                  <Row icon="wallet" label="Billing" value={`Pay ${TRIAL_PAID_DAYS} days · next ${TRIAL_FREE_DAYS} days FREE · then ${rupee(FREE_PACK_DAILY_PRICE)}/day · pause anytime`} />
                </View>
                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}
                <PrimaryButton title={busy ? 'Starting…' : 'Start my subscription'} loading={busy} onPress={confirm} />
                <Tap haptic={false} onPress={() => setStep('address')} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Change address</TextMed>
                </Tap>
              </Animated.View>
            ) : null}

            {step === 'done' ? (
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={34} color={colors.blue} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Your first PYAAS Taaza pack arrives {formatDeliveryWindow(DELIVERY_WINDOW)} tomorrow.
                  {subStarted
                    ? ` Your daily subscription is LIVE — pay your first ${TRIAL_PAID_DAYS} days, then ${TRIAL_FREE_DAYS} days FREE 🎉, then ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet. Pause anytime from Subscriptions.`
                    : ' We will notify you when the rider sets off.'}
                </TextBody>
                <PrimaryButton title="Start shopping" onPress={onStartShopping ?? onClose} />
              </Animated.View>
            ) : null}

            {step === 'ineligible' ? (
              /* Gate rejected (phone/device already used) — say WHY, promise nothing. */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="gift-outline" size={30} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  {blockReason} You can still get PYAAS Taaza every morning — a daily subscription is just {rupee(FREE_PACK_DAILY_PRICE)}/day, pause anytime.
                </TextBody>
                <PrimaryButton title="Start shopping" onPress={onStartShopping ?? onClose} />
              </Animated.View>
            ) : null}

            {step === 'signin' ? (
              /* No signed-in phone — the claim is per phone number, so sign in first. */
              <Animated.View entering={FadeInDown.duration(300)} style={{ gap: spacing.md, alignItems: 'center' }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person-circle-outline" size={32} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Your trial is tied to your phone number. Sign in (or finish setting up your profile) and come back — the offer will be waiting.
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
  );
}

/** Launch trigger: shows the claim flow once per device to an eligible member,
 *  reusing the free-pack gate (shouldShowFreePack / markSeen). */
export function ClaimPackGate() {
  const { profile } = useAuth();
  const router = useRouter();
  const phone = profile?.phone ?? '';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let on = true;
    if (phone) shouldShowFreePack(phone).then((show) => { if (on) setVisible(show); });
    return () => { on = false; };
  }, [phone]);

  // "Maybe later" / X: SNOOZE (re-offer next session) instead of losing the
  // free pack forever. A successful claim marks it seen internally, so a claimed
  // pack still never re-offers.
  function close() { void snoozeFreePack(); setVisible(false); }
  // "Start shopping" deterministically lands on the Shop tab (a no-op if already there).
  function startShopping() { close(); router.replace('/(tabs)'); }
  return <ClaimPackFlow visible={visible} onClose={close} onStartShopping={startShopping} />;
}

function PrimaryButton({ title, onPress, disabled, loading }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Tap onPress={disabled || loading ? undefined : onPress} style={{ height: 52, borderRadius: radius.pill, backgroundColor: disabled ? colors.line : colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled ? 0.7 : 1, ...shadow.soft }}>
      {loading ? <ActivityIndicator color={colors.white} /> : null}
      <TextSemi color={colors.white} style={{ fontSize: 16 }}>{title}</TextSemi>
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
