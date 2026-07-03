import React, { useEffect } from 'react';
import { View, Pressable, useWindowDimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, shadow } from '../lib/theme';
import { spring } from '../lib/motion';
import { Glass, LIQUID_GLASS } from './Glass';
import { navHidden } from '../lib/navVisibility';

// Props come from expo-router's <Tabs tabBar={...}> (React Navigation bottom-tabs).
type TabBarProps = { state: any; navigation: any };

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'storefront', off: 'storefront-outline' },
  traceability: { on: 'scan', off: 'scan-outline' },
  vip: { on: 'diamond', off: 'diamond' },
  wallet: { on: 'wallet', off: 'wallet-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

const MARGIN = 14;
const HL = 46;

export function PyaasTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const routes = state.routes.filter((r: any) => ICONS[r.name]);
  const pillW = width - MARGIN * 2;
  const slot = pillW / routes.length;

  const activeIndex = routes.findIndex((r: any) => r.key === state.routes[state.index].key);
  // The active route may not live in the bar (e.g. Orders is reached from Profile
  // but no longer has a tab). Clamp the highlight position and hide it then.
  const offBar = activeIndex < 0;
  const hlIndex = Math.max(0, activeIndex);
  // Dark, faded styling while the camera scanner ("Know your milk") is open.
  const dark = routes[hlIndex]?.name === 'traceability' && !offBar;

  const hlX = useSharedValue(hlIndex * slot + slot / 2 - HL / 2);
  useEffect(() => {
    hlX.value = withSpring(hlIndex * slot + slot / 2 - HL / 2, spring.layout);
  }, [hlIndex, slot, hlX]);

  const onVip = routes[activeIndex]?.name === 'vip';
  const hlStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: hlX.value }],
    opacity: withTiming(onVip || offBar ? 0 : 1, { duration: 160 }),
  }));

  const inactiveColor = dark ? 'rgba(255,255,255,0.55)' : colors.inkMute;
  const activeColor = dark ? colors.white : colors.roseDeep;
  const hlColor = dark ? 'rgba(255,255,255,0.18)' : colors.roseSoft;

  // Slide the bar down out of view when a screen scrolls down; reveal on
  // scroll-up. Always reveal when the active tab changes.
  const barTravel = 64 + insets.bottom + 28;
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: navHidden.value * barTravel }],
    opacity: 1 - navHidden.value * 0.92,
  }));
  useEffect(() => {
    navHidden.value = withTiming(0, { duration: 200 });
  }, [state.index]);

  // Soft scrim under the floating pill · fades scroll content out as it reaches
  // the bottom so nothing peeks through the gap around the pill (transparent ->
  // page colour, so it's invisible on the white background, never a visible band).
  const scrimColor = dark ? 'rgba(18,8,14,0.92)' : colors.milk;

  return (
    <>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: insets.bottom + 96 }, hideStyle]}>
      <LinearGradient colors={['transparent', scrimColor]} style={{ flex: 1 }} />
    </Animated.View>
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: MARGIN, right: MARGIN, bottom: insets.bottom + 10, height: 64 }, hideStyle]}>
      {/* Clipped glass pill */}
      <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden', ...shadow.card }}>
        <Glass style={StyleSheet.absoluteFill} glass="regular" intensity={55} tint={dark ? 'dark' : 'light'} tintColor={LIQUID_GLASS ? (dark ? 'rgba(18,8,14,0.55)' : 'rgba(243,108,181,0.16)') : undefined} />
        {!LIQUID_GLASS ? <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(18,8,14,0.62)' : 'rgba(255,236,247,0.82)' }]} /> : null}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, borderColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(243,108,181,0.35)' }]} />

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
              <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <TabIcon
                  active={isActive}
                  name={isActive ? ic.on : ic.off}
                  color={isActive ? activeColor : inactiveColor}
                />
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
    </>
  );
}

// A single tab icon: springs up to 1.12 when it becomes the active tab so the
// selection feels alive. Colour is handed in (rose-deep active · ink-mute idle).
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

function VipButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const s = useSharedValue(1);
  useEffect(() => { s.value = withTiming(active ? 1.08 : 1, { duration: 200, easing: Easing.out(Easing.ease) }); }, [active, s]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  // Outer wrapper is box-none so only the centred 56px button captures taps -
  // the side tabs (Shop/Trace/Wallet/Profile) stay tappable.
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: -16, left: 0, right: 0, alignItems: 'center' }}>
      <Pressable onPress={onPress} hitSlop={8}>
        <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.roseDeep, borderWidth: 3, borderColor: colors.white, ...shadow.card }, aStyle]}>
          <Ionicons name="diamond" size={22} color={colors.white} />
        </Animated.View>
      </Pressable>
    </View>
  );
}
