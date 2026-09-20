import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './session';

/**
 * RATE THE APP — the in-app rating ask, and the feedback path that catches the
 * unhappy answers before they reach a public store review.
 *
 * THE RULE: we ask for a star rating INSIDE the app first. Four or five stars
 * gets a one-tap hop to the store listing's review sheet. One to three stars
 * never goes to the store — it opens the complaint register with the app
 * category preselected, because a member with a real problem should be talking
 * to us, not typing into a review nobody on our side can answer.
 *
 * WHEN WE ASK (so it is never a nag):
 *   - at least 3 delivered orders (they have actually used the service),
 *   - never within 60 days of the last ask,
 *   - never again once they have rated (or asked us not to).
 */

// PER ACCOUNT, not per device: with fixed keys, one member tapping a star (or
// 'not now') permanently silenced the ask for every later account on that
// phone, and the flags survived account deletion.
const KEY_LAST_ASKED = 'pyaas_rate_last_asked';
const KEY_DONE = 'pyaas_rate_done';
const KEY_DELIVERED = 'pyaas_rate_delivered_seen';

async function k(base: string): Promise<string> {
  const uid = await getUserId();
  return uid ? base + ':' + uid : base;
}

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
  try { await AsyncStorage.setItem(await k(KEY_DONE), '1'); } catch { /* best-effort */ }
}

export async function markAsked(): Promise<void> {
  try { await AsyncStorage.setItem(await k(KEY_LAST_ASKED), new Date().toISOString()); } catch { /* best-effort */ }
}

/**
 * Record how many delivered orders this member has, so the prompt can wait
 * until they have genuinely been served. Cheap and idempotent.
 */
export async function recordDeliveredCount(n: number): Promise<void> {
  try { await AsyncStorage.setItem(await k(KEY_DELIVERED), String(Math.max(0, Math.round(n)))); } catch { /* best-effort */ }
}

/** Should we show the rating sheet right now? */
export async function shouldAskForRating(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(await k(KEY_DONE))) return false;
    const delivered = Number((await AsyncStorage.getItem(await k(KEY_DELIVERED))) ?? 0);
    if (!Number.isFinite(delivered) || delivered < MIN_DELIVERED) return false;
    const last = await AsyncStorage.getItem(await k(KEY_LAST_ASKED));
    if (last) {
      const days = (Date.now() - new Date(last).getTime()) / 86400000;
      if (!Number.isFinite(days) || days < COOLDOWN_DAYS) return false;
    }
    return true;
  } catch {
    return false;
  }
}
