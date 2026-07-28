/**
 * Fx · small motion primitives (shine sweep, floating sparks, glow pulse,
 * count-up). Built from Views + reanimated only. No gradients (the brand rule is
 * solid constant colours), and every effect is clipped inside its own element,
 * so nothing bleeds onto the page. Recoloured to the brand flame/gold identity.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  cancelAnimation,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const WHITE = '#FFFFFF';
const FLAME = '#E8491D';
const GOLD = '#FDB813';

// ── Floating sparks ──────────────────────────────────────────────────────────
function Spark({ x, y, size, delay, dur, drift }: { x: number; y: number; size: number; delay: number; dur: number; drift: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [t, delay, dur]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: drift * t.value }, { scale: interpolate(t.value, [0, 0.5, 1], [0.6, 1, 0.6]) }],
    opacity: interpolate(t.value, [0, 0.2, 0.8, 1], [0, 0.9, 0.9, 0]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        // Solid white dot only. No coloured shadowRadius halo: a centered glow
        // would bleed a gold ring OUTSIDE the dot's box, which the brand rules
        // forbid (same reason GlowPulse carries no shadow).
        { position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: WHITE },
        st,
      ]}
    />
  );
}

export function FloatingParticles({ count = 14, height = 520 }: { count?: number; height?: number }) {
  const { width } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: 40 + Math.random() * (height - 80),
        size: 2 + Math.random() * 4,
        delay: Math.random() * 4500,
        dur: 4200 + Math.random() * 3200,
        drift: -(40 + Math.random() * 70),
      })),
    [count, width, height]
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      {items.map((p, i) => (
        <Spark key={i} {...p} />
      ))}
    </View>
  );
}

// ── Specular shine sweep (parent must clip with overflow:'hidden') ───────────
// A single translucent white band slides across; no gradient, just a soft solid
// bar at low opacity so it reads as a sheen, not a colour wash.
export function ShineSweep({ dur = 2800, delay = 600, travel = 460, bandWidth = 90, angle = '18deg' }: { dur?: number; delay?: number; travel?: number; bandWidth?: number; angle?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [t, dur, delay]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 1], [-bandWidth - 40, travel]) }, { rotate: angle }],
    opacity: interpolate(t.value, [0, 0.15, 0.85, 1], [0, 0.28, 0.28, 0]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: -60, bottom: -60, width: bandWidth, backgroundColor: 'rgba(255,255,255,0.85)' }, st]}
    />
  );
}

// ── Pulsing glow halo (behind CTAs / the hero) ───────────────────────────────
export function GlowPulse({ color = FLAME, radius = 28, style, run = true }: { color?: string; radius?: number; style?: StyleProp<ViewStyle>; run?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (run) {
      p.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(p);
      p.value = withTiming(0.5, { duration: 200 });
    }
  }, [p, run]);
  // Pulse stays <= 1.0 so the fill never grows past the element it sits behind.
  // No shadow: a shadowRadius halo would bleed a coloured ring OUTSIDE the box,
  // which the brand rules forbid. The effect is just a contained opacity pulse.
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.18, 0.4]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.92, 1]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius, backgroundColor: color }, st, style]}
    />
  );
}

// ── Count-up number (JS-driven; eases out) ───────────────────────────────────
export function useCountUp(target: number, duration = 1500, run = true): number {
  const [n, setN] = useState(0);
  const nRef = useRef(0);
  nRef.current = n;
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!run) return;
    const from = nRef.current;
    if (from === target) return;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target, duration, run]);
  return n;
}
