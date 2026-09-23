import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useHideTabBarOnScroll, navHidden } from '../../lib/navVisibility';
import { colors, radius, spacing, shadow, rupee } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from '../../components/ui';
import { ProductCard } from '../../components/ProductCard';
import { SubscriptionStatusCard } from '../../components/SubscriptionStatusCard';
import { WelcomeLitrePopup } from '../../components/WelcomeLitrePopup';
import { ShopSkeleton } from '../../components/Skeleton';
import { HomeHeader, useHomeHeaderHeight } from '../../components/HomeHeader';
import { BottomBar, useBottomBarClearance } from '../../components/BottomBar';
import { HeroSlideshow } from '../../components/HeroSlideshow';
import { ActiveOrdersCard } from '../../components/ActiveOrdersCard';
import { CATEGORIES, type Category } from '../../constants/products';
import { useCatalog, getMergedProducts, refreshCatalog, groupProducts, type GroupedProduct } from '../../lib/catalog';
import { PromoGate } from '../../components/PromoGate';
import { OutOfZoneSheet } from '../../components/OutOfZoneSheet';
import { usePopupSlot, anyPopupOpen } from '../../lib/popupGate';
import { useUserLocation } from '../../lib/userLocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useServiceability } from '../../lib/serviceability';
import { useCart } from '../../store/cart';
import { listOrders } from '../../lib/api';
import { useLiveOrders, isInstantOrder as isInstantLaneOrder } from '../../lib/orderTracking';
import { instantWindow } from '../../lib/instantHours';
import { recordDeliveredCount, shouldAskForRating, requestNativeReview } from '../../lib/appReview';
import { useDeliveryMode, setDeliveryMode, instantEtaHHMM, hhmmTo12 } from '../../lib/deliveryMode';
import { getWelcomeFunnelState, type WelcomeFunnelState } from '../../lib/crm';
import { PREPAID_TARGET } from '../../lib/prepaid';
import { balanceTier, MIN_RECHARGE } from '../../lib/pricing';
import { listSubscriptions } from '../../lib/subscriptions';
import { sweepDueSubscriptions } from '../../lib/subscriptionSweep';
import { useWallet } from '../../store/wallet';
import { useFavorites } from '../../store/favorites';
import { useAuth } from '../../lib/auth';
import { haptics } from '../../lib/haptics';
import { spring } from '../../lib/motion';
import { PopOnChange } from '../../components/Pop';
import { useBottomChrome, showToast } from '../../components/Toast';

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
  // Out-of-zone popout — THE RULES (founder, 18 Aug):
  //   1. NEVER before the member has explicitly set a location. The app's
  //      fallback point (city default / saved address resolution) must not
  //      trigger it — a brand-new user who hasn't touched location sees the
  //      browse-only shop quietly, popup-free.
  //   2. Once the member taps it away (either button), it stays away FOR THAT
  //      LOCATION permanently (persisted on disk, not per-session), and only a
  //      DIFFERENT unserviceable location may show it again.
  //   3. Never over another popup.
  //   4. Only on a verdict computed FOR the chosen location. The store keeps
  //      the PREVIOUS point's verdict while a fresh check is in flight, so a
  //      member switching from an out-of-zone pin to Lucknow briefly reads
  //      `serviceable: false` next to the new coords — popping on that stale
  //      pair showed "unserviceable" in a fully serviceable area.
  const userLoc = useUserLocation((s) => s.loc);
  const svcLoading = useServiceability((s) => s.loading);
  const svcLat = useServiceability((s) => s.lat);
  const svcLng = useServiceability((s) => s.lng);
  const [oozOpen, setOozOpen] = useState(false);
  usePopupSlot(oozOpen);
  const oozSig = useRef<string | null>(null);
  useEffect(() => {
    if (!userLoc) return;                    // rule 1: no explicit location yet
    if (svcServiceable !== false) return;    // serviceable — nothing to say
    if (svcLoading) return;                  // rule 4: verdict still resolving
    if (svcLat == null || svcLng == null) return;
    if (Math.abs(svcLat - userLoc.coords.lat) > 0.001 || Math.abs(svcLng - userLoc.coords.lng) > 0.001) {
      return;                                // rule 4: verdict is for a different point
    }
    const sig = `pyaas_ooz_ack:${userLoc.coords.lat.toFixed(3)},${userLoc.coords.lng.toFixed(3)}`;
    let on = true;
    AsyncStorage.getItem(sig).then((ack) => {
      if (!on || ack === '1') return;        // rule 2: already acknowledged
      if (anyPopupOpen()) return;            // rule 3: one popup at a time
      oozSig.current = sig;
      setOozOpen(true);
    }).catch(() => { /* storage unreadable — stay quiet */ });
    return () => { on = false; };
  }, [svcServiceable, svcLoading, svcLat, svcLng, userLoc]);
  const dismissOoz = useCallback(() => {
    setOozOpen(false);
    // The member clicked it — acknowledged for this location, permanently.
    if (oozSig.current) void AsyncStorage.setItem(oozSig.current, '1').catch(() => {});
  }, []);
  // LIVE TRACKING: poll the member's own orders while Home is on screen, so a
  // rider moving through the states updates the card here AND fires the
  // notification (lib/orderTracking owns both, idempotently).
  const live = useLiveOrders(true);
  // Lane split for the tracking cards: truly-instant = lane says instant AND
  // the 'by HH:MM' window shape (legacy rows carried a lane default and must
  // stay in the Morning world).
  const trackedOrders = useMemo(
    () => live.orders.filter((o) => (instant ? isInstantLaneOrder(o) : !isInstantLaneOrder(o))),
    [live.orders, instant],
  );
  // INSTANT HOURS: the published window is the floor under the store manager's
  // toggle, so the lane is never advertised at 2 AM even if the backend is
  // stale or silent. Closed-for-night NEVER removes the segment — it explains
  // itself and names the hour it opens (founder call, 18 Sep).
  const win = instantWindow(live.now);
  const instantOpen = instantServed !== false && !instantClosed && win.open;
  const instantNote = !win.open ? win.note : instantClosed ? `Instant resumes ${instantResumesLabel ?? 'soon'}` : instantServed === false ? 'Instant is not available at your address yet' : null;
  // A shut lane must never leave the member stranded in the Instant world —
  // the shop falls back to Morning, which is always open.
  useEffect(() => {
    if (!instantOpen && mode === 'instant') setDeliveryMode('morning');
  }, [instantOpen, mode]);
  // Whether the member has an active/paused subscription — gates the low-wallet
  // "tomorrow's delivery may pause" nudge (never nag a fresh 0-wallet user).
  const [hasSub, setHasSub] = useState(false);

  // SERVER-TRUTH Welcome Litre funnel state (null = backend doesn't speak CRM
  // → the legacy 2+2 rules stay in force; freePackShowEligible cedes when
  // non-null, so exactly ONE acquisition pitch can ever render).
  const [wlState, setWlState] = useState<WelcomeFunnelState | null>(null);
  // `null` is ambiguous until the first answer lands: it means BOTH "not asked
  // yet" and "backend has no CRM". The legacy 2+2 pitch (popup + card) may only
  // fire on an ANSWERED null — pitching the pay-first 2+2 while the Welcome
  // Litre probe is still in flight put the retired offer in front of a CRM
  // household (caught live on the sim: first sign-in raced the token write,
  // the probe 401'd, and the ₹140 popup fired on a Welcome Litre backend).
  const [wlAnswered, setWlAnswered] = useState(false);
  const recheckWelcome = useCallback(() => {
    getWelcomeFunnelState()
      .then((s) => { setWlState(s); setWlAnswered(true); })
      .catch(() => { setWlState(null); setWlAnswered(true); });
  }, []);

  // Subscription presence (server-synced) — the low-wallet delivery nudge keys
  // off ANY ongoing subscription; a one-time order is not an ongoing plan.
  const recheckFresh = useCallback(() => {
    // A fresh read: a plan the server minted (Welcome Litre) becomes visible.
    listSubscriptions({ refresh: true })
      .then((subs) => {
        const anySub = subs.some((s) => (s.status === 'active' || s.status === 'paused') && s.frequency !== 'one_time');
        setHasSub(anySub);
      })
      .catch(() => setHasSub(false));
  }, []);

  // The retired 2+2 pitch surfaces (confetti welcome modal, claim popup, claim
  // card) are GONE — the Welcome Litre is the app's one published acquisition
  // offer (campaign §15; work order 5347/LMU). Its popup renders below via
  // WelcomeLitrePopup on the SERVER's eligibility say-so; members mid-2+2 keep
  // their running trial (lib/trial accounting untouched) — only the pitch died.

  // Home focus: the rating gate's delivered count, serviceability, the
  // subscription sweep and the campaign state. Live order tracking has its own
  // poll loop (useLiveOrders above).
  useFocusEffect(
    useCallback(() => {
      let on = true;
      const loadOrders = () =>
        listOrders()
          .then((os) => {
            if (!on) return;
            // How many mornings have actually landed — the rating ask waits for
            // three, so we never beg for stars from someone we haven't served.
            void recordDeliveredCount(os.filter((o) => o.status === 'delivered').length);
            // The OS's own rating prompt (Blinkit-style), never over a popup.
            void shouldAskForRating().then((ask) => {
              if (on && ask && !anyPopupOpen()) void requestNativeReview();
            });
          })
          .catch(() => { /* signed out / offline — show nothing */ });
      loadOrders();
      // Re-evaluate serviceability on every Home focus — if the member switched
      // their default address, the point (and its cache signature) changed, so
      // the gate + instant availability refresh. Cached/no-op for the same point.
      void svcCheck();
      // ...and then KEEP re-checking while Home is on screen. The store
      // manager's instant toggle is a live switch: without this poll the app
      // held the cached verdict until the next cold focus, so reopening the
      // lane took minutes to show up (tester report, 18 Sep). `force` skips
      // the signature cache; 30s is frequent enough to feel immediate and
      // cheap enough for a free-tier backend.
      const svcPoll = setInterval(() => { void svcCheck({ force: true }); }, 30000);
      // SUBSCRIPTION SWEEP: turn today's due subscriptions into real morning
      // orders (idempotent per sub+day). Runs on launch + every home focus,
      // non-blocking and error-soft; when it places anything, re-pull the
      // wallet + the order strip so the new delivery shows immediately.
      void sweepDueSubscriptions()
        .then((placed) => {
          if (placed > 0 && on) { void refreshWallet(); loadOrders(); }
        })
        .catch(() => { /* error-soft — retried on next focus */ });
      recheckWelcome();
      recheckFresh();
      return () => { on = false; clearInterval(svcPoll); };
    }, [recheckWelcome, recheckFresh, refreshWallet, svcCheck])
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

  // Category rail: ONE highlight that slides between chips (72-wide chips on a
  // 10 gap → 82 stride; the 64 box sits 4 in). Presentation only — `cat` is
  // still the single source of truth; this just animates where it points.
  const railX = useSharedValue(0);
  useEffect(() => {
    const i = Math.max(0, CATEGORIES.findIndex((c) => c.key === cat));
    railX.value = withSpring(spacing.lg + 4 + i * 82, spring.layout);
  }, [cat, railX]);
  const railStyle = useAnimatedStyle(() => ({ transform: [{ translateX: railX.value }] }));

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
    // The wallet refresh used to gate `ready` on its own: fine on a warm network
    // (the balance chip lands before first paint), but a COLD backend (Render
    // free tier boots for ~30s) held the whole shop on the skeleton for the full
    // request timeout while the catalog sat in memory ready to render. Cap the
    // wait at 400ms: warm networks keep the exact old sequencing, cold ones show
    // the bundled/cached catalog instantly and the chip hydrates when it lands.
    const markReady = () => { if (active) setReady(true); };
    const cap = setTimeout(markReady, 400);
    refreshWallet().finally(() => { clearTimeout(cap); markReady(); });
    return () => { active = false; clearTimeout(cap); };
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
  // The shelf leads with what can actually be BOUGHT (Taaza + Gold today):
  // out-of-stock bestsellers never headline the shop. Falls back to the full
  // most-ordered list only if literally everything is out.
  // STRICTLY available (founder's call): the shelf holds IN-STOCK products
  // only — bestsellers first, topped up with other in-stock SKUs to six, and
  // never a single out-of-stock card. Everything out → the shelf hides.
  const popular = useMemo(() => {
    const inStock = products.filter((p) => !p.outOfStock);
    const best = inStock.filter((p) => p.mostOrdered);
    const fill = inStock.filter((p) => !p.mostOrdered);
    return [...best, ...fill].slice(0, 6);
  }, [products]);
  const favorites = useMemo(() => favIds.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p), [favIds, products]);
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

  // Out of zone — the shop renders EXACTLY as it does in a serviceable area,
  // but browse-only: every product greys out with a COMING SOON marker, the
  // strip below the header says why, and ordering is impossible at three
  // layers (no add controls, the product page's waitlist CTA, and placeOrder's
  // serviceable gate). `null` (still resolving) falls through to the skeleton,
  // so a slow check never flashes the browse-only state.
  //
  // FRESH-VERDICT GATED, same rule as the popup: while a check is in flight
  // (or the last verdict belongs to different coords than the member's chosen
  // location), the previous location's `false` must not grey the shop or print
  // "Unserviceable" in the header for the round-trip.
  const svcVerdictFresh =
    !svcLoading &&
    (!userLoc ||
      (svcLat != null && svcLng != null &&
        Math.abs(svcLat - userLoc.coords.lat) <= 0.001 &&
        Math.abs(svcLng - userLoc.coords.lng) <= 0.001));
  const comingSoon = svcServiceable === false && svcVerdictFresh;

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
              <DeliveryModeToggle instant={instant} instantOpen={instantOpen} note={instantNote} opensAtLabel={win.opensAtLabel} />
            </Animated.View>

            {/* PREPAID FUNNEL BANNER · shown to an EXISTING subscriber whose prepaid
                balance is below the target. Critically-low (delivery could pause) is
                an urgent red strip; otherwise the pink "go prepaid + bonus" upsell.
                Never nags a fresh 0-wallet, no-subscription user (they see the trial). */}
            {hasSub && balance < PREPAID_TARGET ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                {/* CRITICAL (under ₹100): a delivery can genuinely fail to
                    settle, so this is red and says exactly that. LOW (under
                    ₹200) keeps the pink "top up" tone. Founder call, 18 Sep. */}
                {balanceTier(balance) === 'critical' ? (
                  <Tap onPress={() => router.push(`/recharge?amount=${MIN_RECHARGE}&reason=so tomorrow's delivery is not paused`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.critical, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, ...shadow.soft }}>
                    <Ionicons name="alert-circle" size={18} color={colors.white} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <TextSemi style={{ fontSize: 13 }} color={colors.white} numberOfLines={1}>Wallet critically low · {rupee(balance)}</TextSemi>
                      <TextMed style={{ fontSize: 11.5 }} color="rgba(255,255,255,0.92)" numberOfLines={1}>Recharge {rupee(MIN_RECHARGE)} now so tomorrow's delivery is not paused</TextMed>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
                  </Tap>
                ) : lowBalance ? (
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

            {/* LIVE TRACKING · MODE-AWARE: the Instant world tracks instant
                orders, the Morning world the scheduled ones, so a scheduled
                order's tracker never bleeds into the Instant view. The card
                carries the step rail + countdown and advances as the store
                reports each state (lib/orderTracking, which also raises the
                notification for the same transition). */}
            {trackedOrders.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                {/* ONE box, every active order tracked inside it. */}
                <ActiveOrdersCard orders={trackedOrders} now={live.now} />
              </Animated.View>
            ) : null}

            {/* THE HERO CALENDAR IS GONE (founder call, 18 Sep): the
                "Your deliveries" day strip and its "Add more subscription"
                card sat above the shop pushing products below the fold, and
                repeated what My Subscriptions already owns. Instant keeps its
                one-line promise banner; Morning goes straight to the offer +
                subscription cards below. */}
            {instant && trackedOrders.length === 0 ? (
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
                </View>
              </Animated.View>
            ) : null}

            {/* Free-pack funnel · the selling point. WHITE with a pink outline
                on purpose — subtle and rich, not a pink slab; the accent lives
                in the pill, the title and the gift disc. Fresh members only (no
                active/paused subscription and the trial not yet redeemed) — an
                existing subscriber is never nudged to "start". */}
            {/* WELCOME LITRE funnel (server-truth; the published offer). Renders
                for eligible / address_required / not_serviceable — the CTA
                routes per state inside /welcome-offer. The retired 2+2 pitch
                surfaces are gone; this is the app's one acquisition offer. */}
            {wlState === 'eligible' || wlState === 'address_required' || wlState === 'not_serviceable' ? (
              <Animated.View entering={FadeInDown.duration(440).delay(40)} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
                <Tap
                  weight="medium"
                  onPress={() => router.push('/welcome-offer')}
                  style={{ borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.flame, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, overflow: 'hidden', ...shadow.card }}
                >
                  {/* Revamp language: the actual pack, not an icon disc — the
                      same FCM pack shot every funnel surface uses, on the soft
                      flame wash. Pill + copy are load-bearing (§15.6): keep. */}
                  <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Image transition={220} source={FREE_PACK_IMG} style={{ width: 46, height: 46 }} contentFit="contain" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row' }}>
                      <Pill small label="FREE · NO PAYMENT NOW" bg={colors.flameSoft} color={colors.flameDeep} />
                    </View>
                    <TextSemi color={colors.ink} style={{ fontSize: 15 }} numberOfLines={1}>Your first litre is on us</TextSemi>
                    <TextBody color={colors.inkMute} style={{ fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>
                      500 ml free on your first morning · recharge ₹500 and the second pack is free too
                    </TextBody>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.flameDeep} />
                </Tap>
              </Animated.View>
            ) : null}
            {/* The Welcome Litre progress box (Pack 1 / Pack 2) is gone from
                Home (founder call, 21 Sep): those updates already reach the
                member in Notifications. */}

            {/* Subscription live-status. Its EMPTY state cedes to the Welcome
                Litre funnel card above — one acquisition pitch, ever. */}
            <Animated.View entering={FadeInDown.duration(440).delay(60)} style={{ paddingHorizontal: spacing.lg }}>
              <SubscriptionStatusCard
                showEmpty={!(wlState === 'eligible' || wlState === 'address_required' || wlState === 'not_serviceable')}
                style={{ marginBottom: spacing.md }}
              />
            </Animated.View>


            {/* Category rail · horizontally scrollable (PYAAS has many ranges) */}
            <Animated.View entering={FadeInDown.duration(440).delay(160)} style={{ marginBottom: spacing.md }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.lg }}>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.flameSoft, borderWidth: 1.5, borderColor: colors.flameDeep }, railStyle]} />
                {CATEGORIES.map((c) => {
                  const active = cat === c.key;
                  const photo = CAT_IMAGE[c.key];
                  return (
                    <Tap key={c.key} haptic={false} onPress={() => { haptics.select(); setCat(c.key); }} style={{ alignItems: 'center', gap: 6, width: 72 }}>
                      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: active ? 'transparent' : colors.white, borderWidth: 1.5, borderColor: active ? 'transparent' : colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...(active ? null : shadow.soft) }}>
                        {photo ? (
                          <Image transition={220} source={photo} style={{ width: 48, height: 48 }} contentFit="contain" />
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
                      <ProductCard product={p} index={i} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} browseOnly={comingSoon} suppressMostOrdered />
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
                      <ProductCard product={p} index={i} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} browseOnly={comingSoon} />
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
            <ProductCard product={item.base} variants={item.variants} index={index} ctaLabel={instant ? 'ORDER NOW' : 'ADD'} browseOnly={comingSoon} />
          </View>
        )}
        ListFooterComponent={
          /* Quiet partner-brand sign-off, ONLY when PYAAS SKUs are actually in
             the visible grid (all/milk) - under any other filter the caption
             would misattribute the manufacturer's products. Deliberately understated:
             tiny wordmark at low opacity + one muted caption line. */
          <View>
            {/* Brand creatives live BELOW the full grid (founder's call): every
                product first, the story last. */}
            <View style={{ marginTop: spacing.lg }}>
              <HeroSlideshow />
            </View>
            {data.some((g) => g.variants.some((v) => v.manufacturer)) ? (
              <View style={{ alignItems: 'center', paddingTop: spacing.md, gap: 12 }}>
                <Image transition={220} source={require('../../assets/pyaas-logo.png')} style={{ width: 210, height: 63 }} contentFit="contain" />
                <TextBody color={colors.inkMute} style={{ fontSize: 12, letterSpacing: 0.4 }}>PARAG Range · Marketed by PYAAS</TextBody>
              </View>
            ) : null}
          </View>
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
      <OutOfZoneSheet visible={oozOpen} onClose={dismissOoz} />

      {/* Welcome Litre first-landing popup — the campaign's ONE self-presenting
          acquisition surface (§15.6), once per launch, on the server's say-so. */}
      <WelcomeLitrePopup state={wlState} />

    </View>
  );
}

/**
 * MORNING | INSTANT segmented control — original PYAAS design (white + pink,
 * fully rounded). Morning (left) carries the 5–7:30 AM window; Instant (right)
 * carries a ⚡ 20-minute mini-badge. Writes the shared delivery-mode store so
 * the product page and checkout honour the same mode.
 */
const TOGGLE_PAD = 5;
const TOGGLE_GAP = 8; // a visible gap between the two tabs

function DeliveryModeToggle({ instant, instantOpen, note, opensAtLabel }: { instant: boolean; instantOpen: boolean; note: string | null; opensAtLabel: string | null }) {
  // Sliding thumb: ONE pink pill that springs between the two segments on the
  // UI thread, instead of each segment repainting its own background (which
  // read as a bland instant swap). Segments stay transparent; the thumb sits
  // behind them and carries the fill + shadow.
  const [trackW, setTrackW] = useState(0);
  const activeIdx = instant && instantOpen ? 1 : 0;
  const pos = useSharedValue(activeIdx);
  useEffect(() => {
    pos.value = withSpring(activeIdx, { damping: 19, stiffness: 240, mass: 0.7 });
  }, [activeIdx, pos]);
  const thumbW = trackW > 0 ? (trackW - TOGGLE_PAD * 2 - TOGGLE_GAP) / 2 : 0;
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * (thumbW + TOGGLE_GAP) }],
  }));
  // CLOSED ≠ REMOVED (founder call, 18 Sep). A shut instant lane keeps its
  // segment, its badge and its tap: tapping says when it opens rather than
  // doing nothing, which is what "don't disable instant" means in practice.
  function onInstantPress() {
    if (instantOpen) { setDeliveryMode('instant'); return; }
    haptics.select();
    showToast(
      opensAtLabel ? `Instant opens at ${opensAtLabel}. Order for the morning slot instead.` : note ?? 'Instant is closed right now.',
      { icon: 'moon-outline' },
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        // TWO REAL TABS (founder call, 21 Sep, raised several times): each
        // side sits on its OWN raised white tab with a border and a shadow, a
        // clear gap between them, and the active tab (pink) slides over its
        // plate. It can never read as one flat pill again, on either platform.
        style={{ flexDirection: 'row', backgroundColor: colors.wash, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: TOGGLE_PAD, gap: TOGGLE_GAP }}
      >
        {thumbW > 0 ? (
          <>
            {[0, 1].map((i) => (
              <View
                key={i}
                pointerEvents="none"
                style={{ position: 'absolute', top: TOGGLE_PAD, bottom: TOGGLE_PAD, left: TOGGLE_PAD + i * (thumbW + TOGGLE_GAP), width: thumbW, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(94,80,87,0.16)', shadowColor: '#6B4B36', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              />
            ))}
            <Animated.View
              pointerEvents="none"
              style={[{ position: 'absolute', left: TOGGLE_PAD, top: TOGGLE_PAD, bottom: TOGGLE_PAD, width: thumbW, borderRadius: radius.pill, backgroundColor: colors.action, shadowColor: '#6B4B36', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 }, thumbStyle]}
            />
          </>
        ) : null}
        <ModeSegment
          active={!instant || !instantOpen}
          onPress={() => setDeliveryMode('morning')}
          icon="sunny"
          label="Morning"
          sub="5-7:30 AM"
          a11yLabel="Morning delivery, 5 to 7:30 AM slot"
        />
        <ModeSegment
          active={instant && instantOpen}
          // Dimmed, never dead: the tap explains the hours.
          muted={!instantOpen}
          onPress={onInstantPress}
          icon={instantOpen ? 'flash' : 'moon'}
          label="Instant"
          sub={instantOpen ? undefined : opensAtLabel ? `from ${opensAtLabel}` : 'closed'}
          badge={instantOpen && !(instant && instantOpen) ? '20 min' : undefined}
          a11yLabel={instantOpen ? 'Instant delivery, 20 minutes' : note ?? 'Instant delivery closed right now'}
        />
      </View>
      {note ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
          <Ionicons name={!instantOpen ? 'moon-outline' : 'information-circle-outline'} size={13} color={colors.inkSoft} />
          <TextMed style={{ fontSize: 11, flex: 1 }} color={colors.inkSoft}>
            {note}. Morning delivery is open.
          </TextMed>
        </View>
      ) : null}
    </View>
  );
}

function ModeSegment({ active, onPress, icon, label, sub, badge, a11yLabel, muted }: { active: boolean; onPress: () => void; icon: any; label: string; sub?: string; badge?: string; a11yLabel?: string; muted?: boolean }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11yLabel ?? label}
      // The sliding thumb behind the row carries the active fill + shadow —
      // segments stay transparent so the pill can glide between them.
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 8, borderRadius: radius.pill, opacity: muted ? 0.55 : 1 }}
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
  useBottomChrome(bottomClearance - 6 + 52, 'tabs', count > 0);
  // Rides the SAME navHidden signal as the tab bar + BottomBar, so the whole
  // bottom cluster leaves and returns together on scroll — a pill floating
  // alone over the feed while the rest of the chrome hides reads as detached.
  // navHidden is driven by withTiming on the UI thread; this style only READS
  // it, so hide/reveal never touches the JS thread mid-scroll.
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: navHidden.value * (bottomClearance + 60) }],
    opacity: 1 - navHidden.value,
  }));
  if (count === 0) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      exiting={FadeOutDown.duration(200)}
      style={[{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: bottomClearance - 6 }, hideStyle]}
    >
      <Tap onPress={() => { haptics.press(); router.push('/cart'); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameDeep, borderRadius: radius.pill, paddingHorizontal: 18, height: 52, ...shadow.card }}>
          <Ionicons name="bag-handle" size={18} color={colors.white} />
          <PopOnChange value={count} style={{ flex: 1 }}>
            <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>
              {count} {count === 1 ? 'item' : 'items'} · {mode === 'instant' ? 'Instant cart' : 'Morning cart'}
            </TextSemi>
          </PopOnChange>
          <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>View cart</TextSemi>
          <Ionicons name="chevron-forward" size={16} color={colors.white} />
        </View>
      </Tap>
    </Animated.View>
  );
}
