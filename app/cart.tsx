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
import { refreshCatalog, getMergedProducts } from '../lib/catalog';
import { useServiceability, joinWaitlist } from '../lib/serviceability';
import { useDeliveryMode } from '../lib/deliveryMode';
import { useAuth } from '../lib/auth';
import { purchasesUnlocked, onWalletUnlocked, WALLET_UNLOCK_TARGET, STARTER_FREE_DAYS } from '../lib/walletGate';

// Fees we SHOW (for transparency, like a quick-commerce bill) but WAIVE — so the
// amount payable stays item-total + delivery. Handling + small-cart are on us.
const HANDLING_FEE = 9;
const SMALL_CART_UNDER = 199;
const SMALL_CART_FEE = 20;

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
  const revalidateStock = useCart((s) => s.revalidateStock);

  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);

  const serviceable = useServiceability((s) => s.serviceable);
  const checkSvc = useServiceability((s) => s.check);
  // The user's chosen lane (⚡ instant 20-min vs morning slot) drives dispatch:
  // instant orders broadcast to riders, morning ride the subscription route.
  const mode = useDeliveryMode();
  const lane = mode === 'instant' ? 'instant' : 'morning';

  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState('');
  const [waitlisted, setWaitlisted] = useState(false);
  // ₹500 GATE: ordering stays locked until the wallet has been funded to the
  // target once. `null` = still resolving (treat as unlocked so the CTA never
  // flashes the lock for an already-unlocked member).
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  const recheckUnlock = useCallback(() => {
    purchasesUnlocked(useWallet.getState().balance)
      .then(setUnlocked)
      .catch(() => setUnlocked(true)); // fail-open: never brick checkout on a read error
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshWallet().then(recheckUnlock);
      recheckUnlock();
      void checkSvc();
      // Re-check live stock so a line that went OOS since the cart was opened is
      // flagged (and dropped from the bill) before the user can pay for it.
      void refreshCatalog().then(() => revalidateStock(getMergedProducts()));
      const off = onWalletUnlocked(() => setUnlocked(true));
      return off;
    }, [refreshWallet, checkSvc, revalidateStock, recheckUnlock])
  );

  const hasOutOfStock = lines.some((l) => l.outOfStock);
  const orderable = lines.filter((l) => !l.outOfStock);
  // Bill is over ORDERABLE lines only — out-of-stock items are never charged.
  const subtotal = orderable.reduce((sum, l) => sum + l.price * l.qty, 0);
  const delivery = deliveryFeeFor(subtotal);
  const total = subtotal + delivery;
  const short = Math.max(0, total - balance);
  const blocked = serviceable === false;
  // Handling + small-cart fees are SHOWN then waived (on us), so the payable total
  // is unchanged. Small-cart applies under ₹199 (like a quick-commerce bill).
  const smallCart = subtotal > 0 && subtotal < SMALL_CART_UNDER ? SMALL_CART_FEE : 0;
  const feesSaved = HANDLING_FEE + smallCart;

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

  // Locked account: route to a top-up that brings the wallet to the ₹500 target.
  // The unlock (and the 7-day starter plan) fires automatically when it lands.
  const unlockShort = Math.max(0, WALLET_UNLOCK_TARGET - balance);
  function goUnlock() {
    haptics.press();
    const qs = new URLSearchParams({
      min: String(Math.ceil(unlockShort)),
      amount: String(Math.max(100, Math.ceil(unlockShort / 50) * 50)),
      returnTo: '/cart',
      reason: `to unlock ordering, your first ${STARTER_FREE_DAYS} days of milk are on us`,
    }).toString();
    router.push(`/recharge?${qs}`);
  }
  const locked = unlocked === false;

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
    if (locked) { goUnlock(); return; }
    setPlacing(true);
    setErr('');
    try {
      // LIVE-STOCK RECHECK: the 60s poll may have flipped a line OOS since the
      // cart was opened. Re-pull the catalog and re-flag lines; if the orderable
      // set shrank, stop and let the user review — never charge for, or silently
      // drop, an item at the moment of payment.
      await refreshCatalog();
      revalidateStock(getMergedProducts());
      // Set-membership guard (NOT a count): abort if ANY line we're about to pay
      // for just went out of stock — even if a different line restocked to keep
      // the orderable count equal. Paying `orderable` is then provably safe (every
      // one of its lines is still in stock) and stays consistent with `total`.
      const freshIds = new Set(useCart.getState().lines.filter((l) => !l.outOfStock).map((l) => l.id));
      if (orderable.some((l) => !freshIds.has(l.id))) {
        setErr('Some items just went out of stock and were removed. Please review your cart.');
        setPlacing(false);
        return;
      }

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
        lane,
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
            label="Delivery charge"
            value={delivery === 0 ? 'FREE' : rupee(delivery)}
            valueColor={delivery === 0 ? colors.blue : colors.ink}
            hint={delivery > 0 ? `No charge over ${rupee(FREE_DELIVERY_OVER)}` : undefined}
          />
          <Row label="Handling charge" value="FREE" valueColor={colors.blue} strike={rupee(HANDLING_FEE)} />
          {smallCart > 0 ? (
            <Row label="Small cart fee" value="FREE" valueColor={colors.blue} strike={rupee(smallCart)} hint={`No charge over ${rupee(SMALL_CART_UNDER)}`} />
          ) : null}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          <Row label="To pay" value={rupee(total)} bold />
          {feesSaved > 0 ? (
            <Row label="Saved on fees" value={`− ${rupee(feesSaved)}`} valueColor={colors.blue} />
          ) : null}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
          <Row label="PYAAS Wallet balance" value={rupee(balance)} valueColor={colors.inkSoft} />
          <Row label="To pay from wallet" value={rupee(total)} valueColor={colors.flameDeep} bold />

          {/* Charged-after-delivery reassurance (our backend debits on delivery). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cream, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 }}>
            <Ionicons name="time-outline" size={14} color={colors.flameDeep} />
            <TextBody style={{ fontSize: 11.5, flex: 1 }}>Held on your wallet now, charged only after the order is delivered.</TextBody>
          </View>
        </View>

        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}

        {/* Cancellation policy + disclaimer (quick-commerce bill footer) */}
        <Policy
          title="Cancellation policy"
          body="Orders once placed cannot be cancelled after a rider has picked them up. If it's cancelled at our end for any operational reason, any amount held is released back to your PYAAS Wallet."
        />
        <Policy
          title="Disclaimer"
          body="Fresh dairy weights can vary slightly pack to pack; you're only charged for what's delivered. Delivery timings are best-effort and may shift with weather or traffic."
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 2 }}>
          <Ionicons name="shield-checkmark" size={14} color={colors.inkMute} />
          <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
            Paid securely from your PYAAS Wallet.
          </TextBody>
        </View>
      </ScrollView>

      {/* Sticky wallet-first CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.line, gap: 8 }}>
        {locked && !blocked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 10 }}>
            <Ionicons name="gift" size={16} color={colors.flameDeep} />
            <TextMed color={colors.flameDeep} style={{ flex: 1, fontSize: 12.5 }}>
              Fund your wallet to {rupee(WALLET_UNLOCK_TARGET)} to unlock ordering. Your 7-day starter plan begins right away, first {STARTER_FREE_DAYS} days on us.
            </TextMed>
          </View>
        ) : null}
        {!locked && short > 0 && !blocked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 10 }}>
            <Ionicons name="wallet" size={16} color={colors.flameDeep} />
            <TextMed color={colors.flameDeep} style={{ flex: 1, fontSize: 12.5 }}>Low balance. Recharge {rupee(short)} to pay for this order.</TextMed>
          </View>
        ) : null}

        <Tap onPress={blocked ? undefined : locked ? goUnlock : short > 0 ? goRecharge : place} disabled={placing || blocked || orderable.length === 0}>
          <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: blocked || orderable.length === 0 ? colors.inkMute : colors.flameDeep, height: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: placing ? 0.85 : 1, ...shadow.card }}>
            {placing ? <ActivityIndicator color={colors.white} /> : null}
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>
              {blocked
                ? 'Unavailable in your area'
                : placing
                  ? 'Placing order…'
                  : locked
                    ? `Add ${rupee(unlockShort)} to unlock ordering`
                    : short > 0
                      ? `Recharge ${rupee(short)} to continue`
                      : `Place order · ${rupee(total)}`}
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

function Row({ label, value, valueColor, bold, hint, strike }: { label: string; value: string; valueColor?: string; bold?: boolean; hint?: string; strike?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1, paddingRight: 8 }}>
        {bold ? <TextSemi style={{ fontSize: 15 }}>{label}</TextSemi> : <TextBody style={{ fontSize: 13.5 }}>{label}</TextBody>}
        {hint ? <TextBody color={colors.inkMute} style={{ fontSize: 11 }}>{hint}</TextBody> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        {strike ? <TextBody style={{ fontSize: 12.5, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{strike}</TextBody> : null}
        {bold ? (
          <TextSemi style={{ fontSize: 16, ...tabular }} color={valueColor ?? colors.ink}>{value}</TextSemi>
        ) : (
          <TextMed style={{ fontSize: 14, ...tabular, fontFamily: fonts.sansMed }} color={valueColor ?? colors.ink}>{value}</TextMed>
        )}
      </View>
    </View>
  );
}

function Policy({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, ...shadow.soft }}>
      <TextSemi style={{ fontSize: 13.5 }}>{title}</TextSemi>
      <TextBody style={{ fontSize: 12, lineHeight: 18 }} color={colors.inkSoft}>{body}</TextBody>
    </View>
  );
}
