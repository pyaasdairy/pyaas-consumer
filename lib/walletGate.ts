import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId, getProfile } from './session';
import { claimFreePack } from './freePack';

/**
 * ₹100 WALLET GATE + THE 7-DAY STARTER PLAN
 * -----------------------------------------
 * Purchasing is LOCKED until the member funds their PYAAS wallet to the ₹100
 * minimum. The moment the balance first reaches the target, the account unlocks
 * PERMANENTLY (spending back below it never re-locks it) and the member is set
 * up with their 7-day starter subscription: PYAAS Gold 500 ml daily from tomorrow,
 * with the FIRST 2 DAYS ON US (a promo credit covers them; the remaining days
 * bill from the wallet as normal).
 *
 * The unlock check runs inside the wallet store's refresh, so ANY top-up path
 * (recharge screen, autopay, promo) trips it the moment the balance lands —
 * no screen has to remember to call it.
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
 * reaches the target: persist the unlock and auto-start the starter plan.
 * Idempotent and serialized; every step is error-soft so a partial failure never
 * blocks the unlock itself.
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
  await startStarterPlan(uid);
  for (const cb of listeners) { try { cb(); } catch { /* listener errors never break the unlock */ } }
}

/**
 * The 7-day starter plan IS the free-pack claim: the same 2-free-days credit,
 * the same daily Gold subscription from tomorrow, the same trial anchor and
 * nag retirement. Delegating to claimFreePack means ONE in-flight mutex, ONE
 * eligibility gate (per-phone claim marker) and ONE credit ref — so the unlock
 * path and the ClaimPackFlow popup can never double-grant, whichever order
 * they fire in (already-claimed simply resolves { ok: false } with no credit).
 */
async function startStarterPlan(_uid: string): Promise<void> {
  try {
    const phone = (await getProfile())?.phone;
    if (!phone) return;
    await claimFreePack(phone);
  } catch { /* error-soft — the unlock itself must never be blocked */ }
}
