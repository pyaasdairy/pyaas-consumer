import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../lib/theme';
import { TextBody, TextSemi, Serif, Tap, Stepper } from './ui';
import { haptics } from '../lib/haptics';
import { createSubscription, minWalletToStart, NEEDS_EXACT_LOCATION, type Frequency } from '../lib/subscriptions';
import { attachTrialAfterSubscribe, offerCompleted, offerQualified, OFFER_QUALIFY_RECHARGE, OFFER_SUGGESTED_RECHARGE, FREE_PACK_PRODUCT_ID } from '../lib/freePack';
import { purchasesUnlocked, WALLET_UNLOCK_TARGET } from '../lib/walletGate';
import { deliveryFeeFor } from '../lib/api';
import { hasExactLocation } from '../lib/location';
import { useUserLocation } from '../lib/userLocation';
import { AddressCaptureSheet } from './AddressCapture';
import { listAddresses, type Address } from '../lib/api';
import { isBackendConfigured } from '../lib/apiClient';
import { currentMandate, createMandate } from '../lib/autopay';
import { tomorrowISO, addDaysISO, parseISO } from '../lib/dates';
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
  initialStartDate,
  onClose,
  onConfirmed,
}: {
  visible: boolean;
  product: Product;
  unitPrice: number;
  savedPer?: number;
  initialQty?: number;
  initialFreq?: Frequency;
  initialStartDate?: string;
  onClose: () => void;
  onConfirmed: (r: SubscribeResult) => void;
}) {
  const router = useRouter();
  const refreshWallet = useWallet((s) => s.refresh);
  const setFromPin = useUserLocation((s) => s.setFromPin);
  const [freq, setFreq] = useState<Frequency>(initialFreq);
  const [qty, setQty] = useState(initialQty);
  const [startDate, setStartDate] = useState(tomorrowISO());
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [err, setErr] = useState('');
  // ONE-TAP SUBSCRIBE: the single "Subscribe · ₹X" button runs the gate chain
  // (address → funds) and creates immediately when everything passes; a short
  // wallet bounces to recharge instead. The price beside the button is the
  // fee-INCLUSIVE per-delivery charge, so the amount shown at the moment of
  // commitment is the amount actually debited — that transparency is what
  // replaced the old review step, and it must stay on the button.
  // Synchronous double-tap guard (setBusy only disables after a re-render).
  const busyRef = useRef(false);

  // Reset to the caller's seed each time it opens.
  useEffect(() => {
    if (visible) {
      setFreq(initialFreq === 'one_time' || initialFreq === 'custom' ? 'daily' : initialFreq);
      setQty(Math.max(1, initialQty));
      // Honour the caller's picked start date (from the product page) instead of
      // silently resetting it to tomorrow; fall back to tomorrow when none/invalid.
      setStartDate(initialStartDate && initialStartDate >= tomorrowISO() ? initialStartDate : tomorrowISO());
      setErr('');
    }
  }, [visible, initialFreq, initialQty, initialStartDate]);

  // The subscription sweep charges subtotal + delivery fee per delivery
  // (lib/subscriptionSweep.ts). Quoting the items alone understated a daily ₹35
  // subscription by ₹15 EVERY day — the member confirmed ₹35 and was debited ₹50.
  // Quote what we actually take, and show the fee on its own line below.
  const itemsSubtotal = unitPrice * qty;
  const perDeliveryFee = deliveryFeeFor(itemsSubtotal);
  const perDelivery = itemsSubtotal + perDeliveryFee;

  const hasPin = (a: Address) => {
    const g = a as unknown as { lat?: number | null; lng?: number | null };
    return g.lat != null && g.lng != null;
  };

  // Recharge hop with the full selections carried in returnTo, so the funded
  // member lands back on THIS product with the sheet re-opened.
  function goRecharge(min: number, amount: number, reason: string) {
    const rt = `/product/${product.id}?qty=${qty}&freq=${freq}&start=${startDate}&subscribe=1`;
    const qs = `min=${min}&amount=${amount}&returnTo=${encodeURIComponent(rt)}&reason=${encodeURIComponent(reason)}`;
    haptics.press();
    onClose();
    router.push(`/recharge?${qs}`);
  }

  // THE GATE CHAIN (strict order): 1) ADDRESS — a SAVED address with its map
  // pin (saved rows only; a loose local GPS pin never counts) → 2) FUNDS —
  // the qualifying recharge for a still-open 2+2 gold candidate, else the
  // unlock/2-day-cover top-up, ONLY when actually short → 3) CREATE. A member
  // with address + funds subscribes in this one tap, no interstitials.
  async function startSubscribe() {
    haptics.press();
    setErr('');
    // 1) ADDRESS FIRST.
    const addrs = await listAddresses().catch(() => [] as Address[]);
    const pick = addrs.find((a) => a.is_default && hasPin(a)) ?? addrs.find(hasPin);
    if (!pick) {
      setMapOpen(true); // capture → onAddressSaved resumes this chain
      return;
    }
    // 2) FUNDS SECOND.
    await refreshWallet();
    const bal = useWallet.getState().balance;
    // 2+2 candidate on the offer SKU who hasn't done the one-time qualifying
    // recharge → that recharge IS the requirement (at a time — balance level is
    // irrelevant to qualification). The floor to avail is ₹99, but we PRESELECT
    // ₹500 (min=floor, amount=suggested), so ₹99 unlocks yet most fund a few
    // days of milk at once.
    if (product.id === FREE_PACK_PRODUCT_ID && freq === 'daily' && !(await offerCompleted()) && !(await offerQualified())) {
      goRecharge(OFFER_QUALIFY_RECHARGE, OFFER_SUGGESTED_RECHARGE, 'to unlock your 2+2 offer');
      return;
    }
    const unlocked = await purchasesUnlocked(bal);
    const need = Math.max(minWalletToStart(perDelivery), unlocked ? 0 : WALLET_UNLOCK_TARGET);
    if (bal < need) {
      const short = Math.max(1, Math.ceil(need - bal));
      goRecharge(short, Math.max(100, Math.ceil(short / 50) * 50), 'to start this subscription');
      return;
    }
    // 3) Everything resolved → create right now (confirm re-guards internally
    // against races, then plays the confirm haptic + success hand-off).
    await confirm();
  }

  async function confirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    try {
      // BACKSTOP GATES (the review chain already ran these; a race — address
      // deleted mid-flow, balance spent from another screen — re-guards here).
      // Address: a SAVED row with its map pin; a loose local GPS pin never counts.
      const addrs = await listAddresses().catch(() => [] as Address[]);
      if (!addrs.some(hasPin)) {
        haptics.press();
        setMapOpen(true);
        return;
      }
      // PREPAID START GATE (BOTH modes): a subscription can NEVER begin unless the
      // wallet already covers at least the minimum days of the per-delivery
      // charge. If it is short we create NOTHING and force the member to the wallet
      // recharge screen first, returning here once funded.
      await refreshWallet();
      const bal = useWallet.getState().balance;
      // ₹500 GATE: a still-locked account must fund the wallet to the unlock
      // target before ANY purchase, subscriptions included.
      const unlocked = await purchasesUnlocked(bal);
      const need = Math.max(minWalletToStart(perDelivery), unlocked ? 0 : WALLET_UNLOCK_TARGET);
      if (bal < need) {
        const short = Math.max(1, Math.ceil(need - bal));
        const amount = Math.max(100, Math.ceil(short / 50) * 50);
        // Carry the member's chosen qty/frequency/start-date (and a flag to
        // re-open this sheet) through the recharge round-trip, so a funded member
        // resumes with their exact selections instead of a reset 1/daily/tomorrow.
        const rt = `/product/${product.id}?qty=${qty}&freq=${freq}&start=${startDate}&subscribe=1`;
        // Same encoding as product/[id].tsx goRecharge (encodeURIComponent → %20),
        // so the returnTo + reason survive expo-router's param parser intact.
        const qs = `min=${short}&amount=${amount}&returnTo=${encodeURIComponent(rt)}&reason=${encodeURIComponent('to start this subscription')}`;
        haptics.press();
        onClose();
        router.push(`/recharge?${qs}`);
        return;
      }
      await createSubscription({
        productId: product.id,
        variant: product.variant,
        qty,
        unitPrice,
        frequency: freq,
        startDate,
      });
      // 2+2 HOOK: when THIS subscribe is the offer SKU (gold, daily) and the
      // member is a qualified candidate, attach the trial (claim + day-1
      // anchor) — the popup funnel routes here instead of owning its own
      // create path. Silent no-op otherwise; never blocks the subscription.
      try { await attachTrialAfterSubscribe(product.id, freq); } catch { /* non-fatal */ }
      // Auto-renew mandate seam (UPI AutoPay): backend only, best-effort. Never
      // blocks the subscription — a failed/absent mandate just means manual
      // top-ups, exactly as before.
      // AutoPay mandate seam is DEV-ONLY: in release the whole AutoPay feature
      // is hidden, so silently registering a gateway mandate the member can
      // never see or cancel would be exactly the invisible-recurring pattern
      // the audit flagged. Re-enable together with the real UPI checkout.
      if (__DEV__ && isBackendConfigured()) {
        try {
          const live = await currentMandate();
          if (!live) await createMandate({ maxAmount: Math.max(500, Math.ceil(perDelivery) * 31) });
        } catch { /* seam — non-fatal */ }
      }
      haptics.confirm();
      onConfirmed({ startDate, qty, freq, total: perDelivery, saved: savedPer * qty });
    } catch (e: any) {
      // Defensive: if the backstop still fires (e.g. a race), open the map instead
      // of showing a raw error.
      if (e?.code === NEEDS_EXACT_LOCATION || e?.message === NEEDS_EXACT_LOCATION) { setMapOpen(true); return; }
      setErr(e?.message ?? 'Could not start your subscription. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Complete address saved (pin + form + preferences) → resume the GATE CHAIN
  // (funds next if short, else the subscription is created).
  function onAddressSaved() {
    setMapOpen(false);
    void startSubscribe();
  }

  return (
    <>
    <Modal visible={visible && !mapOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
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
              <TextSemi style={{ fontSize: 14.5 }}>Quantity</TextSemi>
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

            {/* The "first 2 days FREE" welcome trial is granted ONLY through the
                dedicated claim funnel (the Home offer → ClaimPackFlow), which mints
                the promo credit + anchors the trial. A plain subscribe here does NOT
                grant free days, so we never promise them — that would be a false
                money claim (the buyer would be charged full price for all 4 days). */}

            {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}

            {/* ONE TAP: gates (address → funds) then create. The fee-inclusive
                amount lives ON the button — the price at the moment of
                commitment is the price actually debited. A short wallet routes
                to recharge; nothing is created until everything passes. */}
            <Tap onPress={busy ? undefined : () => { void startSubscribe(); }} style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="checkmark-circle" size={19} color={colors.white} />}
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>{busy ? 'Starting…' : `Subscribe · ${rupee(perDelivery)}`}</TextSemi>
            </Tap>
            <TextBody style={{ fontSize: 11, textAlign: 'center', lineHeight: 16 }} color={colors.inkMute}>
              Nothing is charged now. Each delivery is billed from your PYAAS Wallet on the morning it goes out. Pause, skip or cancel anytime.
            </TextBody>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
    <AddressCaptureSheet visible={mapOpen} onClose={() => setMapOpen(false)} onSaved={onAddressSaved} />
    </>
  );
}
