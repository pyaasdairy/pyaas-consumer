import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { makeMutable, useSharedValue, useAnimatedScrollHandler, withTiming } from 'react-native-reanimated';

/**
 * Shared tab-bar visibility. 0 = fully shown, 1 = fully hidden (slid down).
 * The bar is rendered once by the Tabs navigator while scroll lives on each
 * screen, so this module-level shared value lets them talk on the UI thread.
 */
export const navHidden = makeMutable(0);

/** Force the bar visible (e.g. on tab switch). Safe to call from JS. */
export function revealTabBar() {
  navHidden.value = withTiming(0, { duration: 200 });
}

/**
 * useAnimatedScrollHandler that hides the bar while scrolling DOWN and reveals
 * it while scrolling UP (and always reveals near the top). Attach to a screen's
 * Animated.ScrollView / Animated.FlatList `onScroll`.
 */
export function useHideTabBarOnScroll() {
  const lastY = useSharedValue(0);
  const target = useSharedValue(0); // 0 shown / 1 hidden · only animate on a flip
  // Reveal the bar (and reset direction tracking) whenever this screen regains
  // focus · including returning from a pushed route to a scrolled-down tab,
  // which no tab-index change would otherwise reset.
  useFocusEffect(
    useCallback(() => {
      lastY.value = 0;
      target.value = 0;
      revealTabBar();
    }, [lastY, target])
  );
  return useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - lastY.value;
      lastY.value = y;
      let next = target.value;
      if (y <= 6) next = 0; // always reveal near the top
      else if (dy > 5) next = 1; // scrolling down → hide
      else if (dy < -5) next = 0; // scrolling up → reveal
      if (next !== target.value) {
        target.value = next;
        navHidden.value = withTiming(next, { duration: 240 });
      }
    },
  });
}
