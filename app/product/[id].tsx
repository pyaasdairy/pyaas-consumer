import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Text, TextInput, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, Tap, Stepper, Divider } from '../../components/ui';
import { Glass } from '../../components/Glass';
import { Stars } from '../../components/Stars';
import { StackedProductImage } from '../../components/StackedProductImage';
import { ShineSweep, GlowPulse } from '../../components/Fx';
import { StartDatePicker } from '../../components/StartDatePicker';
import { discountPct, complianceFor, getReviews, backImageFor, type Product } from '../../constants/products';
import { useCatalog, groupProducts, physicalAttributes } from '../../lib/catalog';
import { VariantSelector } from '../../components/VariantSelector';
import { SubscribeSheet, type SubscribeResult } from '../../components/SubscribeSheet';
import { createSubscription, NEEDS_EXACT_LOCATION, type Frequency } from '../../lib/subscriptions';
import { useServiceability } from '../../lib/serviceability';
import { placeOrder, listAddresses, deliveryFeeFor } from '../../lib/api';
import { captureRestockLead } from '../../lib/leads';
import { isBackendConfigured } from '../../lib/apiClient';
import { todayISO, tomorrowISO, addDaysISO, parseISO, formatShort } from '../../lib/dates';
import { useDeliveryMode, getDeliveryMode, setDeliveryMode, instantEtaHHMM, hhmmTo12, type DeliveryMode } from '../../lib/deliveryMode';
import { useWallet } from '../../store/wallet';
import { useCart } from '../../store/cart';

const GOLD = '#C9A24B';
const GOLD_BRIGHT = '#F4D061';
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SUB_TYPES: { key: Frequency; label: string; sub: string }[] = [
  { key: 'daily', label: 'Daily', sub: 'Every morning' },
  { key: 'alternate', label: 'Alternate', sub: 'Every 2nd day' },
  { key: 'one_time', label: 'One Time', sub: 'Just once' },
];

// ── Top banner: "Order by 11:59 PM · Delivery by 7 AM" ────────────────────────────
function DeliveryBanner({ topInset }: { topInset: number }) {
  return (
    <View style={{ overflow: 'hidden', backgroundColor: colors.flameDeep, paddingTop: topInset + 7, paddingBottom: 9, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
      <TextSemi color={colors.white} style={{ fontSize: 12.5, letterSpacing: 0.5 }}>Order by 11:59 PM · Delivery by 7 AM</TextSemi>
      <ShineSweep dur={3200} travel={520} bandWidth={90} delay={700} />
    </View>
  );
}

// ── Subscription-type card (radio + label, animated select) ───────────────────
function SubTypeCard({ label, sub, active, onPress, index }: { label: string; sub: string; active: boolean; onPress: () => void; index: number }) {
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    s.value = withTiming(active ? 1 : 0, { duration: 220, easing: Easing.out(Easing.ease) });
  }, [active, s]);
  // A subtle lift (not a scale) so the selected card never overflows its slot.
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * s.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View entering={FadeInDown.duration(360).delay(index * 70)} style={{ flex: 1 }}>
      <Tap onPress={onPress}>
        <Animated.View style={[{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.flameDeep : colors.line, backgroundColor: active ? colors.flameSoft : colors.white, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 6, ...shadow.soft }, cardStyle]}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.flameDeep : colors.inkMute, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.flameDeep }, dotStyle]} />
          </View>
          <TextSemi style={{ fontSize: 14 }} color={active ? colors.flameDeep : colors.ink}>{label}</TextSemi>
          <TextBody style={{ fontSize: 10.5, textAlign: 'center' }}>{sub}</TextBody>
        </Animated.View>
      </Tap>
    </Animated.View>
  );
}

export default function ProductDetail() {
  const { id, start, qty: qtyParam, freq: freqParam, lane: laneParam, subscribe: subscribeParam } = useLocalSearchParams<{ id: string; start?: string; qty?: string; freq?: string; lane?: string; subscribe?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Read the live merged catalog so a store-manager price/stock change is
  // reflected here too (the 60s refetch flips OUT OF STOCK / new price live).
  const products = useCatalog();
  // The route id seeds the selection; picking another size swaps the SELECTED
  // variant in place (no navigation, no reload) and re-drives the whole page.
  const [selectedId, setSelectedId] = useState<string>(String(id));
  useEffect(() => { setSelectedId(String(id)); }, [id]);
  const product = products.find((p) => p.id === selectedId);
  // Sibling sizes of this base (500 ml · 1 L …), in catalog order, for the selector.
  const variants = useMemo(() => {
    if (!product) return [];
    const group = groupProducts(products).find((g) => g.variants.some((v) => v.id === product.id));
    return group?.variants ?? [product];
  }, [products, product]);

  // qty/freq/lane can be restored from params (e.g. after a recharge round-trip) so
  // a funded order resumes with the member's original choices instead of resetting.
  const [qty, setQty] = useState(() => { const n = Number(qtyParam); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1; });
  // Milk defaults to a Daily subscription; non-subscribable items (ghee) are a
  // one-time order · both go through the same Proceed → order flow (no cart).
  // Frequency default follows the app-wide delivery mode: in the ⚡ INSTANT
  // world this is a one-time "Add to cart" purchase (never a Subscribe CTA);
  // in the Morning world a subscribable SKU defaults to the daily subscription.
  const [freq, setFreq] = useState<Frequency>(
    (freqParam as Frequency) ||
      (product?.subscribable === false || getDeliveryMode() === 'instant' ? 'one_time' : 'daily'),
  );
  // Honour a start date passed in (e.g. the day chosen in the home delivery strip),
  // but never earlier than tomorrow.
  const [startDate, setStartDate] = useState(start && start > tomorrowISO() ? start : tomorrowISO());
  const [showCal, setShowCal] = useState(false);
  // Delivery lane for ONE-TIME orders, seeded from the shared app-wide mode
  // (home strip) — instant ~20 min · morning 5–7:30 AM slot · a picked date.
  // Subscriptions always ride the morning route (no instant lane).
  const sharedMode = useDeliveryMode();
  const [deliverBy, setDeliverBy] = useState<DeliveryMode>((laneParam as DeliveryMode) || sharedMode);
  const [pickedDate, setPickedDate] = useState(start && start >= tomorrowISO() ? start : tomorrowISO());
  // BAG ↔ QUANTITY SYNC (one-time orders only): the tile's bag stepper already
  // put N of this product in the ACTIVE lane's cart, so this page must open at
  // N — never reset to 1. Each lane (⚡ instant vs morning) syncs from ITS OWN
  // bag. A SUBSCRIPTION plan's quantity stays independent (a plan is not the
  // bag), and an explicit deep-link qty param always wins. Seeded once per
  // lane so the member's manual edits here are never overwritten.
  const cartLines = useCart((s) => s.lines);
  const bagSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (qtyParam != null || freq !== 'one_time') return;
    const laneKey: 'instant' | 'morning' = deliverBy === 'instant' ? 'instant' : 'morning';
    if (bagSeedRef.current === laneKey) return;
    const inBag = cartLines.find((l) => l.id === id && l.lane === laneKey)?.qty ?? 0;
    if (inBag >= 1) {
      setQty(inBag);
      bagSeedRef.current = laneKey;
    }
  }, [freq, deliverBy, qtyParam, cartLines, id]);
  const [busy, setBusy] = useState(false);
  // Synchronous double-tap guard (setBusy only disables after a re-render, so a fast
  // double-tap could run proceed() — and placeOrder — twice).
  const busyRef = useRef(false);
  const [err, setErr] = useState('');
  const [shortfall, setShortfall] = useState(0);
  const [notified, setNotified] = useState(false);
  // The polished subscribe bottom sheet (recurring milk). One-time / instant
  // orders keep the direct Proceed flow below.
  const [showSubscribe, setShowSubscribe] = useState(false);
  // All orders are WALLET-first (prepaid), no cash on delivery — the money-first
  // funnel. Optional company GSTIN (printed on the proforma bill).
  const [gstin, setGstin] = useState('');
  const refreshWallet = useWallet((s) => s.refresh);
  const addToCart = useCart((s) => s.add);
  // Monsoon surcharge (₹) the serving store charges on INSTANT orders (0 = none).
  const monsoonRupees = useServiceability((s) => s.monsoonRupees);

  // Changing qty/frequency/variant changes the cost, so re-arm the wallet gate.
  useEffect(() => { setShortfall(0); setErr(''); }, [qty, freq, selectedId]);

  // Resuming a subscription checkout after a wallet top-up (returnTo carried
  // &subscribe=1): re-open the subscribe sheet once, seeded with the restored
  // qty/freq/start, so a funded member finishes where they left off.
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (!didAutoOpen.current && subscribeParam === '1' && product) {
      didAutoOpen.current = true;
      setShowSubscribe(true);
    }
  }, [subscribeParam, product]);

  // The wallet-first gate stores a one-shot `shortfall` that flips the CTA to
  // "Add money to wallet". If the member funds the wallet by ANY route and returns
  // here, re-check the live balance on focus and restore the Proceed CTA once it
  // covers the order — so that state can never get stuck.
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      (async () => {
        await refreshWallet();
        if (!alive || !product) return;
        const t = product.price * qty;
        const laneNow: DeliveryMode = freq === 'one_time' ? deliverBy : 'morning';
        const need = t + deliveryFeeFor(t) + (laneNow === 'instant' ? (monsoonRupees || 0) : 0);
        if (useWallet.getState().balance >= need) setShortfall(0);
      })();
      return () => { alive = false; };
    }, [product, qty, freq, deliverBy, monsoonRupees, refreshWallet]),
  );

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
        <TextBody>Product not found.</TextBody>
      </View>
    );
  }

  const pct = discountPct(product);
  // On paragdairy.com MRP == offer price, so we never show a struck MRP that
  // doesn't exist. unit is always the listed price.
  const hasMrp = !!product.mrp && product.mrp > product.price;
  const unit = product.price;
  const strike = hasMrp ? (product.mrp as number) : 0;
  const savedPer = strike > unit ? strike - unit : 0;
  const total = unit * qty;
  const headlineColor = colors.flameDeep;
  const subscribable = product.subscribable;
  const isInstant = freq === 'one_time'; // one-off delivery vs recurring subscription
  // Effective delivery lane + landing date for a one-time order. Instant lands
  // today (~20 min); the morning slot lands tomorrow 5–7:30 AM; a picked date
  // lands that morning. Subscriptions ignore this and use startDate.
  const laneSel: DeliveryMode = isInstant ? deliverBy : 'morning';
  // Monsoon surcharge applies to the INSTANT lane only (store-manager controlled).
  const monsoonFee = laneSel === 'instant' ? (monsoonRupees || 0) : 0;
  // Delivery fee (₹15 under the free-delivery threshold). The wallet-first gate must
  // use the FULL charge (items + delivery + monsoon), not the bare item total, or a
  // delivery can be left unfunded by the fee.
  const deliveryFee = deliveryFeeFor(total);
  const chargeTotal = total + deliveryFee + monsoonFee;
  const oneTimeDate = laneSel === 'scheduled' ? pickedDate : laneSel === 'instant' ? todayISO() : tomorrowISO();
  const instantEta = hhmmTo12(instantEtaHHMM()) ?? instantEtaHHMM();
  // GSTIN is optional; only attach it to the bill when it is a well-formed
  // 15-char GSTIN (2-digit state + 10-char PAN + entity + Z + check). A partial
  // or malformed entry is ignored rather than printed on the proforma.
  const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
  const gstinValid = GSTIN_RE.test(gstin);
  const gstinError = gstin.length > 0 && !gstinValid;
  const compliance = complianceFor(product);
  const reviews = getReviews(product.id);

  // Out-of-stock: capture a restock lead (member's name + phone straight to the
  // backend, keyed to this SKU) and flip the CTA to a confirmation.
  async function notifyMe() {
    if (!product) return;
    setBusy(true);
    try {
      // Only confirm if the lead was actually stored (backend, or the
      // on-device fallback when the backend is unreachable).
      const stored = await captureRestockLead(product);
      if (stored) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setErr('');
        setNotified(true);
      } else {
        setErr("Couldn't save your request. Please try again.");
      }
    } finally { setBusy(false); }
  }

  // Route to the wallet recharge screen preloaded with this order's shortfall,
  // carrying qty/freq/lane/start so the funded order resumes on a fresh mount here.
  function goRecharge(shortRupees: number) {
    if (!product) return;
    const shortAmt = Math.max(1, Math.ceil(shortRupees));
    const amount = Math.max(100, Math.ceil(shortAmt / 50) * 50);
    const rt = `/product/${product.id}?qty=${qty}&freq=${freq}&lane=${deliverBy}&start=${isInstant ? oneTimeDate : startDate}`;
    router.push(`/recharge?min=${shortAmt}&amount=${amount}&returnTo=${encodeURIComponent(rt)}&reason=${encodeURIComponent('to place this order')}`);
  }

  async function proceed() {
    if (!product) return;
    if (busyRef.current) return; // synchronous double-tap guard (no duplicate orders)
    // Not orderable while out of stock (the CTA is also swapped out below -
    // this is the belt-and-braces guard).
    if (product.outOfStock) { setErr('This product is currently out of stock.'); return; }
    busyRef.current = true;
    setBusy(true); setErr('');
    try {
      // WALLET-FIRST, BOTH MODES, NO COD ESCAPE: an order is never placed unless the
      // prepaid wallet covers the FULL charge (items + delivery + monsoon fees). If
      // short, route to recharge — preserving qty/freq/start/lane so the funded order
      // resumes with the member's original choices — and STOP; the order is not sent.
      await refreshWallet();
      const bal = useWallet.getState().balance;
      if (bal < chargeTotal) {
        setShortfall(chargeTotal - bal);
        goRecharge(chargeTotal - bal);
        return;
      }

      // With a shared backend, place a REAL delivery order so it reaches the
      // Saathi rider queue + Orders tab + live tracking. Order the operations so
      // no write happens before we know we can complete: resolve the address
      // first (bail cleanly if missing), place the order, and only then record
      // the local subscription — so a bail-out or a failed order never leaves an
      // orphan subscription behind, and a failure surfaces instead of showing a
      // false "confirmed".
      if (isBackendConfigured()) {
        const addrs = await listAddresses();
        const address = addrs.find((a) => a.is_default) ?? addrs[0];
        if (!address) {
          setErr('Add a delivery address to place your order.');
          router.push('/address');
          return;
        }
        let orderId: string;
        try {
          orderId = await placeOrder({
            lines: [{ id: product.id, lane: laneSel === 'instant' ? ('instant' as const) : ('morning' as const), name: product.name, variant: product.variant, price: unit, image: product.image, qty }],
            address,
            paymentMethod: 'prepaid',
            priority: 'normal',
            orderType: isInstant ? 'instant' : 'subscription',
            buyerGstin: gstinValid ? gstin : null,
            // Delivery lane: instant is one-time-only (placeOrder re-guards);
            // a picked date rides the morning slot on that date.
            lane: laneSel === 'instant' ? 'instant' : 'morning',
            deliveryDate: laneSel === 'scheduled' ? pickedDate : null,
          });
        } catch (e: any) {
          setErr(e?.message ?? 'Could not place your order. Please try again.');
          return;
        }
        // Recurring order → record the subscription (non-fatal). A ONE-TIME / instant
        // buy must NOT become a subscription: it would show a false "Subscription LIVE"
        // card and (being active) permanently hide the 2+2 starter funnel.
        if (!isInstant) {
          await createSubscription({ productId: product.id, variant: product.variant, qty, unitPrice: unit, frequency: freq, startDate: startDate }).catch(() => { /* order already placed */ });
        }
        router.replace(`/order/${orderId}`);
        return;
      }

      // Local mode (no backend): a RECURRING order is recorded as a subscription; a
      // one-time buy is not (see above) — it just shows the order-confirmed screen.
      if (!isInstant) {
        await createSubscription({ productId: product.id, variant: product.variant, qty, unitPrice: unit, frequency: freq, startDate: startDate });
      }
      // The order-confirmed screen fires the strong confirmation haptic on mount.
      router.push({
        pathname: '/order-confirmed',
        params: { id: product.id, qty: String(qty), freq, start: isInstant ? oneTimeDate : startDate, total: String(total), saved: String(savedPer * qty) },
      });
    } catch (e: any) {
      // No exact delivery point yet → route to add one on the map (address screen)
      // rather than showing the raw gate code; they can retry after.
      if (e?.code === NEEDS_EXACT_LOCATION || e?.message === NEEDS_EXACT_LOCATION) {
        setErr('Set your delivery location on the map first.');
        router.push('/address');
        return;
      }
      setErr(e?.message ?? 'Could not set up your subscription. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Sticky-CTA router: a recurring milk subscription opens the polished
  // SubscribeSheet (frequency / qty / start date / 3-paid-3-free); a one-time or
  // instant order (and every non-subscribable SKU) goes straight through proceed.
  function onPrimary() {
    if (!product) return;
    if (product.subscribable && freq !== 'one_time') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setShowSubscribe(true);
      return;
    }
    // One-time / instant → ADD TO CART and review the CD-style bill (no direct
    // order). The chosen lane (instant vs morning) rides the shared delivery mode,
    // and the cart runs the wallet-first + serviceability gate before placing.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    addToCart(product, qty);
    router.push('/cart');
  }

  // The sheet already created the subscription (+ trial anchor + mandate seam);
  // reuse the shared confirmation screen.
  function onSubscribed(r: SubscribeResult) {
    if (!product) return;
    setShowSubscribe(false);
    router.push({
      pathname: '/order-confirmed',
      params: { id: product.id, qty: String(r.qty), freq: r.freq, start: r.startDate, total: String(r.total), saved: String(r.saved) },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 210 }}>
        <DeliveryBanner topInset={insets.top} />

        {/* Image header */}
        <View style={{ backgroundColor: colors.cream, paddingBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 12 }}>
            <Tap onPress={() => router.back()} style={iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Tap>
          </View>
          {product.image ? (
            <ProductPhotoPager product={product} />
          ) : (
            <View style={{ width: '100%', height: 280, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
              <Serif style={{ fontSize: 26, textAlign: 'center' }} color={colors.flameDeep}>{product.name}</Serif>
            </View>
          )}
        </View>

        {/* Body */}
        <View style={{ padding: spacing.lg, gap: 12 }}>
          <Animated.View entering={FadeInDown.duration(420)} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pill label={product.tag} bg={colors.blueSoft} color={colors.blue} />
              {pct ? <Pill label={`${pct}% OFF`} bg="rgba(199,91,110,0.12)" color={colors.flameDeep} /> : null}
            </View>

            <Serif style={{ fontSize: 28, lineHeight: 32 }}>{product.name}</Serif>
            <TextMed color={colors.inkSoft} style={{ fontSize: 14.5 }}>{product.variant} · {product.unit}</TextMed>

            {/* Size selector — picking a size re-drives price / image / stock / CTA
                for this same screen, no reload. Hidden for single-variant bases. */}
            {variants.length > 1 ? (
              <View style={{ marginTop: 4 }}>
                <VariantSelector variants={variants} selectedId={selectedId} onSelect={setSelectedId} />
              </View>
            ) : null}

            {/* Physical attributes (Volume / Weight), driven by the selected variant. */}
            {physicalAttributes(product).length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                {physicalAttributes(product).map((a) => (
                  <View key={a.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.wash, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 }}>
                    <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>{a.label}</TextBody>
                    <TextSemi style={{ fontSize: 12.5 }} color={colors.ink}>{a.value}</TextSemi>
                  </View>
                ))}
              </View>
            ) : null}

            {product.rating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Stars rating={product.rating} count={product.ratingCount} size={14} />
                {reviews.length ? <TextBody style={{ fontSize: 12.5 }} color={colors.blue}>· {reviews.length} review{reviews.length === 1 ? '' : 's'}</TextBody> : null}
              </View>
            ) : null}

            {/* Price (member price + crown shown only to members) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {strike > unit ? <TextBody style={{ fontSize: 16, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(strike)}</TextBody> : null}
              <Serif style={{ fontFamily: fonts.serifBlack, fontSize: 30, letterSpacing: -0.5, ...tabular }} color={headlineColor}>{rupee(unit)}</Serif>
              {savedPer > 0 ? <Pill label={`SAVE ${rupee(savedPer)}`} bg={colors.flameSoft} color={headlineColor} /> : null}
            </View>
          </Animated.View>

          {/* Quantity */}
          <Animated.View entering={FadeInDown.duration(420).delay(60)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TextSemi style={{ fontSize: 15 }}>Quantity</TextSemi>
            <Stepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} max={10} />
          </Animated.View>

          <Divider />

          {/* Milk = daily morning subscription. Everything else = one-time order.
              ⚡ INSTANT WORLD: no subscription setup at all — instant is a pure
              one-time add-to-cart purchase; subscriptions live in Morning. */}
          {sharedMode === 'instant' ? (
            <Animated.View entering={FadeInDown.duration(420).delay(90)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 12 }}>
              <Ionicons name="flash" size={18} color={colors.flameDeep} />
              <TextMed style={{ flex: 1, fontSize: 13.5 }} color={colors.ink}>
                ⚡ Instant delivery · arriving in ~20 minutes (by {instantEta}). One-time order — daily subscriptions live in the Morning tab.
              </TextMed>
            </Animated.View>
          ) : subscribable ? (
            <Animated.View entering={FadeInDown.duration(420).delay(90)} style={{ gap: 10 }}>
              <TextSemi style={{ fontSize: 16 }}>Set up your milk delivery</TextSemi>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SUB_TYPES.map((t, i) => (
                  <SubTypeCard key={t.key} label={t.label} sub={t.sub} index={i} active={freq === t.key} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFreq(t.key); }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
                <Ionicons name="sunny-outline" size={18} color={colors.blue} />
                <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.ink}>Fresh milk at your door every morning by 7 AM. Pause, skip or cancel anytime.</TextMed>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(420).delay(90)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12 }}>
              <Ionicons name="cube-outline" size={18} color={GOLD} />
              <TextMed style={{ flex: 1, fontSize: 13.5 }} color={colors.inkDeep}>We will get this delivered to your door soon after you order. A one-time order, no subscription.</TextMed>
            </Animated.View>
          )}

          {/* Delivery lane (one-time orders) / start date (subscriptions).
              Instant is one-time-only — subscriptions always ride the morning
              route. In the ⚡ instant world the lane is FIXED (no picker). */}
          {isInstant && sharedMode !== 'instant' ? (
            <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ gap: 10 }}>
              <TextSemi style={{ fontSize: 16 }}>Delivery</TextSemi>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([
                  { key: 'instant', label: 'Instant', sub: '~20 min ⚡' },
                  { key: 'morning', label: 'Morning slot', sub: '5–7:30 AM' },
                  { key: 'scheduled', label: 'Pick a date', sub: formatShort(pickedDate) },
                ] as const).map((opt) => {
                  const active = deliverBy === opt.key;
                  return (
                    <Tap
                      key={opt.key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDeliverBy(opt.key);
                        setDeliveryMode(opt.key); // keep the home strip in sync
                      }}
                      style={{ flex: 1 }}
                    >
                      <View style={{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.flameDeep : colors.line, backgroundColor: active ? colors.flameSoft : colors.white, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 3 }}>
                        <TextSemi style={{ fontSize: 13.5, textAlign: 'center' }} color={active ? colors.flameDeep : colors.ink}>{opt.label}</TextSemi>
                        <TextBody style={{ fontSize: 10.5, textAlign: 'center' }}>{opt.sub}</TextBody>
                      </View>
                    </Tap>
                  );
                })}
              </View>

              {deliverBy === 'scheduled' ? (
                /* 7-day chip calendar (same language as the home delivery strip) */
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 6 }}>
                  {Array.from({ length: 7 }, (_, i) => {
                    const iso = addDaysISO(tomorrowISO(), i);
                    const d = parseISO(iso);
                    const selected = iso === pickedDate;
                    return (
                      <Tap
                        key={iso}
                        haptic={false}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickedDate(iso); }}
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
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: deliverBy === 'instant' ? colors.flameSoft : colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
                <Ionicons name={deliverBy === 'instant' ? 'flash' : 'sunny-outline'} size={18} color={deliverBy === 'instant' ? colors.flameDeep : colors.blue} />
                <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.ink}>
                  {deliverBy === 'instant'
                    ? `Arriving by ${instantEta} · ⚡ Instant express from your nearest PYAAS store.${monsoonFee > 0 ? ` A ₹${monsoonFee} monsoon fee applies.` : ''}`
                    : deliverBy === 'scheduled'
                      ? `Delivered ${formatShort(pickedDate)}, in the 5–7:30 AM morning slot.`
                      : 'Delivered tomorrow morning, 5–7:30 AM. Fresh off the dawn route.'}
                </TextMed>
              </View>
            </Animated.View>
          ) : sharedMode !== 'instant' ? (
            // Subscription start date — Morning world only. In the ⚡ instant
            // world the order is a one-time purchase arriving TODAY in ~20 min,
            // so a start date is meaningless (and startDate is never read).
            <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ gap: 8 }}>
              <TextSemi style={{ fontSize: 16 }}>Start date</TextSemi>
              <Tap haptic={false} onPress={() => setShowCal(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.flame, borderRadius: radius.md, paddingHorizontal: 16, height: 56, backgroundColor: colors.white, ...shadow.soft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="calendar-outline" size={20} color={colors.flameDeep} />
                  <TextSemi style={{ fontSize: 16 }}>{formatShort(startDate)}</TextSemi>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <TextMed color={colors.flameDeep} style={{ fontSize: 13 }}>Edit</TextMed>
                  <Ionicons name="pencil" size={14} color={colors.flameDeep} />
                </View>
              </Tap>
            </Animated.View>
          ) : null}

          <Divider />

          {/* Payment — always the prepaid PYAAS Wallet (money-first funnel, no COD). */}
          <Animated.View entering={FadeInDown.duration(420).delay(135)} style={{ gap: 8 }}>
            <TextSemi style={{ fontSize: 16 }}>Payment</TextSemi>
            <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="wallet-outline" size={18} color={colors.flameDeep} />
              <TextBody style={{ fontSize: 13, flex: 1 }}>
                Paid from your PYAAS Wallet. If your balance is short, we'll top it up first. Quick, secure, and your delivery is never held up.
              </TextBody>
            </View>
          </Animated.View>

          {/* Optional company GSTIN → printed on the proforma bill */}
          <Animated.View entering={FadeInDown.duration(420).delay(145)} style={{ gap: 8 }}>
            <TextSemi style={{ fontSize: 16 }}>Company GSTIN <TextBody style={{ fontSize: 13 }} color={colors.inkMute}>(optional)</TextBody></TextSemi>
            <TextInput
              value={gstin}
              onChangeText={(v) => setGstin(v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
              placeholder="15-digit GSTIN for a company bill"
              placeholderTextColor={colors.inkMute}
              autoCapitalize="characters"
              style={{ borderWidth: 1.5, borderColor: gstinError ? '#C0344D' : colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 52, fontSize: 15, color: colors.ink, backgroundColor: colors.white, fontFamily: fonts.sansMed }}
            />
            {gstinError ? (
              <TextBody style={{ fontSize: 12 }} color="#C0344D">
                Enter the full 15-character GSTIN, or leave it blank.
              </TextBody>
            ) : null}
          </Animated.View>

          <Divider />

          <Animated.View entering={FadeInDown.duration(420).delay(150)} style={{ gap: 6 }}>
            <TextSemi style={{ fontSize: 16 }}>About this product</TextSemi>
            <TextBody style={{ fontSize: 14.5, lineHeight: 22 }}>{product.description}</TextBody>
          </Animated.View>

          {reviews.length ? (
            <>
              <Divider />
              <Animated.View entering={FadeInDown.duration(420).delay(160)} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TextSemi style={{ fontSize: 16 }}>Ratings & reviews</TextSemi>
                  {product.rating ? <Stars rating={product.rating} count={product.ratingCount} size={13} /> : null}
                </View>
                {reviews.map((r) => (
                  <View key={r.id} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 7 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                          <TextSemi style={{ fontSize: 14 }} color={colors.flameDeep}>{r.author.charAt(0)}</TextSemi>
                        </View>
                        <View>
                          <TextSemi style={{ fontSize: 13.5 }}>{r.author}</TextSemi>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                            <Stars rating={r.stars} size={10} showValue={false} />
                            {r.verified ? <TextMed style={{ fontSize: 10.5 }} color={colors.blue}>Verified buyer</TextMed> : null}
                          </View>
                        </View>
                      </View>
                      <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>{r.date}</TextBody>
                    </View>
                    <TextBody style={{ fontSize: 13.5, lineHeight: 20 }}>{r.text}</TextBody>
                  </View>
                ))}
              </Animated.View>
            </>
          ) : null}

          <Divider />

          {/* Product information · FSSAI / Legal Metrology / GST (required on listings) */}
          <Animated.View entering={FadeInDown.duration(420).delay(170)} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextSemi style={{ fontSize: 16 }}>Product information</TextSemi>
              <VegMark veg={compliance.veg} />
            </View>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 2 }}>
              <InfoRow label="Net quantity" value={compliance.netQuantity} />
              <InfoRow label="MRP (incl. of all taxes)" value={rupee(product.mrp ?? product.price)} />
              <InfoRow label="Ingredients" value={compliance.ingredients} />
              {compliance.nutrition ? <InfoRow label="Nutrition" value={compliance.nutrition} /> : null}
              <InfoRow label="Allergens" value={compliance.allergens} />
              <InfoRow label="Shelf life" value={compliance.shelfLife} />
              <InfoRow label="Storage" value={compliance.storage} />
              <InfoRow label="Country of origin" value={compliance.countryOfOrigin} />
              <InfoRow label="HSN / GST" value={`${compliance.hsn} · ${compliance.gstRate}% GST`} />
              <InfoRow label="Manufacturer" value={compliance.manufacturer} />
              <InfoRow label="Mfg. address" value={compliance.manufacturerAddress} />
              <InfoRow label="FSSAI licence" value={compliance.fssaiLicense} />
              <InfoRow label="Customer care" value={`${compliance.customerCare} · ${compliance.customerCareEmail}`} last />
            </View>
            <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>Batch number, packing date and best-before are printed on each pack and shown on your invoice.</TextBody>
          </Animated.View>

          <Divider />

          {/* Trust row */}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {[
              { icon: 'leaf-outline', label: 'Quality checked' },
              { icon: 'snow-outline', label: 'Cold chain' },
              { icon: 'time-outline', label: 'Fresh by 7 AM' },
            ].map((t) => (
              <View key={t.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={t.icon as any} size={20} color={colors.flameDeep} />
                </View>
                <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>{t.label}</TextBody>
              </View>
            ))}
          </View>

          {err ? <TextBody color={colors.danger} style={{ fontSize: 13, textAlign: 'center' }}>{err}</TextBody> : null}
        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <Glass
        glass="regular"
        intensity={70}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, borderTopWidth: 1, borderTopColor: colors.line, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Serif style={{ fontFamily: fonts.serifBlack, fontSize: 24, letterSpacing: -0.5, ...tabular }} color={headlineColor}>{rupee(total)}</Serif>
            {strike * qty > total ? <TextBody style={{ fontSize: 13, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(strike * qty)}</TextBody> : null}
          </View>
          <TextBody style={{ fontSize: 11 }}>{product.outOfStock ? (notified ? "You're on the restock list" : 'Out of stock · we can notify you') : 'Charged after delivery'}</TextBody>
        </View>
        <View style={{ flex: 1 }}>
          {product.outOfStock ? (
            notified ? (
              <View style={{ borderRadius: radius.pill, backgroundColor: colors.wash, borderWidth: 1.5, borderColor: colors.line, height: 54, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.flameDeep} />
                <TextSemi color={colors.inkMute} style={{ fontSize: 15, letterSpacing: 0.5 }}>WE'LL NOTIFY YOU</TextSemi>
              </View>
            ) : (
              /* Restock demand capture: the member's data lands on the backend
                 the moment they ask (same hook as hearting the card). */
              <ProceedButton title="Notify me" loading={busy} onPress={notifyMe} />
            )
          ) : shortfall > 0 ? (
            <ProceedButton title="Add money to wallet" loading={false} onPress={() => goRecharge(shortfall)} />
          ) : (
            <ProceedButton
              title={product.subscribable && freq !== 'one_time' ? 'Subscribe' : 'Add to cart'}
              loading={busy}
              onPress={onPrimary}
            />
          )}
        </View>
      </Glass>

      {showCal ? (
        <StartDatePicker
          value={startDate}
          minISO={tomorrowISO()}
          onConfirm={(iso) => { setStartDate(iso); setShowCal(false); }}
          onClose={() => setShowCal(false)}
        />
      ) : null}

      {/* Subscribe bottom sheet (recurring milk) */}
      <SubscribeSheet
        visible={showSubscribe}
        product={product}
        unitPrice={unit}
        savedPer={savedPer}
        initialQty={qty}
        initialFreq={freq === 'one_time' ? 'daily' : freq}
        initialStartDate={startDate}
        onClose={() => setShowSubscribe(false)}
        onConfirmed={onSubscribed}
      />
    </View>
  );
}

// Small gold "crown" badge built from views (member-price marker).
function CrownBadge() {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.inkDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: GOLD_BRIGHT }}>
      <Ionicons name="star" size={13} color={GOLD_BRIGHT} />
    </View>
  );
}

// Glowing, shining PROCEED button.
// Green-dot veg mark (FSSAI). A green square with a filled dot; contained, no bleed.
function VegMark({ veg }: { veg: boolean }) {
  const c = veg ? '#2E7D32' : '#B71C1C';
  return (
    <View style={{ width: 16, height: 16, borderWidth: 1.5, borderColor: c, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: veg ? 4 : 0, backgroundColor: c }} />
    </View>
  );
}

// One label/value row in the product-information (compliance) card.
function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line, alignItems: 'flex-start' }}>
      <TextBody style={{ width: 132, fontSize: 12.5 }} color={colors.inkMute}>{label}</TextBody>
      <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.ink}>{value}</TextMed>
    </View>
  );
}

function ProceedButton({ title, loading, onPress }: { title: string; loading: boolean; onPress: () => void }) {
  return (
    <View>
      <GlowPulse color={colors.flameDeep} radius={radius.pill} />
      <Tap onPress={loading ? undefined : onPress}>
        <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.flameDeep, height: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
          <Text style={{ color: '#fff', fontSize: 16.5, fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>{loading ? 'Setting up…' : title}</Text>
          {!loading ? <Ionicons name="arrow-forward" size={18} color="#fff" /> : null}
          <ShineSweep dur={2400} travel={300} bandWidth={64} angle="16deg" delay={400} />
        </View>
      </Tap>
    </View>
  );
}

/**
 * Front + back pack photos in a swipeable pager with sliding dots (the same dot
 * language as the landing/hero slideshows). Falls back to the single front
 * image — identical layout, no dots — when we have no real back photo, so
 * nothing changes for SKUs that were photographed front-only.
 */
function ProductPhotoPager({ product }: { product: Product & { packCount?: number } }) {
  const { width } = useWindowDimensions();
  const back = backImageFor(product);
  const [page, setPage] = useState(0);
  const img = product.image;
  if (!img) return null; // caller renders the name fallback instead
  const front =
    product.packCount && product.packCount >= 2 ? (
      <View style={{ width, height: 280 }}>
        <StackedProductImage source={img} count={product.packCount} width="66%" height="80%" />
      </View>
    ) : (
      <Image source={img} style={{ width, height: 280 }} contentFit="contain" transition={250} />
    );
  if (!back) return front;
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
      >
        {front}
        <Image source={back} style={{ width, height: 280 }} contentFit="contain" transition={250} />
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{ width: i === page ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === page ? colors.flameDeep : colors.flameSoft }}
          />
        ))}
      </View>
    </View>
  );
}

const iconBtn = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.white,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  ...shadow.soft,
};
