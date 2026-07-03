import * as Haptics from 'expo-haptics';

/**
 * Centralised haptic vocabulary for the whole app.
 *
 * Every ordinary tap routes through `tap` (a light tick). Major buttons — the
 * order / checkout / pay CTAs — use `press` (a weightier medium thud) so they
 * feel distinct under the thumb. The moment an order is actually placed we fire
 * `confirm`: a strong, unmistakable double-beat that lands into a success chime.
 *
 * All calls are fire-and-forget and never throw (a device without a vibrator,
 * or a simulator, simply no-ops) so callers never need a try/catch.
 */
function safe(fn: () => Promise<unknown> | void) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => {});
  } catch {
    /* no haptic engine — ignore */
  }
}

export const haptics = {
  /** Light tick — every ordinary tap. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Weightier press — primary CTAs (order, checkout, pay, add). */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy single thud. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Discrete selection — chips, day picker, tabs, toggles. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Soft positive notification. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /**
   * STRONG confirmation — a firm thunk that resolves into a success chime.
   * Reserved for the instant an order / subscription / payment is committed, so
   * the customer physically feels that it landed.
   */
  confirm: () => {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    setTimeout(() => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)), 95);
    setTimeout(() => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)), 210);
  },
};

/** Weight presets for the shared <Tap> primitive. */
export type HapticWeight = 'light' | 'medium' | 'heavy' | 'selection' | 'none';

export function fireHaptic(weight: HapticWeight) {
  switch (weight) {
    case 'light':
      return haptics.tap();
    case 'medium':
      return haptics.press();
    case 'heavy':
      return haptics.heavy();
    case 'selection':
      return haptics.select();
    case 'none':
    default:
      return;
  }
}
