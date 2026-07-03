import React from 'react';
import {
  Text,
  TextProps,
  Pressable,
  PressableProps,
  View,
  ViewProps,
  ActivityIndicator,
  TextInput,
  TextInputProps,
  StyleSheet,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { fireHaptic, type HapticWeight } from '../lib/haptics';
import { colors, fonts, radius, spacing, shadow } from '../lib/theme';
import { spring } from '../lib/motion';

// ── Typography ────────────────────────────────────────────────────────────────
// The font family carries the weight (Bricolage / Hanken), so we don't set
// fontWeight here (it would faux-bold on iOS / be ignored on Android).
type TProps = TextProps & { color?: string };

export function Serif({ style, color, ...p }: TProps) {
  // Display / headings / prices - Bricolage Grotesque (Bold).
  return <Text {...p} style={[{ fontFamily: fonts.serif, color: color ?? colors.ink }, style]} />;
}
export function TextBody({ style, color, ...p }: TProps) {
  return <Text {...p} style={[{ fontFamily: fonts.sans, color: color ?? colors.inkSoft, fontSize: 15 }, style]} />;
}
export function TextMed({ style, color, ...p }: TProps) {
  return <Text {...p} style={[{ fontFamily: fonts.sansMed, color: color ?? colors.ink, fontSize: 15 }, style]} />;
}
export function TextSemi({ style, color, ...p }: TProps) {
  return <Text {...p} style={[{ fontFamily: fonts.sansSemi, color: color ?? colors.ink, fontSize: 15 }, style]} />;
}

// ── Pressable that scales on press (the "uber" tactile feel) ──────────────────
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Tap({
  children,
  onPress,
  haptic = true,
  weight = 'light',
  scaleTo = 0.96,
  style,
  ...p
}: PressableProps & { haptic?: boolean; weight?: HapticWeight; scaleTo?: number; children: React.ReactNode }) {
  const s = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...p}
      onPressIn={() => {
        s.value = withSpring(scaleTo, spring.press);
      }}
      onPressOut={() => {
        s.value = withSpring(1, spring.release);
      }}
      onPress={(e) => {
        // Every tap gives feedback. `weight` lets a caller make a press feel
        // weightier (major CTAs) or quieter; `haptic={false}` opts out entirely.
        if (haptic) fireHaptic(weight);
        onPress?.(e);
      }}
      style={[aStyle, style as any]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: 'rose' | 'sage' | 'ghost' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: any;
  small?: boolean;
};

export function Button({ title, onPress, variant = 'rose', loading, disabled, style, small }: BtnProps) {
  const bg =
    variant === 'rose' ? colors.roseDeep : variant === 'sage' ? colors.sage : 'transparent';
  const fg =
    variant === 'ghost' || variant === 'outline' ? colors.ink : colors.white;
  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: colors.line } : null;
  // Solid (rose / sage) buttons are the primary CTAs — order, checkout, pay — so
  // they land with a distinct, weightier press than ordinary taps.
  const isPrimary = variant === 'rose' || variant === 'sage';
  return (
    <Tap
      onPress={disabled || loading ? undefined : onPress}
      weight={isPrimary ? 'medium' : 'light'}
      style={[
        {
          backgroundColor: bg,
          paddingVertical: small ? 11 : 16,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        },
        border,
        variant === 'rose' || variant === 'sage' ? shadow.soft : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ fontFamily: fonts.sansSemi, fontWeight: '600', color: fg, fontSize: small ? 14 : 16 }}>{title}</Text>
      )}
    </Tap>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ style, children, ...p }: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      {...p}
      style={[
        {
          backgroundColor: colors.white,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.md,
        },
        shadow.soft,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── Pill / badge ───────────────────────────────────────────────────────────────
export function Pill({
  label,
  bg = colors.sageSoft,
  color = colors.sage,
  style,
}: {
  label: string;
  bg?: string;
  color?: string;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: bg,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.sansSemi, fontWeight: '600', color, fontSize: 11.5, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

// ── Text field ─────────────────────────────────────────────────────────────────
export function Field({
  label,
  style,
  ...p
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <TextMed color={colors.inkSoft} style={{ fontSize: 13.5 }}>{label}</TextMed> : null}
      <TextInput
        placeholderTextColor={colors.inkMute}
        style={[styles.field, style]}
        {...p}
      />
    </View>
  );
}

// ── Quantity stepper ─────────────────────────────────────────────────────────
export function Stepper({
  qty,
  onChange,
  max = 20,
  min = 0,
}: {
  qty: number;
  onChange: (n: number) => void;
  max?: number;
  min?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Tap onPress={() => onChange(Math.max(min, qty - 1))} style={styles.stepBtn} scaleTo={0.85}>
        <Text style={styles.stepGlyph}>−</Text>
      </Tap>
      <Text style={{ fontFamily: fonts.sansSemi, fontWeight: '600', color: colors.ink, fontSize: 15, minWidth: 22, textAlign: 'center' }}>
        {qty}
      </Text>
      <Tap
        onPress={() => onChange(Math.min(max, qty + 1))}
        style={[styles.stepBtn, qty >= max && { opacity: 0.4 }]}
        scaleTo={0.85}
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Tap>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.md }} />;
}

// ── Back button (use on every screen except the home tabs) ──────────────────
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export function BackButton({ onPress, style }: { onPress?: () => void; style?: any }) {
  const router = useRouter();
  return (
    <Tap
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))}
      style={[
        {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadow.soft,
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.wash,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepGlyph: { fontFamily: fonts.sansSemi, fontWeight: '600' as const, fontSize: 18, color: colors.roseDeep, lineHeight: 22 },
});
