import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { colors, radius, spacing, shadow } from '../../lib/theme';
import { Serif, TextBody, TextMed, Tap, Pill } from '../../components/ui';
import { ProductCard } from '../../components/ProductCard';
import { ShopSkeleton } from '../../components/Skeleton';
import { HomeHeader, useHomeHeaderHeight } from '../../components/HomeHeader';
import { BottomBar, useBottomBarClearance } from '../../components/BottomBar';
import { DeliveryStrip } from '../../components/DeliveryStrip';
import { PRODUCTS, CATEGORIES, BUNDLES, type Category } from '../../constants/products';
import { BundleCard } from '../../components/BundleCard';
import { useWallet } from '../../store/wallet';
import { useAuth } from '../../lib/auth';

export default function Shop() {
  const router = useRouter();
  const { profile } = useAuth();
  const refreshWallet = useWallet((s) => s.refresh);
  const headerH = useHomeHeaderHeight();
  const bottomClearance = useBottomBarClearance();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
    refreshWallet().finally(() => active && setReady(true));
    return () => { active = false; };
  }, [refreshWallet]);

  const data = useMemo(() => (cat === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat)), [cat]);
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
        itemLayoutAnimation={LinearTransition.springify().damping(18).stiffness(200)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.roseDeep} colors={[colors.roseDeep]} progressViewOffset={headerH} />
        }
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingTop: headerH + 6, paddingBottom: bottomClearance, gap: spacing.sm }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Set deliveries from the first screen */}
            <Animated.View entering={FadeInDown.duration(440)}>
              <DeliveryStrip />
            </Animated.View>

            {/* Hero banner · solid brand color, motion does the work */}
            <Animated.View entering={FadeInDown.duration(440).delay(80)} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              <View style={{ borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.roseDeep, ...shadow.card }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Pill label="FOUNDING PRICES" bg="rgba(255,255,255,0.85)" color={colors.roseDeep} />
                  <Serif style={{ fontSize: 24, lineHeight: 28 }} color={colors.white}>
                    Fresh milk,{'\n'}delivered daily.
                  </Serif>
                  <TextMed color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>Free delivery over ₹199</TextMed>
                </View>
                <Animated.View entering={FadeIn.delay(160).duration(560)}>
                  <Image source={require('../../assets/products/toned-1l.png')} style={{ width: 100, height: 124 }} contentFit="contain" />
                </Animated.View>
              </View>
            </Animated.View>

            {/* Know Your Milk card */}
            <Animated.View entering={FadeInDown.duration(440).delay(140)} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              <Tap haptic={false} onPress={() => router.push('/know-your-milk')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="qr-code" size={20} color={colors.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextMed style={{ fontSize: 14.5 }}>Know your milk</TextMed>
                  <TextBody style={{ fontSize: 12 }}>The farmer, farm & lab test behind today’s milk.</TextBody>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
              </Tap>
            </Animated.View>

            {/* Bundles & savings */}
            <Animated.View entering={FadeInDown.duration(440).delay(200)} style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: 10 }}>
                <Serif style={{ fontSize: 18, letterSpacing: -0.2 }}>Bundles & savings</Serif>
                <TextBody style={{ fontSize: 12 }}>Buy more, pay less</TextBody>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
                {BUNDLES.map((b) => <BundleCard key={b.id} bundle={b} />)}
              </ScrollView>
            </Animated.View>

            {/* Category row */}
            <Animated.View entering={FadeInDown.duration(440).delay(260)} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              {CATEGORIES.map((c) => {
                const active = cat === c.key;
                const icon = c.key === 'milk' ? 'water' : c.key === 'ghee' ? 'flame' : 'grid';
                return (
                  <Tap key={c.key} haptic={false} onPress={() => setCat(c.key)} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: '100%', height: 64, borderRadius: radius.lg, backgroundColor: active ? colors.roseDeep : colors.white, borderWidth: 1, borderColor: active ? colors.roseDeep : colors.line, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                      <Ionicons name={`${icon}-outline` as any} size={24} color={active ? colors.white : colors.roseDeep} />
                    </View>
                    <TextMed color={active ? colors.roseDeep : colors.inkSoft} style={{ fontSize: 12.5 }}>{c.label}</TextMed>
                  </Tap>
                );
              })}
            </Animated.View>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.duration(260)}
            exiting={FadeOutUp.duration(180)}
            style={{ flex: 1, maxWidth: '50%' }}
          >
            <ProductCard product={item} index={index} />
          </Animated.View>
        )}
      />

      <HomeHeader firstName={firstName} />
      <BottomBar />
    </View>
  );
}
