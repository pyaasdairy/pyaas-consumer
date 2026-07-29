import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Serif, Tap, Stepper } from './ui';
import { haptics } from '../lib/haptics';
import { createSubscription, type Frequency } from '../lib/subscriptions';
import { TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../lib/trial';
import { isBackendConfigured } from '../lib/apiClient';
import { currentMandate, createMandate } from '../lib/autopay';
import { tomorrowISO, addDaysISO, parseISO, formatShort } from '../lib/dates';
import { useWallet } from '../store/wallet';
import type { Product } from '../constants/products';

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FREQS: { key: Frequency; label: string; sub: string }[] = [
  { key: 'daily', label: 'Daily', sub: 'Every morning' },
  { key: 'alternate', label: 'Alternate', sub: 'Every 2nd day' },
  { key: 'weekly', label: 'Weekly', sub: 'Once a week' },
];

export type SubscribeResult = { startDate: string; qty: number; freq: Frequency; total: number; saved: number };

/**
 * PRODUCT SUBSCRIBE SHEET — a clean pink/white bottom sheet to start (or edit)
 * a milk subscription: frequency (Daily / Alternate / Weekly), a quantity
 * stepper and a start date (tomorrow default, 7-day chips). It carries the
 * "3 paid → 3 free" trial line and the estimated first charge, and on confirm
 * writes the subscription (createSubscription), anchors the trial and — in
 * backend mode only — sets up the UPI-AutoPay mandate seam for auto-renew.
 *
 * The sheet OWNS the subscription write; the parent routes onward from
 * onConfirmed (e.g. to the order-confirmed screen).
 */
export function SubscribeSheet({
  visible,
  product,
  unitPrice,
  savedPer = 0,
  initialQty = 1,
  initialFreq = 'daily',
  onClose,
  onConfirmed,
}: {
  visible: boolean;
  product: Product;
  unitPrice: number;
  savedPer?: number;
  initialQty?: number;
  initialFreq?: Frequency;
  onClose: () => void;
  onConfirmed: (r: SubscribeResult) => void;
}) {
  const refreshWallet = useWallet((s) => s.refresh);
  const [freq, setFreq] = useState<Frequency>(initialFreq);
  const [qty, setQty] = useState(initialQty);
  const [startDate, setStartDate] = useState(tomorrowISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Synchronous double-tap guard (setBusy only disables after a re-render).
  const busyRef = useRef(false);

  // Reset to the caller's seed each time it opens.
  useEffect(() => {
    if (visible) {
      setFreq(initialFreq === 'one_time' || initialFreq === 'custom' ? 'daily' : initialFreq);
      setQty(Math.max(1, initialQty));
      setStartDate(tomorrowISO());
      setErr('');
    }
  }, [visible, initialFreq, initialQty]);

  const perDelivery = unitPrice * qty;

  async function confirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    try {
      // Local (no-backend) mode keeps the prepaid gate: the wallet must cover the
      // first delivery. In backend mode the wallet is debited on delivery, so no
      // upfront funds are required to start.
      if (!isBackendConfigured()) {
        await refreshWallet();
        const bal = useWallet.getState().balance;
        if (bal < perDelivery) {
          setErr(`Your wallet has ${rupee(bal)}. Add ${rupee(perDelivery - bal)} to start this subscription.`);
          return;
        }
      }
      await createSubscription({
        productId: product.id,
        variant: product.variant,
        qty,
        unitPrice,
        frequency: freq,
        startDate,
      });
      // The 3+3 trial itself is owned by the claim funnel + backend (GET
      // /consumer/trial/me), not minted here — so a direct subscribe never shows
      // a "FREE" phase without the matching free-day handling behind it.
      // Auto-renew mandate seam (UPI AutoPay): backend only, best-effort. Never
      // blocks the subscription — a failed/absent mandate just means manual
      // top-ups, exactly as before.
      if (isBackendConfigured()) {
        try {
          const live = await currentMandate();
          if (!live) await createMandate({ maxAmount: Math.max(500, Math.ceil(perDelivery) * 31) });
        } catch { /* seam — non-fatal */ }
      }
      haptics.confirm();
      onConfirmed({ startDate, qty, freq, total: perDelivery, saved: savedPer * qty });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not start your subscription. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        {/* Tap-out backdrop */}
        <Tap haptic={false} onPress={onClose} style={{ flex: 1 }} scaleTo={1}>
          <View style={{ flex: 1 }} />
        </Tap>
        <Animated.View entering={FadeInDown.duration(260)} style={{ backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
          {/* Grab handle */}
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <TextBody style={{ fontSize: 11.5, letterSpacing: 0.4 }} color={colors.flameDeep}>SUBSCRIBE</TextBody>
                <Serif style={{ fontSize: 21 }} numberOfLines={1}>{product.name}</Serif>
                <TextBody style={{ fontSize: 12.5 }}>{product.variant} · {rupee(unitPrice)}</TextBody>
              </View>
              <Tap haptic={false} onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={colors.ink} />
              </Tap>
            </View>

            {/* Frequency */}
            <View style={{ gap: 8 }}>
              <TextSemi style={{ fontSize: 14.5 }}>How often?</TextSemi>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {FREQS.map((f) => {
                  const active = freq === f.key;
                  return (
                    <Tap key={f.key} onPress={() => { haptics.press(); setFreq(f.key); }} style={{ flex: 1 }}>
                      <View style={{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.flameDeep : colors.line, backgroundColor: active ? colors.flameSoft : colors.white, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4 }}>
                        <TextSemi style={{ fontSize: 13.5 }} color={active ? colors.flameDeep : colors.ink}>{f.label}</TextSemi>
                        <TextBody style={{ fontSize: 10, textAlign: 'center' }}>{f.sub}</TextBody>
                      </View>
                    </Tap>
                  );
                })}
              </View>
            </View>

            {/* Quantity */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TextSemi style={{ fontSize: 14.5 }}>Quantity per delivery</TextSemi>
              <Stepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} max={10} />
            </View>

            {/* Start date · tomorrow default, 7-day chips */}
            <View style={{ gap: 8 }}>
              <TextSemi style={{ fontSize: 14.5 }}>Start date</TextSemi>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 6 }}>
                {Array.from({ length: 7 }, (_, i) => {
                  const iso = addDaysISO(tomorrowISO(), i);
                  const d = parseISO(iso);
                  const selected = iso === startDate;
                  return (
                    <Tap
                      key={iso}
                      haptic={false}
                      onPress={() => { haptics.press(); setStartDate(iso); }}
                      style={{
                        width: 54,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 9,
                        borderRadius: radius.lg,
                        backgroundColor: selected ? colors.flameDeep : colors.white,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.flameDeep : colors.line,
                        ...shadow.soft,
                      }}
                    >
                      <TextBody style={{ fontSize: 10.5 }} color={selected ? 'rgba(255,255,255,0.92)' : colors.inkMute}>
                        {i === 0 ? 'Tmrw' : WD_SHORT[d.getDay()]}
                      </TextBody>
                      <Serif style={{ fontSize: 19 }} color={selected ? colors.white : colors.ink}>{d.getDate()}</Serif>
                    </Tap>
                  );
                })}
              </ScrollView>
            </View>

            {/* 3 paid → 3 free trial line */}
            <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.flame, padding: spacing.md }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={17} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <TextSemi style={{ fontSize: 13.5 }} color={colors.flameDeep}>New members: pay {TRIAL_PAID_DAYS} days, get {TRIAL_FREE_DAYS} FREE 🎉</TextSemi>
                <TextBody style={{ fontSize: 11.5, lineHeight: 15 }}>Days 1–{TRIAL_PAID_DAYS} paid, days {TRIAL_PAID_DAYS + 1}–{TRIAL_PAID_DAYS + TRIAL_FREE_DAYS} free, then it just continues. Pause anytime.</TextBody>
              </View>
            </Animated.View>

            {/* Estimated first charge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.wash, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
              <View>
                <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>Est. per-delivery charge</TextBody>
                <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>Charged after delivery · pause anytime</TextBody>
              </View>
              <TextSemi style={{ fontSize: 18, ...tabular }} color={colors.flameDeep}>{rupee(perDelivery)}</TextSemi>
            </View>

            {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}

            {/* Confirm */}
            <Tap onPress={busy ? undefined : confirm} style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="checkmark-circle" size={19} color={colors.white} />}
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>{busy ? 'Starting…' : `Start subscription · ${rupee(perDelivery)}/delivery`}</TextSemi>
            </Tap>
            <TextBody style={{ fontSize: 11, textAlign: 'center' }} color={colors.inkMute}>Paid from your PYAAS Wallet · pause, skip or cancel anytime.</TextBody>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
