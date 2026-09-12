/**
 * Shared motion language. Entrances are smooth (no bounce); interaction springs
 * mirror iOS's interactive feel. Reference these instead of inline curves/values
 * so motion stays consistent and considered across the app.
 */
import { FadeIn, FadeInDown, Easing, ReduceMotion } from 'react-native-reanimated';

/** Soft rise - for cards, sections, list items. */
export const enterUp = (delay = 0) => FadeInDown.duration(440).delay(delay).reduceMotion(ReduceMotion.System);

/** Gentle fade - for overlays, secondary content. */
export const enterFade = (delay = 0) => FadeIn.duration(420).delay(delay).reduceMotion(ReduceMotion.System);

/** Spring presets. `press`/`release` mirror iOS interactiveSpring (response ~0.15,
 *  dampingFraction ~0.86); `layout` for list reflow; `sheet` for modal surfaces. */
export const spring = {
  press: { mass: 0.5, damping: 18, stiffness: 300, overshootClamping: true, reduceMotion: ReduceMotion.System },
  // Critically damped + clamped: snaps back to full size with NO overshoot/bounce.
  release: { mass: 0.5, damping: 24, stiffness: 250, overshootClamping: true, reduceMotion: ReduceMotion.System },
  /** Count / badge 'pop' — quick overshoot then settle (qty changes, cart badge). */
  pop: { mass: 0.4, damping: 11, stiffness: 420, reduceMotion: ReduceMotion.System },
  layout: { mass: 0.8, damping: 18, stiffness: 200, reduceMotion: ReduceMotion.System },
  sheet: { damping: 80, stiffness: 500, overshootClamping: true, reduceMotion: ReduceMotion.System },
} as const;

/** Easing curves. `ios` for most UI motion, `emphasized` for hero/sheet moves. */
export const ease = {
  ios: Easing.bezier(0.25, 0.1, 0.25, 1),
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  emphasized: Easing.bezier(0.2, 0, 0, 1),
} as const;

/** Duration discipline: micro feedback 150-250ms, full-screen/sheet 350-450ms. */
export const duration = { micro: 220, ui: 300, screen: 420 } as const;
