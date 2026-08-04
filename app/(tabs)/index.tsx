import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { colors, radius, spacing, shadow, rupee } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from '../../components/ui';
import { ProductCard } from '../../components/ProductCard';
import { SubscriptionStatusCard } from '../../components/SubscriptionStatusCard';
import { WelcomeOffer, welcomeOfferSeen, markWelcomeOfferSeen } from '../../components/WelcomeOffer';
import { ClaimPackFlow, claimFlowOnScreen } from '../../components/ClaimPackFlow';
import { ShopSkeleton } from '../../components/Skeleton';
import { HomeHeader, useHomeHeaderHeight } from '../../components/HomeHeader';
import { BottomBar, useBottomBarClearance } from '../../components/BottomBar';
import { DeliveryStrip } from '../../components/DeliveryStrip';
import { HeroSlideshow } from '../../components/HeroSlideshow';
import { CATEGORIES, type Category } from '../../constants/products';
import { useCatalog, getMergedProducts, refreshCatalog, groupProducts, type GroupedProduct } from '../../lib/catalog';
import { PromoGate } from '../../components/PromoGate';
import { ComingSoon } from '../../components/ComingSoon';
import { useServiceability } from '../../lib/serviceability';
import { useCart } from '../../store/cart';
import { listOrders, type Order } from '../../lib/api';
import { STATUS_LABEL } from '../../lib/orderStatus';
import { useDeliveryMode, setDeliveryMode, instantEtaHHMM, hhmmTo12 } from '../../lib/deliveryMode';
import { freePackShowEligible, onFreePackChanged, FREE_PACK_PRODUCT_ID, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../../lib/freePack';
import { PREPAID_TARGET, prepaidTier } from '../../lib/prepaid';
import { listSubscriptions } from '../../lib/subscriptions';
import { sweepDueSubscriptions } from '../../lib/subscriptionSweep';
import { useWallet } from '../../store/wallet';
import { useFavorites } from '../../store/favorites';
import { useAuth } from '../../lib/auth';
import { haptics } from '../../lib/haptics';

// The free-trial pack shown on every funnel surface: PYAAS Gold FULL CREAM.
const FREE_PACK_IMG = require('../../assets/products/gold.png');

// Ionicons for each catalog category (outline set), used in the category rail.
const CAT_ICON: Record<string, string> = {
  all: 'grid',
  milk: 'water',
  dahi: 'nutrition',
  paneer: 'cube',
  ghee: 'flame',
  butter: 'square',
  chaach: 'wine',
  flavoured_milk: 'cafe',
  mattha: 'beaker',
  lassi: 'wine',
  khoya: 'gift',
  super_tea: 'cafe',
  sweets: 'ice-cream',
};

// Small real product photo per category for the category rail (All keeps the
// grid icon). Reuses the bundled pack shots.
const CAT_IMAGE: Record<string, ReturnType<typeof require>> = {
  milk: require('../../assets/products/pyaas-toned-pouch.png'),
  dahi: require('../../assets/products/dahi-cup.png'),
  paneer: require('../../assets/products/paneer.png'),
  ghee: require('../../assets/products/ghee.png'),
  butter: require('../../assets/products/butter.png'),
  chaach: require('../../assets/products/chaach.png'),
  flavoured_milk: require('../../assets/products/flavoured-milk.png'),
  mattha: require('../../assets/products/masala-mattha.png'),
  lassi: require('../../assets/products/lassi.png'),
  khoya: require('../../assets/products/khoya.png'),
  super_tea: require('../../assets/products/chai-special.png'),
  sweets: require('../../assets/products/besan-ladoo.png'),
};

export default function Shop() {
  const router = useRouter();
  const { profile } = useAuth();
  const refreshWallet = useWallet((s) => s.refresh);
  const lowBalance = useWallet((s) => s.lowBalance);
  const balance = useWallet((s) => s.balance);
  const refreshFavs = useFavorites((s) => s.refresh);
  const favIds = useFavorites((s) => s.ids);
  const headerH = useHomeHeaderHeight();
  const bottomClearance = useBottomBarClearance();
  // Live merged catalog (bundled list + store-manager overlay): refetches on
  // mount and every 60s, so a price/stock change shows without a reload.
  const products = useCatalog();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  // MORNING | INSTANT mode the whole home screen carries (shared store — the
  // product page honours it too). 'scheduled' (set elsewhere) renders as Morning.
  const mode = useDeliveryMode();
  const instant = mode === 'instant';
  // Serviceability gate. `serviceable === null` = still resolving (show the normal
  // skeleton); `false` = out of zone (show Coming Soon); `true` = shop as usual.
  const svcServiceable = useServiceability((s) => s.serviceable);
  const instantServed = useServiceability((s) => s.instant);
  const instantClosed = useServiceability((s) => s.instantClosed);
  const instantResumesLabel = useServiceability((s) => s.instantResumesLabel);
  const svcCheck = useServiceability((s) => s.check);
  // If the serving store doesn't run the ⚡ instant lane here, never leave the
  // member stranded on the (now disabled) Instant tab — fall back to Morning.
  useEffect(() => {
    if (instantServed === false && mode === 'instant') setDeliveryMode('morning');
  }, [instantServed, mode]);
  // Lane split for the Track strip: truly-instant = lane says instant AND the
  // 'by HH:MM' window shape (legacy rows carried a lane default and must stay
  // in the Morning world).
  const isInstantOrder = useCallback(
    (o: Order) => o.lane === 'instant' && (o.delivery_window ?? '').toLowerCase().startsWith('by '),
    [],
  );
  const stripOrders = useMemo(
    () => activeOrders.filter((o) => (instant ? isInstantOrder(o) : !isInstantOrder(o))),
    [activeOrders, instant, isInstantOrder],
  );
  // Free-pack funnel: the punchy claim card shows while this phone/device is
  // still eligible (the selling point stays visible even after a snooze).
  const [claimEligible, setClaimEligible] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  // FRESH user = no active/paused subscription AND has never redeemed the 2+2
  // trial. Only these members see the middle "start your subscription" strip.
  const [freshUser, setFreshUser] = useState(false);
  // Whether the member has an active/paused subscription — gates the low-wallet
  // "tomorrow's delivery may pause" nudge (never nag a fresh 0-wallet user).
  const [hasSub, setHasSub] = useState(false);
  const phone = profile?.phone ?? '';

  const recheckClaim = useCallback(() => {
    if (!phone) { setClaimEligible(false); return; }
    // PER-USER show eligibility (not the device-capped claim gate) so a brand-new
    // sign-in on any device sees the trial banner/card until THEY claim it.
    freePackShowEligible(phone)
      .then((show) => setClaimEligible(show))
      .catch(() => setClaimEligible(false));
  }, [phone]);

  // A member is "fresh" (a candidate for the 2+2 subscription starter) when they
  // hold NO active/paused subscription. We deliberately do NOT read the backend
  // trial ledger here: GET /consumer/trial/me upserts phase='paid' for EVERY
  // consumer on first read, so keying "redeemed" off it made freshUser always
  // false and hid the whole Home trial funnel. Whether they've actually redeemed
  // the 2+2 is encoded in `claimEligible` (freePackShowEligible → false once the
  // pack is claimed), which gates the render sites alongside freshUser.
  const recheckFresh = useCallback(() => {
    listSubscriptions()
      .then((subs) => {
        // A one-time order is NOT an ongoing subscription — exclude it so a single
        // instant buy never flips the member out of the "fresh" 2+2 funnel.
        const anySub = subs.some((s) => (s.status === 'active' || s.status === 'paused') && s.frequency !== 'one_time');
        // The 2+2 offer applies ONLY to SUBSCRIBING the full cream (the offer
        // SKU). A Taaza (or any other SKU) subscriber is still a candidate, and
        // a PAUSED full-cream sub still owes its paid day(s) — only an ACTIVE
        // full-cream subscription ends the "fresh" funnel (its progress card
        // owns the home screen; claimEligible closes it for good on completion).
        const goldActive = subs.some(
          (s) => s.product_id === FREE_PACK_PRODUCT_ID && s.status === 'active' && s.frequency !== 'one_time',
        );
        setHasSub(anySub); // the low-wallet delivery nudge still keys off ANY sub
        setFreshUser(!goldActive);
      })
      .catch(() => { setHasSub(false); setFreshUser(false); });
  }, []);

  // WELCOME OFFER: the very first time a member lands signed-in, greet them with
  // the animated confetti offer (once per account). On later launches an eligible
  // fresh member goes straight to the 2-day-free claim popup, once per app launch.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const autoOpenedClaim = React.useRef(false);
  useEffect(() => {
    if (autoOpenedClaim.current || !freshUser || !claimEligible) return;
    // The tabs-level ClaimPackGate may already be showing the flow — never
    // stack this screen's own instance (or the welcome offer) on top of it.
    if (claimFlowOnScreen()) return;
    const uid = profile?.id;
    if (!uid) return;
    autoOpenedClaim.current = true;
    void welcomeOfferSeen(uid).then((seen) => {
      if (seen) { if (!claimFlowOnScreen()) setClaimOpen(true); return; }
      void markWelcomeOfferSeen(uid);
      setWelcomeOpen(true);
    });
  }, [freshUser, claimEligible, profile?.id]);

  // Active orders drive the "Track your order" strip. Refetched whenever the
  // home tab regains focus; renders nothing gracefully when there are none.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      const loadOrders = () =>
        listOrders()
          .then((os) => {
            if (on) setActiveOrders(os.filter((o) => !['delivered', 'cancelled'].includes(o.status)));
          })
          .catch(() => { /* signed out / offline — show nothing */ });
      loadOrders();
      // Re-evaluate serviceability on every Home focus — if the member switched
      // their default address, the point (and its cache signature) changed, so
      // the gate + instant availability refresh. Cached/no-op for the same point.
      void svcCheck();
      // SUBSCRIPTION SWEEP: turn today's due subscriptions into real morning
      // orders (idempotent per sub+day). Runs on launch + every home focus,
      // non-blocking and error-soft; when it places anything, re-pull the
      // wallet + the order strip so the new delivery shows immediately.
      void sweepDueSubscriptions()
        .then((placed) => {
          if (placed > 0 && on) { void refreshWallet(); loadOrders(); }
        })
        .catch(() => { /* error-soft — retried on next focus */ });
      recheckClaim();
      recheckFresh();
      // The boot modal can claim while home stays focused (no focus change) —
      // subscribe so the claim card + fresh-user strip hide the moment ANY path
      // claims the pack / starts the subscription.
      const off = onFreePackChanged(() => { recheckClaim(); recheckFresh(); });
      return () => { on = false; off(); };
    }, [recheckClaim, recheckFresh, refreshWallet, svcCheck])
  );
  // On every Home focus, re-pull the live catalog and flag any cart line that
  // just went out of stock (or was hidden) so a stale cart can't be checked out.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      void refreshCatalog().then(() => { if (on) useCart.getState().revalidateStock(getMergedProducts()); });
      useCart.getState().revalidateStock(getMergedProducts()); // flag against the current snapshot immediately
      return () => { on = false; };
    }, [])
  );

  const onScroll = useHideTabBarOnScroll(); // hides the header + bottom bar + tab bar on scroll-down

  // Pull-to-refresh: re-pull dynamic data when the feed is dragged past the top.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshWallet(); } catch { /* fail soft */ }
    await new Promise((r) => setTimeout(r, 500)); // min spinner so it reads as a refresh
    setRefreshing(false);
  }, [refreshWallet]);

  useEffect(() => {
    let active = true;
    refreshFavs();
    // Resolve serviceability for the member's delivery point (cached + fail-open).
    void svcCheck();
    refreshWallet().finally(() => active && setReady(true));
    return () => { active = false; };
  }, [refreshWallet, refreshFavs, svcCheck]);

  // One card per base: the grid is grouped (500 ml · 1 L collapse into a single
  // card with a size selector). The Most-ordered / favourites shelves below stay
  // per-variant (curated single SKUs).
  const groups = useMemo(() => groupProducts(products), [products]);
  const data = useMemo(() => {
    const list = cat === 'all' ? groups : groups.filter((g) => g.base.category === cat);
    // A group is in stock while ANY of its size variants is orderable. Sort so
    // in-stock groups lead and out-of-stock ones sink to the bottom, and pin
    // PYAAS Taaza (the hero SKU) to the very top. WITHIN the out-of-stock tier
    // the order is: PYAAS-branded packs (ids `pyaas-*` — the white PYAAS
    // pouches/cartons) first, then the Parag range, with the partner
    // (manufacturer-tagged) teasers last. Array.sort is stable (Hermes), so
    // within each bucket the authored catalog order is preserved.
    const inStock = (g: GroupedProduct) => g.variants.some((v) => !v.outOfStock);
    const isTaaza = (g: GroupedProduct) => g.base.id === 'taaza-500ml' || /taaza/i.test(g.base.name);
    const isPyaasBrand = (g: GroupedProduct) => g.variants.some((v) => v.id.startsWith('pyaas-'));
    const isPartner = (g: GroupedProduct) => g.variants.some((v) => !!v.manufacturer);
    return [...list].sort((a, b) => {
      if (isTaaza(a) !== isTaaza(b)) return isTaaza(a) ? -1 : 1;
      const sa = inStock(a) ? 0 : 1;
      const sb = inStock(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (sa === 1) {
        if (isPyaasBrand(a) !== isPyaasBrand(b)) return isPyaasBrand(a) ? -1 : 1;
        if (isPartner(a) !== isPartner(b)) return isPartner(a) ? 1 : -1;
      }
      return 0;
    });
  }, [cat, groups]);
  const popular = useMemo(() => products.filter((p) => p.mostOrdered), [products]);
  const favorites = useMemo(() => favIds.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p), [favIds, products]);
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

  // Out-of-zone gate — a resolved `serviceable === false` swaps the whole shop for
  // the friendly Coming Soon screen. `null` (still resolving) falls through to the
  // normal skeleton below, so a slow check never flashes the gate.
  if (svcServiceable === false) return <ComingSoon />;

  if (!ready) return <ShopSkeleton />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <Animated.FlatList
        data={data}
        keyExtractor={(g) => g.base.id}
        numColumns={2}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.flameDeep} colors={[colors.flameDeep]} progressViewOffset={headerH} />
        }
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingTop: headerH + 6, paddingBottom: bottomClearance, gap: spacing.sm }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* MORNING | INSTANT mode toggle · the very top of the feed */}
            <Animated.View entering={FadeInDown.duration(400)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              <DeliveryModeToggle instant={instant} instantServed={instantServed !== false} instantClosed={instantClosed} resumesLabel={instantResumesLabel} />
            </Animated.View>

            {/* PREPAID FUNNEL BANNER · shown to an EXISTING subscriber whose prepaid
                balance is below the target. Critically-low (delivery could pause) is
                an urgent red strip; otherwise the pink "go prepaid + bonus" upsell.
                Never nags a fresh 0-wallet, no-subscription user (they see the trial). */}
            {hasSub && balance < PREPAID_TARGET ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                {lowBalance ? (
                  <Tap onPress={() => router.push(`/recharge?amount=${PREPAID_TARGET}&reason=go prepaid for one-tap mornings`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.action, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, ...shadow.soft }}>
                    <Ionicons name="wallet" size={18} color={colors.gold} />
                    <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.white}>Low wallet. Add {rupee(PREPAID_TARGET)} so tomorrow's delivery isn't paused.</TextMed>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
                  </Tap>
                ) : (
                  <Tap onPress={() => router.push(`/recharge?amount=${PREPAID_TARGET}&reason=go prepaid for one-tap mornings`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.flame, paddingHorizontal: 14, paddingVertical: 11, ...shadow.soft }}>
                    <Ionicons name="wallet" size={18} color={colors.flameDeep} />
                    <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.ink}>Go prepaid: add {rupee(PREPAID_TARGET)} for one-tap mornings</TextMed>
                    <Ionicons name="chevron-forward" size={16} color={colors.flameDeep} />
                  </Tap>
                )}
              </Animated.View>
            ) : null}

            {/* (The small "start your subscription" strip that sat here was
                redundant with the big trial card below — removed.) */}

            {/* Track your order · MODE-AWARE: the Instant world only tracks
                instant orders, the Morning world tracks the scheduled ones —
                a scheduled order's tracker never bleeds into the Instant view
                (that read as "I never placed an instant order?!"). An order is
                truly instant only when lane says so AND its window is the
                'by HH:MM' shape (legacy rows carried lane defaults). */}
            {stripOrders.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                <Tap
                  onPress={() =>
                    stripOrders.length === 1
                      ? router.push(`/order/${stripOrders[0].id}`)
                      : router.push('/(tabs)/orders')
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameDeep, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, ...shadow.soft }}
                >
                  <Ionicons name="bicycle" size={20} color={colors.white} />
                  <View style={{ flex: 1 }}>
                    <TextMed style={{ fontSize: 13.5 }} color={colors.white}>
                      {stripOrders.length === 1 ? 'Track your order' : `Track your ${stripOrders.length} orders`}
                    </TextMed>
                    <TextBody style={{ fontSize: 11.5 }} color="rgba(255,255,255,0.85)">
                      {stripOrders.length === 1 ? STATUS_LABEL[stripOrders[0].status] : 'Tap to see all active orders'}
                    </TextBody>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
                </Tap>
              </Animated.View>
            ) : null}

            {/* Morning: the delivery calendar strip. Instant: swapped for the
                ~20-minute ETA banner (no calendar — it's a now order). */}
            {instant ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flameDeep, paddingHorizontal: 14, paddingVertical: 12, ...shadow.soft }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="flash" size={19} color={colors.flameDeep} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <TextSemi style={{ fontSize: 14.5 }}>Arrives in ~20 minutes</TextSemi>
                    <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>
                      Order now · at your door by {hhmmTo12(instantEtaHHMM()) ?? 'the next slot'}
                    </TextBody>
                  </View>
                  <Pill label="⚡ INSTANT" bg={colors.flameSoft} color={colors.flameDeep} />
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.duration(440)}>
                <DeliveryStrip />
              </Animated.View>
            )}

            {/* Free-pack funnel · the selling point, punchy pink gradient card.
                Fresh members only (no active/paused subscription and the trial not
                yet redeemed) — an existing subscriber is never nudged to "start". */}
            {freshUser && claimEligible ? (
              <Animated.View entering={FadeInDown.duration(440).delay(40)} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
                <Tap weight="medium" onPress={() => setClaimOpen(true)} style={{ borderRadius: radius.lg, overflow: 'hidden', ...shadow.card }}>
                  <LinearGradient colors={[colors.flameDeep, colors.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
                    <Image source={FREE_PACK_IMG} style={{ width: 58, height: 58 }} contentFit="contain" />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row' }}>
                        <Pill small label={`${TRIAL_FREE_DAYS} DAYS FREE`} bg={colors.white} color={colors.blue} />
                      </View>
                      <TextSemi color={colors.white} style={{ fontSize: 15 }} numberOfLines={1}>Start your subscription</TextSemi>
                      <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>
                        Pay {TRIAL_PAID_DAYS} days, get {TRIAL_FREE_DAYS} FREE 🎉 · 500 ml every morning · pause anytime
                      </TextBody>
                    </View>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="gift" size={17} color={colors.white} />
                    </View>
                  </LinearGradient>
                </Tap>
              </Animated.View>
            ) : null}

            {/* Subscription live-status · sits under the claim card position.
                While the claim card is up it stays quiet unless a sub exists. */}
            <Animated.View entering={FadeInDown.duration(440).delay(60)} style={{ paddingHorizontal: spacing.lg }}>
              <SubscriptionStatusCard showEmpty={!claimEligible} onClaim={() => setClaimOpen(true)} style={{ marginBottom: spacing.md }} />
            </Animated.View>

            {/* Hero · auto-advancing slideshow of the brand creatives */}
            <Animated.View entering={FadeInDown.duration(440).delay(80)}>
              <HeroSlideshow />
            </Animated.View>

            {/* Category rail · horizontally scrollable (PYAAS has many ranges) */}
            <Animated.View entering={FadeInDown.duration(440).delay(160)} style={{ marginBottom: spacing.md }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.lg }}>
                {CATEGORIES.map((c) => {
                  const active = cat === c.key;
                  const photo = CAT_IMAGE[c.key];
                  return (
                    <Tap key={c.key} haptic={false} onPress={() => setCat(c.key)} style={{ alignItems: 'center', gap: 6, width: 72 }}>
                      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: active ? colors.flameSoft : colors.white, borderWidth: 1.5, borderColor: active ? colors.flameDeep : colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow.soft }}>
                        {photo ? (
                          <Image source={photo} style={{ width: 48, height: 48 }} contentFit="contain" />
                        ) : (
                          <Ionicons name={`${CAT_ICON[c.key] ?? 'grid'}-outline` as any} size={24} color={colors.flameDeep} />
                        )}
                      </View>
                      <TextMed color={active ? colors.flameDeep : colors.inkSoft} style={{ fontSize: 11.5 }} numberOfLines={1}>{c.label}</TextMed>
                    </Tap>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Most ordered shelf · bestsellers, only on the unfiltered feed */}
            {cat === 'all' && popular.length ? (
              <Animated.View entering={FadeInDown.duration(440).delay(200)} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.lg, marginBottom: 10 }}>
                  <Ionicons name="flame" size={18} color={colors.flameDeep} />
                  <Serif style={{ fontSize: 19 }}>Most ordered</Serif>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 4 }}>
                  {/* Static pack-shot cards: the shelf scrolls, the cards never flip. */}
                  {popular.map((p, i) => (
                    <View key={p.id} style={{ width: 168 }}>
                      <ProductCard product={p} index={i} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} />
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            ) : null}

            {/* Your favorites shelf */}
            {cat === 'all' && favorites.length ? (
              <Animated.View entering={FadeInDown.duration(440).delay(220)} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.lg, marginBottom: 10 }}>
                  <Ionicons name="heart" size={17} color={colors.flameDeep} />
                  <Serif style={{ fontSize: 19 }}>Your favorites</Serif>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 4 }}>
                  {favorites.map((p, i) => (
                    <View key={p.id} style={{ width: 168 }}>
                      <ProductCard product={p} index={i} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} />
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            ) : null}

            {cat === 'all' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.lg, marginBottom: 10 }}>
                <Ionicons name="storefront-outline" size={17} color={colors.ink} />
                <Serif style={{ fontSize: 19 }}>All products</Serif>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={{ flex: 1, maxWidth: '50%' }}>
            <ProductCard product={item.base} variants={item.variants} index={index} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} />
          </View>
        )}
        ListFooterComponent={
          /* Quiet partner-brand sign-off, ONLY when PYAAS SKUs are actually in
             the visible grid (all/milk) - under any other filter the caption
             would misattribute the manufacturer's products. Deliberately understated:
             tiny wordmark at low opacity + one muted caption line. */
          data.some((g) => g.variants.some((v) => v.manufacturer)) ? (
            <View style={{ alignItems: 'center', paddingTop: spacing.lg, gap: 7 }}>
              <Image source={require('../../assets/pyaas-logo.png')} style={{ width: 62, height: 17, opacity: 0.35 }} contentFit="contain" />
              <TextBody color={colors.inkMute} style={{ fontSize: 10.5, letterSpacing: 0.4 }}>PYAAS range · marketed & manufactured by PYAAS</TextBody>
            </View>
          ) : null
        }
      />

      <HomeHeader firstName={firstName} />
      <BottomBar />

      {/* Floating "View cart" bar — appears ONLY when the ACTIVE lane's cart
          has items (⚡ instant and morning carts are separate), sitting just
          above the bottom bar in both modes. */}
      <ViewCartBar bottomClearance={bottomClearance} />

      {/* Persistent promo loop · re-evaluates low-wallet / Become-VIP on every
          Home focus (dismissals reset so a banner re-shows next Home visit). */}
      <PromoGate />

      {/* Animated welcome offer: first signed-in landing only. Claiming hands
          straight into the subscription claim flow below. */}
      <WelcomeOffer
        visible={welcomeOpen}
        onClaim={() => { setWelcomeOpen(false); setClaimOpen(true); }}
        onClose={() => setWelcomeOpen(false)}
      />

      {/* Free-pack funnel sheet, opened from the claim card / status card */}
      <ClaimPackFlow
        visible={claimOpen}
        onClose={() => setClaimOpen(false)}
        onClaimed={() => { recheckClaim(); void refreshWallet(); }}
        onStartShopping={() => setClaimOpen(false)}
      />
    </View>
  );
}

/**
 * MORNING | INSTANT segmented control — original PYAAS design (white + pink,
 * fully rounded). Morning (left) carries the 5–7:30 AM window; Instant (right)
 * carries a ⚡ 20-minute mini-badge. Writes the shared delivery-mode store so
 * the product page and checkout honour the same mode.
 */
function DeliveryModeToggle({ instant, instantServed, instantClosed, resumesLabel }: { instant: boolean; instantServed: boolean; instantClosed?: boolean; resumesLabel?: string | null }) {
  // Instant segment disables when the address isn't served OR the store is shut
  // for the night; the note below explains which. Morning always stays available.
  const closedForNight = !!instantClosed;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: 4, gap: 4, ...shadow.soft }}>
        <ModeSegment
          active={!instant}
          onPress={() => setDeliveryMode('morning')}
          icon="sunny"
          label="Morning"
          sub="5–7:30 AM"
          a11yLabel="Morning delivery, 5 to 7:30 AM slot"
        />
        <ModeSegment
          active={instant && instantServed}
          disabled={!instantServed}
          onPress={() => setDeliveryMode('instant')}
          icon="flash"
          label="Instant"
          badge="⚡ 20 min"
          a11yLabel={instantServed ? 'Instant delivery, 20 minutes' : closedForNight ? `Instant closed, resumes ${resumesLabel ?? 'soon'}` : 'Instant delivery not available at your address yet'}
        />
      </View>
      {!instantServed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
          <Ionicons name={closedForNight ? 'moon-outline' : 'information-circle-outline'} size={13} color={closedForNight ? colors.flameDeep : colors.inkMute} />
          <TextMed style={{ fontSize: 11, flex: 1 }} color={closedForNight ? colors.flameDeep : colors.inkMute}>
            {closedForNight ? `⚡ Instant resumes ${resumesLabel ?? 'soon'}` : 'Instant not available at your address yet'}
          </TextMed>
        </View>
      ) : null}
    </View>
  );
}

function ModeSegment({ active, onPress, icon, label, sub, badge, a11yLabel, disabled }: { active: boolean; onPress: () => void; icon: any; label: string; sub?: string; badge?: string; a11yLabel?: string; disabled?: boolean }) {
  return (
    <Tap
      haptic={!disabled}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={a11yLabel ?? label}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: active ? colors.action : 'transparent', opacity: disabled ? 0.42 : 1, ...(active ? shadow.soft : null) }}
    >
      <Ionicons name={icon} size={15} color={active ? colors.onAction : colors.flameDeep} />
      <View style={{ alignItems: 'flex-start' }}>
        <TextSemi color={active ? colors.onAction : colors.ink} style={{ fontSize: 13.5, lineHeight: 16 }}>{label}</TextSemi>
        {sub ? (
          <TextMed color={active ? 'rgba(255,255,255,0.85)' : colors.inkMute} style={{ fontSize: 9.5, lineHeight: 12 }}>{sub}</TextMed>
        ) : null}
        {badge ? (
          <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.22)' : colors.flameSoft, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1, marginTop: 1 }}>
            {/* lineHeight ≥ ~1.5× font size: Devanagari matras ("मिनट") clip on
                Android under the previous 11px line box. */}
            <TextSemi color={active ? colors.onAction : colors.flameDeep} style={{ fontSize: 8.5, lineHeight: 13, letterSpacing: 0.2 }}>{badge}</TextSemi>
          </View>
        ) : null}
      </View>
    </Tap>
  );
}

/**
 * Floating "View cart" bar (both modes): shows the ACTIVE lane's item count and
 * opens the cart. Renders nothing while that lane's cart is empty, so the home
 * layout is untouched until the member actually adds something.
 */
function ViewCartBar({ bottomClearance }: { bottomClearance: number }) {
  const router = useRouter();
  const mode = useDeliveryMode();
  const lane = mode === 'instant' ? 'instant' : 'morning';
  const count = useCart((s) => s.lines.filter((l) => l.lane === lane).reduce((n, l) => n + l.qty, 0));
  if (count === 0) return null;
  return (
    <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: bottomClearance - 6 }}>
      <Tap onPress={() => { haptics.press(); router.push('/cart'); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameDeep, borderRadius: radius.pill, paddingHorizontal: 18, height: 52, ...shadow.card }}>
          <Ionicons name="bag-handle" size={18} color={colors.white} />
          <TextSemi color={colors.white} style={{ fontSize: 14.5, flex: 1 }}>
            {count} {count === 1 ? 'item' : 'items'} · {mode === 'instant' ? '⚡ Instant cart' : 'Morning cart'}
          </TextSemi>
          <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>View cart</TextSemi>
          <Ionicons name="chevron-forward" size={16} color={colors.white} />
        </View>
      </Tap>
    </View>
  );
}
