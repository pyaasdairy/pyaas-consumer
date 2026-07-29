import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Button, BackButton, Stepper } from '../components/ui';
import { ShineSweep } from '../components/Fx';
import { haptics } from '../lib/haptics';
import { useCart } from '../store/cart';
import { useWallet } from '../store/wallet';
import { placeOrder, listAddresses, deliveryFeeFor, FREE_DELIVERY_OVER } from '../lib/api';
import { useServiceability, joinWaitlist } from '../lib/serviceability';
import { useAuth } from '../lib/auth';

/**
 * CART → WALLET-FIRST CHECKOUT
 * ---------------------------
 * A Country-Delight-style one-time cart that pays from the PYAAS wallet:
 *   subtotal + delivery fee = total  →  "To pay from wallet".
 * If the wallet covers the total → place the order (existing placeOrder; the
 * backend debits on delivery, local mode debits now). If it's short → a single
 * "Recharge ₹X to continue" step routes to /recharge and returns here. Blocked
 * cleanly when the address is out of the serving zone.
 */
export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);

  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);

  const serviceable = useServiceability((s) => s.serviceable);
  const storeName = useServiceability((s) => s.storeName);
  const checkSvc = useServiceability((s) => s.check);

  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState('');
  const [waitlisted, setWaitlisted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshWallet();
      void checkSvc();
    }, [refreshWallet, checkSvc])
  );

  const hasOutOfStock = lines.some((l) => l.outOfStock);
  const orderable = lines.filter((l) => !l.outOfStock);
  // Bill is over ORDERABLE lines only — out-of-stock items are never charged.
  const subtotal = orderable.reduce((sum, l) => sum + l.price * l.qty, 0);
  const delivery = deliveryFeeFor(subtotal);
  const total = subtotal + delivery;
  const short = Math.max(0, total - balance);
  const blocked = serviceable === false;

  function goRecharge() {
    haptics.press();
    // Snap the shortfall up to a clean ₹50 step (min ₹100) for the grid.
    const snap = Math.max(100, Math.ceil(short / 50) * 50);
    const qs = new URLSearchParams({
      min: String(Math.ceil(short)),
      amount: String(snap),
      returnTo: '/cart',
      reason: 'to place your order',
    }).toString();
    router.push(`/recharge?${qs}`);
  }

  async function joinZoneWaitlist() {
    const s = useServiceability.getState();
    try {
      await joinWaitlist({
        phone: (profile as any)?.phone ?? null,
        lat: s.lat,
        lng: s.lng,
        pincode: s.pincode,
      });
    } catch { /* best-effort */ }
    setWaitlisted(true);
    haptics.success();
  }

  async function place() {
    if (placing || orderable.length === 0 || blocked) return;
    setPlacing(true);
    setErr('');
    try {
      // WALLET-FIRST: make sure the wallet covers the total before placing.
      await refreshWallet();
      if (useWallet.getState().balance < total) { setPlacing(false); goRecharge(); return; }

      const addrs = await listAddresses();
      const address = addrs.find((a) => a.is_default) ?? addrs[0];
      if (!address) {
        setErr('Add a delivery address to place your order.');
        router.push('/address');
        return;
      }

      const orderId = await placeOrder({
        lines: orderable,
        address,
        paymentMethod: 'wallet',
        orderType: 'instant',
        lane: 'morning',
      });
      clear();
      haptics.confirm();
      router.replace(`/order/${orderId}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <Header insetsTop={insets.top} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bag-handle-outline" size={38} color={colors.flameDeep} />
          </View>
          <Serif style={{ fontSize: 22 }}>Your cart is empty</Serif>
          <TextBody style={{ textAlign: 'center' }}>Add fresh milk and more from the shop, then pay in one tap from your wallet.</TextBody>
          <Button title="Start shopping" onPress={() => router.replace('/(tabs)')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Header insetsTop={insets.top} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 200 }} showsVerticalScrollIndicator={false}>
        {/* Out-of-zone block */}
        {blocked ? (
          <Animated.View entering={FadeIn.duration(240)}>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.lg, gap: 10, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location-outline" size={18} color={colors.flameDeep} />
                <TextSemi style={{ fontSize: 15, flex: 1 }}>Not delivering here yet</TextSemi>
              </View>
              <TextBody style={{ fontSize: 13 }}>
                We haven't launched at your address yet. Join the waitlist and we'll notify you the moment PYAAS is live in your area.
              </TextBody>
              {waitlisted ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.blue} />
                  <TextMed color={colors.blue} style={{ fontSize: 13 }}>You're on the list. We'll be in touch.</TextMed>
                </View>
              ) : (
                <Button title="Notify me at launch" small variant="outline" onPress={joinZoneWaitlist} />
              )}
            </View>
          </Animated.View>
        ) : null}

        {/* Line items */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
          {lines.map((l, i) => (
            <Animated.View key={l.id} entering={FadeInDown.duration(320).delay(i * 40)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line, opacity: l.outOfStock ? 0.55 : 1 }}>
                <View style={{ width: 54, height: 54, borderRadius: radius.sm, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {l.image ? <Image source={l.image} style={{ width: '82%', height: '82%' }} contentFit="contain" /> : <Ionicons name="cube-outline" size={22} color={colors.inkMute} />}
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 14.5 }} numberOfLines={1}>{l.name}</TextSemi>
                  <TextBody style={{ fontSize: 12 }} numberOfLines={1}>{l.variant}</TextBody>
                  {l.outOfStock ? (
                    <TextMed color={colors.danger} style={{ fontSize: 11.5, marginTop: 2 }}>Out of stock · removed at checkout</TextMed>
                  ) : (
                    <TextSemi style={{ fontSize: 13.5, marginTop: 2, ...tabular }} color={colors.flameDeep}>{rupee(l.price * l.qty)}</TextSemi>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Stepper qty={l.qty} onChange={(n) => (n <= 0 ? remove(l.id) : setQty(l.id, n))} min={0} />
                  <Tap haptic={false} onPress={() => { haptics.select(); remove(l.id); }} style={{ paddingHorizontal: 4 }}>
                    <TextBody color={colors.inkMute} style={{ fontSize: 11.5 }}>Remove</TextBody>
                  </Tap>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>

        {hasOutOfStock ? (
          <TextMed color={colors.danger} style={{ fontSize: 12.5 }}>Out-of-stock items won't be charged or delivered.</TextMed>
        ) : null}

        {/* Price breakdown */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 10, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 15, marginBottom: 2 }}>Bill summary</TextSemi>
          <Row label={`Item total (${orderable.reduce((n, l) => n + l.qty, 0)})`} value={rupee(subtotal)} />
          <Row
            label="Delivery fee"
            value={delivery === 0 ? 'FREE' : rupee(delivery)}
            valueColor={delivery === 0 ? colors.blue : colors.ink}
            hint={delivery > 0 ? `Free over ${rupee(FREE_DELIVERY_OVER)}` : undefined}
          />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          <Row label="To pay" value={rupee(total)} bold />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          <Row label="PYAAS Wallet balance" value={rupee(balance)} valueColor={colors.inkSoft} />
          <Row label="To pay from wallet" value={rupee(total)} valueColor={colors.flameDeep} bold />
        </View>

        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 2 }}>
          <Ionicons name="shield-checkmark" size={14} color={colors.inkMute} />
          <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
            {storeName ? `Served by ${storeName}. ` : ''}Paid securely from your PYAAS Wallet.
          </TextBody>
        </View>
      </ScrollView>

      {/* Sticky wallet-first CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }}>
        {short > 0 && !blocked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 10 }}>
            <Ionicons name="wallet" size={16} color={colors.flameDeep} />
            <TextMed color={colors.flameDeep} style={{ flex: 1, fontSize: 12.5 }}>Low balance. Recharge {rupee(short)} to pay for this order.</TextMed>
          </View>
        ) : null}

        <Tap onPress={blocked ? undefined : short > 0 ? goRecharge : place} disabled={placing || blocked || orderable.length === 0}>
          <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: blocked || orderable.length === 0 ? colors.inkMute : colors.flameDeep, height: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: placing ? 0.85 : 1, ...shadow.card }}>
            {placing ? <ActivityIndicator color={colors.white} /> : null}
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>
              {blocked ? 'Unavailable in your area' : placing ? 'Placing order…' : short > 0 ? `Recharge ${rupee(short)} to continue` : `Place order · ${rupee(total)}`}
            </TextSemi>
            {!placing && !blocked ? <ShineSweep dur={2400} travel={340} bandWidth={70} angle="16deg" delay={400} /> : null}
          </View>
        </Tap>
      </View>
    </View>
  );
}

function Header({ insetsTop }: { insetsTop: number }) {
  return (
    <View style={{ paddingTop: insetsTop + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.milk, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <BackButton />
      <Serif style={{ fontSize: 22, flex: 1 }}>Your cart</Serif>
    </View>
  );
}

function Row({ label, value, valueColor, bold, hint }: { label: string; value: string; valueColor?: string; bold?: boolean; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        {bold ? <TextSemi style={{ fontSize: 15 }}>{label}</TextSemi> : <TextBody style={{ fontSize: 13.5 }}>{label}</TextBody>}
        {hint ? <TextBody color={colors.inkMute} style={{ fontSize: 11 }}>{hint}</TextBody> : null}
      </View>
      {bold ? (
        <TextSemi style={{ fontSize: 16, ...tabular }} color={valueColor ?? colors.ink}>{value}</TextSemi>
      ) : (
        <TextMed style={{ fontSize: 14, ...tabular, fontFamily: fonts.sansMed }} color={valueColor ?? colors.ink}>{value}</TextMed>
      )}
    </View>
  );
}
