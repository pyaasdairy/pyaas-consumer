import React, { useEffect, useState } from 'react';
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
import { claimFreePack, shouldShowFreePack, snoozeFreePack, FREE_PACK_DAILY_PRICE, FREE_PACK_DAYS } from '../lib/freePack';
import { formatDeliveryWindow } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { useWallet } from '../store/wallet';

const TAAZA = require('../assets/products/taaza.png');
const DELIVERY_WINDOW = '06:00-07:00'; // matches placeOrder's stamped window

type Step = 'intro' | 'address' | 'confirm' | 'done';

/**
 * "Claim my pack" onboarding — the subscription funnel. Claiming now grants
 * FREE 500 ml daily milk for 2 days (a ₹58 promo credit) AND auto-starts a
 * daily taaza-500ml subscription from tomorrow: days 1–2 ride the promo
 * credit, from day 3 the wallet pays ₹29/day and the subscription CONTINUES
 * until paused/cancelled. The sheet copy says exactly that — no surprise
 * charges. Walks the user from an intro card -> delivery address (typed or
 * from GPS) -> a confirmation box -> a delivery-window promise. Fires on first
 * launch (ClaimPackGate), from the home claim card and when a member starts
 * their PYAAS Plus trial. All money movement is in lib/freePack (idempotent).
 */
export function ClaimPackFlow({ visible, onClose, onClaimed, onStartShopping }: { visible: boolean; onClose: () => void; onClaimed?: () => void; onStartShopping?: () => void }) {
  const { profile } = useAuth();
  const refreshWallet = useWallet((s) => s.refresh);
  const [step, setStep] = useState<Step>('intro');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [subStarted, setSubStarted] = useState(false);

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
    setBusy(true); setErr('');
    try {
      const addr = await addAddress({ label: 'Home', line1: line1.trim(), line2: null, city: city.trim() || 'Lucknow', pincode: pincode.trim().replace(/\D/g, ''), is_default: true });
      if (coords) { try { await setAddressCoords(addr.id, coords); } catch { /* non-fatal */ } }
      const phone = profile?.phone ?? '';
      // Claim = promo credit + auto-started daily subscription (+ test top-up).
      if (phone) {
        try {
          const r = await claimFreePack(phone);
          setSubStarted(r.ok && !!r.subscriptionId);
          await refreshWallet();
        } catch { /* already claimed / non-fatal */ }
      }
      haptics.confirm();
      setStep('done');
      onClaimed?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not confirm just now. Please try again.');
    } finally { setBusy(false); }
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
              {step === 'done' ? 'All set, see you at dawn' : `${FREE_PACK_DAYS} mornings of free milk`}
            </Serif>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 2 }}>
              PYAAS Taaza · 500 ml daily · first {FREE_PACK_DAYS} days on us
            </TextBody>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 'intro' ? (
              <Animated.View entering={FadeIn.duration(240)} style={{ gap: spacing.md }}>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  Welcome to PYAAS. FREE 500 ml daily pack for {FREE_PACK_DAYS} days, fresh at your door every morning.
                </TextBody>
                {/* The honest funnel explainer — exactly what claiming does. */}
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8 }}>
                  <IntroLine icon="gift" text={`FREE 500 ml daily pack for ${FREE_PACK_DAYS} days`} />
                  <IntroLine icon="infinite" text={`From day 3 your subscription continues at ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet`} />
                  <IntroLine icon="pause-circle" text="Pause anytime" />
                </View>
                <PrimaryButton title={`Claim my ${FREE_PACK_DAYS} free days`} onPress={() => { haptics.press(); setStep('address'); }} />
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
                <TextSemi style={{ fontSize: 16 }}>Confirm your free pack</TextSemi>
                <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10 }}>
                  <Row icon="cube" label="PYAAS Taaza Toned Milk" value={`500 ml daily · first ${FREE_PACK_DAYS} days FREE`} />
                  <Row icon="location" label="Delivering to" value={`${line1.trim()}${city ? ', ' + city.trim() : ''}${pincode ? ' - ' + pincode.trim().replace(/\D/g, '') : ''}`} />
                  <Row icon="time" label="First pack arrives tomorrow" value={formatDeliveryWindow(DELIVERY_WINDOW)} highlight />
                  <Row icon="wallet" label="From day 3" value={`Subscription continues at ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet · pause anytime`} />
                </View>
                {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}
                <PrimaryButton title={busy ? 'Confirming…' : 'Confirm my free pack'} loading={busy} onPress={confirm} />
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
                  Your first free PYAAS Taaza pack arrives {formatDeliveryWindow(DELIVERY_WINDOW)} tomorrow.
                  {subStarted
                    ? ` Your daily subscription is LIVE — the first ${FREE_PACK_DAYS} mornings are free, then ${rupee(FREE_PACK_DAILY_PRICE)}/day from your wallet. Pause anytime from Subscriptions.`
                    : ' We will notify you when the rider sets off.'}
                </TextBody>
                <PrimaryButton title="Start shopping" onPress={onStartShopping ?? onClose} />
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
