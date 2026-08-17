import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './session';

/**
 * ₹100 WALLET GATE
 * ----------------
 * Purchasing is LOCKED until the member funds their PYAAS wallet to the ₹100
 * minimum. The moment the balance first reaches the target, the account
 * unlocks PERMANENTLY (spending back below it never re-locks it).
 *
 * THE UNLOCK CREATES NOTHING. It used to auto-start the 7-day starter
 * subscription (claimFreePack) as a side effect of the wallet refresh — so a
 * member who merely topped up was silently enrolled in a recurring daily milk
 * charge they never agreed to on any screen. That is the auto-subscription
 * dark pattern Play's Deceptive Behavior policy exists for, and it is the
 * category the app was removed under once already. Enrollment now happens in
 * exactly two places, both explicit taps that display the real per-delivery
 * charge: ClaimPackFlow's confirm and SubscribeSheet's Subscribe. Never here.
 */

export const WALLET_UNLOCK_TARGET = 100;
export const STARTER_PLAN_DAYS = 7;
export const STARTER_FREE_DAYS = 2;

const UNLOCK_KEY_PREFIX = 'pyaas_wallet_unlocked:';

/** Whether this account has ever crossed the ₹500 target (purchases unlocked). */
export async function purchasesUnlocked(currentBalance?: number): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  if ((currentBalance ?? 0) >= WALLET_UNLOCK_TARGET) return true;
  try { return (await AsyncStorage.getItem(UNLOCK_KEY_PREFIX + uid)) === '1'; } catch { return false; }
}

// Unlock listeners: screens showing the gate (cart CTA, product page) subscribe
// so they flip to the unlocked state the instant the top-up lands.
const listeners = new Set<() => void>();
export function onWalletUnlocked(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let syncInFlight: Promise<void> | null = null;

/**
 * Called from the wallet store on every balance refresh. First time the balance
 * reaches the target: persist the unlock flag and notify listeners. Idempotent
 * and serialized. Creates NO subscription and moves NO money (see header).
 */
export function syncWalletUnlock(balance: number): Promise<void> {
  if (balance < WALLET_UNLOCK_TARGET) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSync(balance).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function doSync(_balance: number): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  const key = UNLOCK_KEY_PREFIX + uid;
  try {
    if ((await AsyncStorage.getItem(key)) === '1') return; // already unlocked
    await AsyncStorage.setItem(key, '1');
  } catch { return; }
  for (const cb of listeners) { try { cb(); } catch { /* listener errors never break the unlock */ } }
}
