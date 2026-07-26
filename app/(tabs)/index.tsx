import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { colors, radius, spacing, shadow } from '../../lib/theme';
import { Serif, TextBody, TextMed, Tap, Pill } from '../../components/ui';
import { ProductCard } from '../../components/ProductCard';
import { ShopSkeleton } from '../../components/Skeleton';
import { HomeHeader, useHomeHeaderHeight } from '../../components/HomeHeader';
import { BottomBar, useBottomBarClearance } from '../../components/BottomBar';
import { DeliveryStrip } from '../../components/DeliveryStrip';
import { HeroSlideshow } from '../../components/HeroSlideshow';
import { PRODUCTS, CATEGORIES, mostOrderedProducts, getProduct, type Category } from '../../constants/products';
import { listOrders, type Order } from '../../lib/api';
import { STATUS_LABEL } from '../../lib/orderStatus';
import { useWallet } from '../../store/wallet';
import { useFavorites } from '../../store/favorites';
import { useAuth } from '../../lib/auth';

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
  milk: require('../../assets/products/taaza.png'),
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
  const refreshFavs = useFavorites((s) => s.refresh);
  const favIds = useFavorites((s) => s.ids);
  const headerH = useHomeHeaderHeight();
  const bottomClearance = useBottomBarClearance();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Active orders drive the "Track your order" strip. Refetched whenever the
  // home tab regains focus; renders nothing gracefully when there are none.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      listOrders()
        .then((os) => {
          if (on) setActiveOrders(os.filter((o) => !['delivered', 'cancelled'].includes(o.status)));
        })
        .catch(() => { /* signed out / offline — show nothing */ });
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
    refreshWallet().finally(() => active && setReady(true));
    return () => { active = false; };
  }, [refreshWallet, refreshFavs]);

  const data = useMemo(() => (cat === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat)), [cat]);
  const popular = useMemo(() => mostOrderedProducts(), []);
  const favorites = useMemo(() => favIds.map((id) => getProduct(id)).filter((p): p is NonNullable<typeof p> => !!p), [favIds]);
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

  if (!ready) return <ShopSkeleton />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <Animated.FlatList
        data={data}
        keyExtractor={(p) => p.id}
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
            {/* Low-wallet nudge · only when balance is low */}
            {lowBalance ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                <Tap onPress={() => router.push('/(tabs)/wallet')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.action, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, ...shadow.soft }}>
                  <Ionicons name="wallet" size={18} color={colors.gold} />
                  <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.white}>Low wallet balance. Top up so tomorrow's delivery is not paused.</TextMed>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
                </Tap>
              </Animated.View>
            ) : null}

            {/* Delivery promise · order-by / arrive-by */}
            <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.flame, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="sunny" size={18} color={colors.flameDeep} />
                <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.ink}>Order by 9 PM, at your door by 7 AM</TextMed>
              </View>
            </Animated.View>

            {/* Track your order · shows only when an order is active */}
            {activeOrders.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(440)} style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                <Tap
                  onPress={() =>
                    activeOrders.length === 1
                      ? router.push(`/order/${activeOrders[0].id}`)
                      : router.push('/(tabs)/orders')
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameDeep, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, ...shadow.soft }}
                >
                  <Ionicons name="bicycle" size={20} color={colors.white} />
                  <View style={{ flex: 1 }}>
                    <TextMed style={{ fontSize: 13.5 }} color={colors.white}>
                      {activeOrders.length === 1 ? 'Track your order' : `Track your ${activeOrders.length} orders`}
                    </TextMed>
                    <TextBody style={{ fontSize: 11.5 }} color="rgba(255,255,255,0.85)">
                      {activeOrders.length === 1 ? STATUS_LABEL[activeOrders[0].status] : 'Tap to see all active orders'}
                    </TextBody>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
                </Tap>
              </Animated.View>
            ) : null}

            {/* Set deliveries from the first screen */}
            <Animated.View entering={FadeInDown.duration(440)}>
              <DeliveryStrip />
            </Animated.View>

            {/* Hero · auto-advancing slideshow of the PARAG brand creatives */}
            <Animated.View entering={FadeInDown.duration(440).delay(80)}>
              <HeroSlideshow />
            </Animated.View>

            {/* Category rail · horizontally scrollable (PARAG has many ranges) */}
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
                  {popular.map((p, i) => (
                    <View key={p.id} style={{ width: 168 }}>
                      <ProductCard product={p} index={i} />
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
                      <ProductCard product={p} index={i} />
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
            <ProductCard product={item} index={index} />
          </View>
        )}
        ListFooterComponent={
          /* Quiet partner-brand sign-off, ONLY when PYAAS SKUs are actually in
             the visible grid (all/milk) - under any other filter the caption
             would misattribute PARAG-made products. Deliberately understated:
             tiny wordmark at low opacity + one muted caption line. */
          data.some((p) => p.manufacturer) ? (
            <View style={{ alignItems: 'center', paddingTop: spacing.lg, gap: 7 }}>
              <Image source={require('../../assets/pyaas-logo.png')} style={{ width: 62, height: 17, opacity: 0.35 }} contentFit="contain" />
              <TextBody color={colors.inkMute} style={{ fontSize: 10.5, letterSpacing: 0.4 }}>PYAAS range · marketed & manufactured by PYAAS</TextBody>
            </View>
          ) : null
        }
      />

      <HomeHeader firstName={firstName} />
      <BottomBar />
    </View>
  );
}
