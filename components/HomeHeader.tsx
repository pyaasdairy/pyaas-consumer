import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fonts } from '../lib/theme';
import { Serif, TextBody, Tap } from './ui';
import { navHidden } from '../lib/navVisibility';
import { useCart } from '../store/cart';

/** Time-of-day greeting (incl. a playful late-night line). */
function greetingFor(name: string): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return `Good morning, ${name}`;
  if (h >= 12 && h < 17) return `Good afternoon, ${name}`;
  if (h >= 17 && h < 22) return `Good evening, ${name}`;
  if (h >= 22 || h < 3) return `Why up so late, ${name}?`;
  return `Early start, ${name}?`; // 3–5 AM
}

/**
 * Clean pinned home header: a greeting, the delivery window, and a minimal
 * profile avatar. Slides up / fades when the feed scrolls down (shares
 * `navHidden` with the tab bar) and returns on scroll-up.
 */
export function HomeHeader({ firstName }: { firstName: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const initial = (firstName?.trim()?.[0] ?? 'P').toUpperCase();
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -navHidden.value * (insets.top + 96) }],
    opacity: 1 - navHidden.value,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(236,226,220,0.6)' }, hideStyle]}>
      {/* Subtle frosted glass: the feed faintly shows through the pinned header. */}
      <BlurView tint="light" intensity={28} experimentalBlurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.72)' }} />
      <Animated.View entering={FadeIn.duration(420)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          {/* PARAG sun logo · brand presence, top left */}
          <Image source={require('../assets/parag-logo.png')} style={{ width: 38, height: 38 }} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue }} />
              <TextBody style={{ fontSize: 12, letterSpacing: 0.2 }}>Morning delivery · 5–7:30 AM</TextBody>
            </View>
            <Serif style={{ fontSize: 21, lineHeight: 26, letterSpacing: -0.3 }} numberOfLines={1}>{greetingFor(firstName)}</Serif>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Cart → wallet-first checkout. Badge shows the live item count. */}
          <Tap onPress={() => router.push('/cart')} scaleTo={0.92} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, borderWidth: 1.5, borderColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bag-handle-outline" size={20} color={colors.flameDeep} />
            {cartCount > 0 ? (
              <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.flameDeep, borderWidth: 1.5, borderColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.white }}>{cartCount}</Text>
              </View>
            ) : null}
          </Tap>
          <Tap onPress={() => router.push('/(tabs)/profile')} scaleTo={0.92} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, borderWidth: 1.5, borderColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.flameDeep }}>{initial}</Text>
          </Tap>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** Height the pinned header occupies, so the feed can pad its top to clear it. */
export function useHomeHeaderHeight() {
  const insets = useSafeAreaInsets();
  // topPad(8) + greeting block(~50) + bottomPad(12)
  return insets.top + 8 + 50 + 12;
}
