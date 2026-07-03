import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { colors } from '../lib/theme';

/**
 * Premium glass surface.
 *  • iOS 26+  → real Liquid Glass (UIGlassEffect) via expo-glass-effect
 *  • older iOS → frosted blur via expo-blur
 * Both let content scroll *under* them, which is the whole point - use over
 * gradients / imagery / scrolling content, not flat backgrounds.
 */
export const LIQUID_GLASS = isLiquidGlassAvailable();

type GlassProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** 'clear' is lighter/more transparent; 'regular' is frostier. */
  glass?: 'clear' | 'regular';
  /** Blur intensity for the fallback (0-100). */
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  tintColor?: string;
  /** Liquid Glass interactive highlight (buttons/pills). */
  interactive?: boolean;
};

export function Glass({
  style,
  children,
  glass = 'regular',
  intensity = 40,
  tint = 'light',
  tintColor,
  interactive = false,
}: GlassProps) {
  if (LIQUID_GLASS) {
    return (
      <GlassView style={style} glassEffectStyle={glass} isInteractive={interactive} tintColor={tintColor}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}

/** Solid-ish fallback tint to sit behind glass on very light screens if needed. */
export const glassFallbackBg = `${colors.white}D9`;
