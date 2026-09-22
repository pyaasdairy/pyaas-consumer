import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * RATE THE APP — when to ask, and how.
 *
 * The ask is the OS's own rating prompt (see requestNativeReview below), shown
 * once the member has actually been served:
 *   - at least 3 delivered orders,
 *   - never within 60 days of the last ask,
 *   - never again once they have rated.
 */

const KEY_LAST_ASKED = 'pyaas_rate_last_asked';
const KEY_DONE = 'pyaas_rate_done';
const KEY_DELIVERED = 'pyaas_rate_delivered_seen';

const MIN_DELIVERED = 3;
const COOLDOWN_DAYS = 60;

/** Apple's App Store id for PYAAS (App Store Connect). */
const IOS_APP_ID = '6802787510';
const ANDROID_PACKAGE = 'in.pyaasdairy.app';

/** The store page, ready to leave a review. */
export function storeReviewUrl(): string {
  return Platform.OS === 'ios'
    ? `itms-apps://itunes.apple.com/app/id${IOS_APP_ID}?action=write-review`
    : `market://details?id=${ANDROID_PACKAGE}`;
}

/** Web fallback when the store app is not installed (emulators, sideloads). */
export function storeWebUrl(): string {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

/** Open the store review sheet, falling back to the web listing. */
export async function openStoreReview(): Promise<void> {
  try {
    await Linking.openURL(storeReviewUrl());
  } catch {
    try { await Linking.openURL(storeWebUrl()); } catch { /* nothing we can do */ }
  }
}

/** Remember that the member rated (or declined for good) — never ask again. */
export async function markRatingSettled(): Promise<void> {
  try { await AsyncStorage.setItem(KEY_DONE, '1'); } catch { /* best-effort */ }
}

export async function markAsked(): Promise<void> {
  try { await AsyncStorage.setItem(KEY_LAST_ASKED, new Date().toISOString()); } catch { /* best-effort */ }
}

/**
 * Record how many delivered orders this member has, so the prompt can wait
 * until they have genuinely been served. Cheap and idempotent.
 */
export async function recordDeliveredCount(n: number): Promise<void> {
  try { await AsyncStorage.setItem(KEY_DELIVERED, String(Math.max(0, Math.round(n)))); } catch { /* best-effort */ }
}

/** Should we show the rating sheet right now? */
export async function shouldAskForRating(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(KEY_DONE)) return false;
    const delivered = Number((await AsyncStorage.getItem(KEY_DELIVERED)) ?? 0);
    if (!Number.isFinite(delivered) || delivered < MIN_DELIVERED) return false;
    const last = await AsyncStorage.getItem(KEY_LAST_ASKED);
    if (last) {
      const days = (Date.now() - new Date(last).getTime()) / 86400000;
      if (!Number.isFinite(days) || days < COOLDOWN_DAYS) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── The OS's own rating prompt (Blinkit-style) ───────────────────────────────
// "Enjoying PYAAS? Tap a star to rate it on the App Store." is iOS's native
// review sheet (SKStoreReviewController); Android shows Google Play's in-app
// review card. Both are free and rate in place without leaving the app. Apple
// also REQUIRES this API for review prompts (Guideline 5.6.1): a custom star
// sheet that routes only happy raters to the store is disallowed, which is why
// the in-app sheet was retired (founder call, 21 Sep).
//
// The OS decides whether to actually show it (Apple: at most 3 times a year)
// and it never shows in TestFlight. It must not be tied to a button, so the
// profile's "Rate the app" tile opens the store page instead.

type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

function storeReview(): StoreReviewModule | null {
  try {
    // Lazy: a binary without the native module keeps working without it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('expo-store-review') as StoreReviewModule;
  } catch {
    return null;
  }
}

/** Ask the OS to show its rating prompt. Records the ask either way. */
export async function requestNativeReview(): Promise<void> {
  await markAsked();
  const m = storeReview();
  if (!m) return;
  try {
    if (await m.isAvailableAsync()) await m.requestReview();
  } catch {
    /* the OS declined — nothing to do */
  }
}
