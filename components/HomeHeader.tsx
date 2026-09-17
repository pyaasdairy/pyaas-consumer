import React, { useCallback } from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, rupee, shadow, tabular } from '../lib/theme';
import { Serif, TextMed, TextSemi, Tap } from './ui';
import { navHidden } from '../lib/navVisibility';
import { useWallet } from '../store/wallet';
import { useUserLocation, deliveryPlaceLabel } from '../lib/userLocation';
import { useServiceability } from '../lib/serviceability';
import { balanceTier } from '../lib/pricing';
import { useNotifications } from '../lib/notificationCenter';

/** Time-of-day greeting (incl. a playful late-night line). */
function greetingFor(name: string): string {
  // Short lines on purpose: the greeting shares its row with the bell and the
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
 * Pinned home header.
 *
 * NO WORDMARK (founder call, 18 Sep): the logo sat top-left eating the width
 * that the delivery line and the greeting needed, and the member already knows
 * which app they opened. The location line and greeting now start at the very
 * left edge of the content column, so the header reads as one left-aligned
 * block with the bell and wallet chip balanced on the right.
 *
 * The location line prints the NATIVE locality the member would name
 * ("Sushant Golf City"), not the metro they sit in — see
 * lib/userLocation.deliveryPlaceLabel.
 *
 * Slides up / fades when the feed scrolls down (shares `navHidden` with the tab
 * bar).
 */
export function HomeHeader({ firstName }: { firstName: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const loc = useUserLocation((s) => s.loc);
  const place = deliveryPlaceLabel(loc);
  const openPicker = useUserLocation((s) => s.setPickerOpen);
  // Out of zone → the location line itself says so, in the exact same row
  // (same size, same icons, same alignment) and stays the tap target to
  // change location — which is the one action that can open the shop.
  // FRESH-VERDICT GATED: while a check is in flight, or the stored verdict
  // belongs to different coords than the chosen location, the previous
  // location's `false` must not print "Unserviceable" over a serviceable spot.
  const svcFalse = useServiceability((s) => s.serviceable) === false;
  const svcLoading = useServiceability((s) => s.loading);
  const svcLat = useServiceability((s) => s.lat);
  const svcLng = useServiceability((s) => s.lng);
  const locCoords = loc?.coords ?? null;
  const verdictFresh =
    !svcLoading &&
    (!locCoords ||
      (svcLat != null && svcLng != null &&
        Math.abs(svcLat - locCoords.lat) <= 0.001 &&
        Math.abs(svcLng - locCoords.lng) <= 0.001));
  const outOfZone = svcFalse && verdictFresh;
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -navHidden.value * (insets.top + 96) }],
    opacity: 1 - navHidden.value,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(236,226,220,0.6)' }, hideStyle]}>
      {/* Subtle frosted glass on iOS: the feed faintly shows through the pinned
          header. Android has no real blur here (the dimezis method needs a
          blurTarget and silently fell back to none), so it gets a near-solid
          wash instead of a translucent one that would let the feed bleed
          through unblurred. */}
      <BlurView tint="light" intensity={28} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.72)' }} />
      <Animated.View entering={FadeIn.duration(420)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Left block, flush to the content edge: where the milk goes, then who
            we are talking to. */}
        <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <Tap haptic={false} onPress={() => openPicker(true)} accessibilityLabel="Change delivery location" style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location" size={13} color={colors.flameDeep} />
              {/* The PLACE, not a sentence about it. "Deliver to Sushant Golf
                  City" truncated to "Deliver to Sushant G…" on a 320dp screen,
                  which spent the whole line on the preposition and clipped the
                  only part that matters. The pin and chevron already say what
                  the row is for. */}
              <TextMed
                style={{ fontSize: 13, letterSpacing: 0.1, flexShrink: 1 }}
                numberOfLines={1}
                color={outOfZone ? colors.flameDeep : colors.ink}
              >
                {outOfZone ? 'Unserviceable' : place ?? 'Set your location'}
              </TextMed>
              <Ionicons name="chevron-down" size={13} color={colors.flameDeep} />
            </View>
          </Tap>
          {/* adjustsFontSizeToFit: the greeting shrinks instead of ellipsizing,
              so it fits any name on any display width. With the wordmark gone
              it has the full column, so it can carry real display size. */}
          <Serif
            style={{ fontSize: width < 360 ? 21 : 23, lineHeight: 28, letterSpacing: -0.3 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {greetingFor(firstName)}
          </Serif>
        </View>
        {/* Right side: the notification bell and the wallet chip. */}
        <NotificationBell />
        <WalletChip />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The notification bell — now ALWAYS present (founder call, 18 Sep: "in-app
 * notifications need to be live"). It used to render only while the CRM inbox
 * had unread rows, which meant a member had no way to go back and read what the
 * app had told them. Unread rows add the count badge; an empty feed still opens
 * a screen that explains what lands there and lets them turn updates on.
 */
function NotificationBell() {
  const router = useRouter();
  const unread = useNotifications((s) => s.unread);
  const refresh = useNotifications((s) => s.refresh);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const badge = unread > 9 ? '9+' : String(unread);
  return (
    <Tap
      onPress={() => router.push('/notifications')}
      scaleTo={0.94}
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      style={{ height: 34, width: 34, flexShrink: 0, marginRight: 8, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: unread > 0 ? colors.flameDeep : colors.line, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={16} color={colors.flameDeep} />
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.white }}>
          <TextSemi color={colors.white} style={{ fontSize: 9, lineHeight: 12, ...tabular }}>{badge}</TextSemi>
        </View>
      ) : null}
    </Tap>
  );
}

/**
 * The persistent wallet chip: live balance, always top-right.
 * COLOUR CARRIES THE STATE (founder call, 18 Sep): pink while the wallet is
 * healthy, RED the moment it falls under the critical floor, because that is
 * the point at which tomorrow's delivery can actually fail to settle.
 */
function WalletChip() {
  const router = useRouter();
  const balance = useWallet((s) => s.balance);
  const tier = balanceTier(balance);
  const critical = tier === 'critical';
  return (
    <Tap
      onPress={() => router.push('/(tabs)/wallet')}
      scaleTo={0.94}
      accessibilityLabel={critical ? `Wallet balance ${rupee(balance)}, low. Recharge` : `Wallet balance ${rupee(balance)}`}
      style={{ height: 34, minWidth: 48, flexShrink: 0, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: critical ? colors.critical : colors.flameDeep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, ...shadow.soft }}
    >
      <Ionicons name={critical ? 'alert-circle' : 'wallet'} size={13} color={colors.white} />
      <TextSemi color={colors.white} style={{ fontSize: 12, ...tabular }} numberOfLines={1}>{rupee(balance)}</TextSemi>
    </Tap>
  );
}

/** Height the pinned header occupies, so the feed can pad its top to clear it. */
export function useHomeHeaderHeight() {
  const insets = useSafeAreaInsets();
  // topPad(8) + location line(~17) + greeting(28) + bottomPad(12)
  return insets.top + 8 + 17 + 28 + 12;
}
