import React, { useEffect } from 'react';
import { View, Pressable, useWindowDimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, shadow, spacing } from '../lib/theme';
import { spring } from '../lib/motion';
import { Glass, LIQUID_GLASS } from './Glass';
import { navHidden } from '../lib/navVisibility';

// Props come from expo-router's <Tabs tabBar={...}> (React Navigation bottom-tabs).
type TabBarProps = { state: any; navigation: any };

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'storefront', off: 'storefront-outline' },
  traceability: { on: 'scan', off: 'scan-outline' },
  vip: { on: 'diamond', off: 'diamond' }, // center raised button
  wallet: { on: 'wallet', off: 'wallet-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

// VoiceOver names for the icon-only buttons - the glyphs announce nothing on
// their own. Kept in sync with the titles in app/(tabs)/_layout.tsx.
const LABELS: Record<string, string> = {
  index: 'Shop',
  traceability: 'Know your milk',
  vip: 'PYAAS Plus',
  wallet: 'Wallet',
  profile: 'Profile',
};

const MARGIN = 14;
const HL = 46;
const BAR_H = 64;      // height of the glass pill
const BAR_BOTTOM = 10; // gap between the pill and the safe-area edge
const VIP_RISE = 16;   // how far the raised centre button pokes above the pill
const MARK_RATIO = 317 / 1127; // pyaas-logo-trim.png height/width
const MARK_W = 40;             // widest the wordmark can go inside the 56pt disc

/** How far the bar actually reaches up from the safe-area inset: the pill plus
 *  the raised centre button that overhangs it. Geometry, not padding. */
export const TAB_BAR_REACH = BAR_BOTTOM + BAR_H + VIP_RISE; // 90

/** Bottom padding a scrolling tab screen owes the bar (add insets.bottom), with
 *  one gutter of air so the last card doesn't kiss the glass. Screens were
 *  guessing 112/130 and clipping under the raised button - use this instead. */
export const TAB_BAR_CLEARANCE = TAB_BAR_REACH + spacing.md; // 106 + insets.bottom

/** Hook form for the common case: the full bottom padding for this device. */
export function useTabBarClearance(extra = 0) {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_CLEARANCE + extra;
}

export function PyaasTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const routes = state.routes.filter((r: any) => ICONS[r.name]);
  const pillW = width - MARGIN * 2;
  const slot = pillW / routes.length;

  const activeIndex = routes.findIndex((r: any) => r.key === state.routes[state.index].key);
  // The active route may not live in the bar (e.g. Orders is reached from Profile
  // but has no tab). Clamp the highlight position and hide it then.
  const offBar = activeIndex < 0;
  const hlIndex = Math.max(0, activeIndex);

  const hlX = useSharedValue(hlIndex * slot + slot / 2 - HL / 2);
  useEffect(() => {
    hlX.value = withSpring(hlIndex * slot + slot / 2 - HL / 2, spring.layout);
  }, [hlIndex, slot, hlX]);

  const onVip = routes[activeIndex]?.name === 'vip';
  const hlStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: hlX.value }],
    opacity: withTiming(onVip || offBar ? 0 : 1, { duration: 160 }),
  }));

  const inactiveColor = colors.inkMute;
  const activeColor = colors.flameDeep;
  const hlColor = colors.flameSoft;

  // Slide the bar down out of view when a screen scrolls down; reveal on
  // scroll-up. Always reveal when the active tab changes.
  const barTravel = BAR_H + insets.bottom + 28;
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: navHidden.value * barTravel }],
    opacity: 1 - navHidden.value * 0.92,
  }));
  useEffect(() => {
    navHidden.value = withTiming(0, { duration: 200 });
  }, [state.index]);

  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: MARGIN, right: MARGIN, bottom: insets.bottom + BAR_BOTTOM, height: BAR_H }, hideStyle]}>
      {/* Clipped glass pill */}
      <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden', ...shadow.card }}>
        <Glass style={StyleSheet.absoluteFill} glass="regular" intensity={55} tint="light" tintColor={LIQUID_GLASS ? colors.glassTint : undefined} />
        {!LIQUID_GLASS ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} /> : null}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }]} />

        <Animated.View style={[{ position: 'absolute', top: 9, width: HL, height: HL, borderRadius: HL / 2, backgroundColor: hlColor }, hlStyle]} />

        <View style={{ flex: 1, flexDirection: 'row' }}>
          {routes.map((route: any) => {
            const isActive = state.routes[state.index].key === route.key;
            if (route.name === 'vip') return <View key={route.key} style={{ flex: 1 }} />; // spacer; button drawn above
            const ic = ICONS[route.name];
            const onPress = () => {
              const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isActive && !ev.defaultPrevented) {
                Haptics.selectionAsync();
                navigation.navigate(route.name);
              }
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityLabel={LABELS[route.name] ?? route.name}
                accessibilityState={{ selected: isActive }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <TabIcon active={isActive} name={isActive ? ic.on : ic.off} color={isActive ? activeColor : inactiveColor} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Raised VIP button - OUTSIDE the clipped pill so it isn't cut off */}
      <VipButton
        active={onVip}
        onPress={() => {
          const vipRoute = routes.find((r: any) => r.name === 'vip');
          if (!vipRoute) return;
          const ev = navigation.emit({ type: 'tabPress', target: vipRoute.key, canPreventDefault: true });
          if (!onVip && !ev.defaultPrevented) {
            Haptics.selectionAsync();
            navigation.navigate('vip');
          }
        }}
      />
    </Animated.View>
  );
}

// A single tab icon: springs up to 1.12 when it becomes the active tab so the
// selection feels alive. Colour is handed in (flame active, ink-mute idle).
function TabIcon({ active, name, color }: { active: boolean; name: keyof typeof Ionicons.glyphMap; color: string }) {
  const s = useSharedValue(active ? 1.12 : 1);
  useEffect(() => { s.value = withSpring(active ? 1.12 : 1, spring.layout); }, [active, s]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={aStyle}>
      <Ionicons name={name} size={23} color={color} />
    </Animated.View>
  );
}

// Raised center button -> PYAAS Plus (membership). The PYAAS wordmark on a white
// disc with a pink ring, so the mark reads clearly against the glass pill.
function VipButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const s = useSharedValue(1);
  useEffect(() => { s.value = withTiming(active ? 1.08 : 1, { duration: 200, easing: Easing.out(Easing.ease) }); }, [active, s]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: -VIP_RISE, left: 0, right: 0, alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="tab"
        accessibilityLabel={LABELS.vip}
        accessibilityState={{ selected: active }}
      >
        <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 2.5, borderColor: active ? colors.flameDeep : colors.flame, overflow: 'hidden', ...shadow.card }, aStyle]}>
          {/* The trimmed wordmark, sized to its own 1127:317 ratio. The square
              padded asset in a 44x44 box shrank it to ~24x7pt - unreadable. */}
          <Image source={require('../assets/pyaas-logo-trim.png')} style={{ width: MARK_W, height: MARK_W * MARK_RATIO }} contentFit="contain" />
        </Animated.View>
      </Pressable>
    </View>
  );
}
