import React, { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { spring } from '../lib/motion';

/**
 * POP ON CHANGE — the quick-commerce "number just changed" tell (Blinkit /
 * Zepto qty steppers, cart badges): a 1 → 1.22 → 1 spring the moment `value`
 * changes. Pure presentation: wraps children in an Animated.View, never touches
 * the value. Skips the initial mount (nothing "changed" yet) and honours
 * Reduce Motion through the shared spring presets.
 */
export function PopOnChange({ value, children, style }: { value: unknown; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    s.value = withSequence(withSpring(1.22, spring.pop), withSpring(1, spring.release));
  }, [value, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}
