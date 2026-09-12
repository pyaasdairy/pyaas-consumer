import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Tap } from './ui';

/**
 * TOAST — the quiet confirmation every top-tier commerce app gives ("Added ·
 * Toned Milk", "Saved") without stealing the screen. One at a time, bottom
 * anchored above the tab bar, auto-dismisses, optional single action.
 * Module store + host: `showToast()` from anywhere, `<ToastHost/>` mounted once
 * in the root layout. Presentation only — it never owns app state.
 */

export type ToastOpts = { icon?: keyof typeof Ionicons.glyphMap; action?: { label: string; onPress: () => void }; duration?: number };
type ToastItem = { id: number; text: string } & ToastOpts;

let current: ToastItem | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => { for (const cb of subs) cb(); };
function subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; }

export function showToast(text: string, opts: ToastOpts = {}): void {
  current = { id: ++seq, text, ...opts };
  emit();
}
export function hideToast(): void { current = null; emit(); }

/**
 * BOTTOM-CHROME REGISTRY — every bar anchored to the bottom (tab bar, home
 * mode bar, floating cart bar, a screen's sticky CTA) reports how far up the
 * screen it reaches; the toast floats 12px above the tallest one, so it never
 * overlaps a button. `tabs`-scoped bars only count while a tab screen is on
 * top (they stay mounted under pushed screens); `screen`-scoped bars belong to
 * the pushed screen itself.
 */
type ChromeScope = 'tabs' | 'screen';
const chrome = new Map<number, { extent: number; scope: ChromeScope }>();
let chromeSeq = 0;
let chromeVersion = 0;
export function useBottomChrome(extent: number, scope: ChromeScope, active = true): void {
  useEffect(() => {
    if (!active || extent <= 0) return;
    const id = ++chromeSeq;
    chrome.set(id, { extent, scope }); chromeVersion++; emit();
    return () => { chrome.delete(id); chromeVersion++; emit(); };
  }, [extent, scope, active]);
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const item = useSyncExternalStore(subscribe, () => current, () => current);
  useSyncExternalStore(subscribe, () => chromeVersion, () => chromeVersion);
  const segments = useSegments();
  const onTabs = (segments as string[])[0] === '(tabs)';
  let extent = insets.bottom + 16;
  for (const c of chrome.values()) if (c.scope === 'screen' || onTabs) extent = Math.max(extent, c.extent);
  const [shown, setShown] = useState<ToastItem | null>(null);

  useEffect(() => {
    setShown(item);
    if (!item) return;
    const t = setTimeout(() => { if (current?.id === item.id) hideToast(); }, item.duration ?? 2200);
    return () => clearTimeout(t);
  }, [item]);

  if (!shown) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: extent + 12, alignItems: 'center' }}>
      <Animated.View
        key={shown.id}
        entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}
        exiting={FadeOutDown.duration(180).reduceMotion(ReduceMotion.System)}
        style={{ maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, ...shadow.card }}
      >
        {shown.icon ? <Ionicons name={shown.icon} size={16} color={colors.flame} /> : null}
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansMed, fontWeight: '500', color: colors.white, fontSize: 13.5, flexShrink: 1 }}>{shown.text}</Text>
        {shown.action ? (
          <Tap haptic={false} onPress={() => { hideToast(); shown.action?.onPress(); }} style={{ paddingHorizontal: 12, paddingVertical: 6, marginRight: -6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)' }}>
            <Text style={{ fontFamily: fonts.sansSemi, fontWeight: '600', color: colors.flame, fontSize: 13 }}>{shown.action.label}</Text>
          </Tap>
        ) : null}
      </Animated.View>
    </View>
  );
}
