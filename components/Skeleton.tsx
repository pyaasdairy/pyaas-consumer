import React, { useEffect, useState } from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../lib/theme';

const BASE = '#ECE2DC';
const HIGHLIGHT = '#F7EEEA';

/** A placeholder block with a steady left-to-right shimmer sweep (reads ~50%
 *  faster than an opacity pulse and never looks like it is blinking/broken). */
export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [x]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(x.value, [0, 1], [-w, w]) }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ backgroundColor: BASE, borderRadius: radius.sm, overflow: 'hidden' }, style]}
    >
      {w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient colors={[BASE, HIGHLIGHT, BASE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Full-screen Shop skeleton shown until the first data settles. */
export function ShopSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk, paddingTop: insets.top + 12, paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 8 }}>
          <SkeletonBlock style={{ width: 90, height: 12 }} />
          <SkeletonBlock style={{ width: 150, height: 24 }} />
        </View>
        <SkeletonBlock style={{ width: 44, height: 44, borderRadius: 22 }} />
      </View>
      <SkeletonBlock style={{ height: 46, borderRadius: radius.pill, marginTop: spacing.md }} />
      <SkeletonBlock style={{ height: 84, borderRadius: radius.lg, marginTop: spacing.md }} />
      <SkeletonBlock style={{ height: 120, borderRadius: radius.lg, marginTop: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <SkeletonBlock style={{ flex: 1, height: 210, borderRadius: radius.lg }} />
        <SkeletonBlock style={{ flex: 1, height: 210, borderRadius: radius.lg }} />
      </View>
    </View>
  );
}
