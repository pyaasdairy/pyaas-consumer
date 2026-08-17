import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, rupee, shadow, tabular } from '../lib/theme';
import { Serif, TextMed, TextSemi, Tap } from './ui';
import { navHidden } from '../lib/navVisibility';
import { useWallet } from '../store/wallet';
import { useUserLocation } from '../lib/userLocation';
import { useServiceability } from '../lib/serviceability';

/** Time-of-day greeting (incl. a playful late-night line). */
function greetingFor(name: string): string {
  // Short lines on purpose: the greeting shares its row with the logo and the
  // wallet chip, so long copy would shrink to an unreadable size on small
  // screens. First name only, no trailing clauses.
  const n = name.trim() || 'there';
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return `Good morning, ${n}`;
  if (h >= 12 && h < 17) return `Good afternoon, ${n}`;
  if (h >= 17 && h < 22) return `Good evening, ${n}`;
  if (h >= 22 || h < 3) return `Up late, ${n}?`;
  return `Early start, ${n}?`; // 3–5 AM
}

/**
 * Clean pinned home header: location line + greeting on the left, the
 * persistent wallet chip on the right (nothing else). Slides up / fades when
 * the feed scrolls down (shares `navHidden` with the tab bar).
 */
export function HomeHeader({ firstName }: { firstName: string }) {
  const insets = useSafeAreaInsets();
  const city = useUserLocation((s) => s.loc?.city ?? null);
  const openPicker = useUserLocation((s) => s.setPickerOpen);
  // Out of zone → the location line itself says so, in the exact same row
  // (same size, same icons, same alignment) and stays the tap target to
  // change location — which is the one action that can open the shop.
  const outOfZone = useServiceability((s) => s.serviceable) === false;
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -navHidden.value * (insets.top + 96) }],
    opacity: 1 - navHidden.value,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(236,226,220,0.6)' }, hideStyle]}>
      {/* Subtle frosted glass: the feed faintly shows through the pinned header. */}
      <BlurView tint="light" intensity={28} experimentalBlurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.72)' }} />
      <Animated.View entering={FadeIn.duration(420)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
          {/* PYAAS wordmark · prominent but balanced: 118 wide leaves the
              location line + greeting real room on small screens (150 crushed
              them into "Deliver t..."), keeping the row symmetric. */}
          <Image source={require('../assets/pyaas-logo-trim.png')} style={{ width: 96, height: 96 * (317 / 1127), flexShrink: 0 }} contentFit="contain" />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <Tap haptic={false} onPress={() => openPicker(true)} accessibilityLabel="Change delivery location">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location" size={13} color={colors.flameDeep} />
                {/* Same length class as "Deliver to <city>" so the row never
                    truncates; the pin + chevron already read as "tap to change". */}
                <TextMed style={{ fontSize: 12.5, letterSpacing: 0.1, flexShrink: 1 }} numberOfLines={1} color={outOfZone ? colors.flameDeep : colors.ink}>
                  {outOfZone ? 'Unserviceable' : city ? `Deliver to ${city}` : 'Set your location'}
                </TextMed>
                <Ionicons name="chevron-down" size={13} color={colors.flameDeep} />
              </View>
            </Tap>
            {/* adjustsFontSizeToFit: the greeting shrinks instead of ellipsizing,
                so it fits any name on any display width. */}
            <Serif style={{ fontSize: 18, lineHeight: 23, letterSpacing: -0.2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{greetingFor(firstName)}</Serif>
          </View>
        </View>
        {/* Right side: ONLY the wallet chip — no cart button, no avatar. The
            cart lives in the bottom bar and the profile on its own tab. */}
        <WalletChip />

      </Animated.View>
    </Animated.View>
  );
}

/** The persistent wallet chip: live balance in a pink box, always top-right. */
function WalletChip() {
  const router = useRouter();
  const balance = useWallet((s) => s.balance);
  return (
    <Tap
      onPress={() => router.push('/(tabs)/wallet')}
      scaleTo={0.94}
      accessibilityLabel={`Wallet balance ${rupee(balance)}`}
      style={{ height: 34, minWidth: 48, flexShrink: 0, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.flameDeep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, ...shadow.soft }}
    >
      <Ionicons name="wallet" size={13} color={colors.white} />
      <TextSemi color={colors.white} style={{ fontSize: 12, ...tabular }} numberOfLines={1}>{rupee(balance)}</TextSemi>
    </Tap>
  );
}

/** Height the pinned header occupies, so the feed can pad its top to clear it. */
export function useHomeHeaderHeight() {
  const insets = useSafeAreaInsets();
  // topPad(8) + greeting block(~50) + bottomPad(12)
  return insets.top + 8 + 50 + 12;
}
