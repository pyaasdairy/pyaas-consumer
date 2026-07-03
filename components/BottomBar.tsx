import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { TextMed, Tap } from './ui';
import { navHidden } from '../lib/navVisibility';

const INK = '#2A1018';

/** Vertical space a scroll view should reserve so its last row clears the
 *  floating bar (bottom: insets.bottom + 112, ~50px tall) on every device. */
export function useBottomBarClearance() {
  const insets = useSafeAreaInsets();
  return insets.bottom + 112 + 50 + 14;
}

function MiniButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Tap onPress={onPress} scaleTo={0.86} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
      <Ionicons name={icon} size={20} color={colors.roseDeep} />
    </Tap>
  );
}

/**
 * Floating action row that sits just above the tab bar: a small Search "tab"
 * flanked by mini quick-action buttons. Slides down / fades with the tab bar
 * when the feed scrolls (shares `navHidden`).
 */
export function BottomBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: navHidden.value * (insets.bottom + 190) }],
    opacity: 1 - navHidden.value,
  }));
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: insets.bottom + 112, flexDirection: 'row', alignItems: 'center', gap: 10 }, hideStyle]}
    >
      <Animated.View entering={FadeInDown.duration(440).delay(80)}>
        <MiniButton icon="calendar-clear-outline" onPress={() => router.push('/subscriptions')} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(440)} style={{ flex: 1 }}>
        <Tap onPress={() => router.push('/search')} scaleTo={0.97}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: INK, borderRadius: radius.pill, paddingHorizontal: 18, height: 50, ...shadow.card }}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.85)" />
            <TextMed color="rgba(255,255,255,0.65)" style={{ fontSize: 14.5 }}>Search milk, ghee, paneer…</TextMed>
          </View>
        </Tap>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(440).delay(140)}>
        <MiniButton icon="chatbubble-ellipses-outline" onPress={() => router.push('/support')} />
      </Animated.View>
    </Animated.View>
  );
}
