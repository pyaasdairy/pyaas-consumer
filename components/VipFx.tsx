/**
 * VipFx · bespoke motion + "fake 3D" primitives for the PYAAS VIP page.
 *
 * Everything here is built from Views + expo-linear-gradient + reanimated only
 * (NO svg, NO masked-view). Depth is faked with perspective / rotateX / rotateY,
 * layered shadows and specular sweeps. Pink-and-white forward, gold = VIP.
 *
 * Perf: only transforms + opacity are animated (GPU-cheap). The whole page keeps
 * a small, fixed number of continuously-animating nodes · see the page's budget.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';

const PINK = '#F36CB5';
const ROSE = '#F491CC';
const ROSE_SOFT = '#FBC9E6';
const GOLD = '#F4D061';
const WHITE = '#FFFFFF';

// ── Aurora background ────────────────────────────────────────────────────────
// Big soft gradient blobs drift slowly, then a blur melts them into a living
// mesh-gradient. White veil on top keeps it airy. Sits behind everything.
function Blob({
  colors, size, x, y, dur, dx, dy, rot, opacity = 0.7,
}: {
  colors: [string, string]; size: number; x: number; y: number;
  dur: number; dx: number; dy: number; rot: number; opacity?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t, dur]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateX: x + dx * t.value },
      { translateY: y + dy * t.value },
      { scale: 1 + 0.14 * t.value },
      { rotate: `${rot * t.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, opacity }, st]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: size / 2 }} />
    </Animated.View>
  );
}

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF6FB' }]} />
      <Blob colors={[PINK, ROSE]} size={width * 1.1} x={-width * 0.35} y={-height * 0.12} dur={9000} dx={width * 0.18} dy={height * 0.05} rot={16} opacity={0.55} />
      <Blob colors={[ROSE_SOFT, WHITE]} size={width * 0.95} x={width * 0.45} y={height * 0.18} dur={11000} dx={-width * 0.16} dy={-height * 0.06} rot={-20} opacity={0.7} />
      <Blob colors={[GOLD, ROSE]} size={width * 0.8} x={-width * 0.1} y={height * 0.62} dur={13000} dx={width * 0.2} dy={-height * 0.05} rot={24} opacity={0.4} />
      <Blob colors={[PINK, ROSE_SOFT]} size={width * 0.7} x={width * 0.55} y={height * 0.7} dur={10000} dx={-width * 0.18} dy={-height * 0.08} rot={-16} opacity={0.45} />
      {/* Melt the blobs into a smooth aurora */}
      <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.34)' }]} />
    </View>
  );
}

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
        { position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size / 2, backgroundColor: WHITE, shadowColor: GOLD, shadowOpacity: 0.95, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
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
export function ShineSweep({ dur = 2800, delay = 600, travel = 460, bandWidth = 90, angle = '18deg' }: { dur?: number; delay?: number; travel?: number; bandWidth?: number; angle?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [t, dur, delay]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 1], [-bandWidth - 40, travel]) }, { rotate: angle }],
    opacity: interpolate(t.value, [0, 0.15, 0.85, 1], [0, 0.7, 0.7, 0]),
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -60, bottom: -60, width: bandWidth }, st]}>
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.65)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

// ── 3D tilt + parallax card (driven by scroll, with a gentle idle wobble) ────
export function TiltCard({
  scrollY, children, style, maxTilt = 9, idle = true, lift = 18,
}: {
  scrollY?: SharedValue<number>; children: React.ReactNode; style?: StyleProp<ViewStyle>; maxTilt?: number; idle?: boolean; lift?: number;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    if (idle) w.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [w, idle]);
  const st = useAnimatedStyle(() => {
    const sy = scrollY?.value ?? 0;
    const rotX = interpolate(sy, [-120, 0, 240], [-maxTilt, 2, maxTilt], 'clamp');
    const rotY = interpolate(w.value, [0, 1], [-3.5, 3.5]);
    const ty = interpolate(sy, [0, 300], [0, -lift], 'clamp');
    return {
      transform: [{ perspective: 900 }, { rotateX: `${rotX}deg` }, { rotateY: `${rotY}deg` }, { translateY: ty }],
    };
  });
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}

// ── Bespoke faceted gem (replaces stock perk icons) ──────────────────────────
// A glowing rounded-diamond built from two stacked rotated gradient facets with a
// specular highlight. Optional slow spin. Looks hand-made, on brand, never stock.
export function Gem({
  size = 44, colors = [ROSE, PINK], glow = PINK, spin = false, pulse = true,
}: {
  size?: number; colors?: [string, string]; glow?: string; spin?: boolean; pulse?: boolean;
}) {
  const t = useSharedValue(0);
  const p = useSharedValue(0);
  useEffect(() => {
    if (spin) t.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
    if (pulse) p.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t, p, spin, pulse]);

  const facet = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 + (spin ? 360 * t.value : 0)}deg` }] }));
  const halo = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 1], [0.3, 0.6]), transform: [{ scale: interpolate(p.value, [0, 1], [0.9, 1.12]) }] }));
  const g = size * 0.6;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size * 0.92, height: size * 0.92, borderRadius: size * 0.3, backgroundColor: glow, shadowColor: glow, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }, halo]} />
      <Animated.View style={[{ width: g, height: g, borderRadius: g * 0.28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }, facet]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
        {/* crown specular */}
        <View style={{ position: 'absolute', top: 1, left: 1, width: g * 0.4, height: g * 0.4, borderRadius: g * 0.18, backgroundColor: 'rgba(255,255,255,0.55)' }} />
        {/* lower facet edge */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: g * 0.34, backgroundColor: 'rgba(0,0,0,0.06)' }} />
      </Animated.View>
    </View>
  );
}

// ── Pulsing glow halo (behind CTAs / the hero) ───────────────────────────────
export function GlowPulse({ color = PINK, radius = 28, style, run = true }: { color?: string; radius?: number; style?: StyleProp<ViewStyle>; run?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (run) {
      p.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(p);
      p.value = withTiming(0.5, { duration: 200 });
    }
  }, [p, run]);
  // Pulse stays <= 1.0 so the colored fill never grows past the element it sits
  // behind (only the soft shadow halo shows). Kept gentle so the glow reads as a
  // soft sheen under the CTA, never a colored ring bleeding onto the page.
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.18, 0.4]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.92, 1]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius, backgroundColor: color, shadowColor: color, shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }, st, style]}
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
    // Tween from the CURRENT displayed value, not always 0 · so re-running
    // (e.g. a tab re-focus, or the value updating) never snaps back to 0.
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
