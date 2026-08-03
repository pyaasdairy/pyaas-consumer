import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './session';
import { addPromoCredit } from './walletApi';
import { createSubscription, listSubscriptions, reactivateSubscription } from './subscriptions';
import { beginTrial } from './trial';
import { markSeen } from './freePack';
import { tomorrowISO } from './dates';
import { getProduct } from '../constants/products';

/**
 * ₹500 WALLET GATE + THE 7-DAY STARTER PLAN
 * -----------------------------------------
 * Purchasing is LOCKED until the member funds their PYAAS wallet to the ₹100
 * minimum. The moment the balance first reaches the target, the account unlocks
 * PERMANENTLY (spending back below it never re-locks it) and the member is set
 * up with their 7-day starter subscription: PYAAS Gold 500 ml daily from tomorrow,
 * with the FIRST 2 DAYS ON US (a promo credit covers them; the remaining days
 * bill ₹29/day from the wallet as normal).
 *
 * The unlock check runs inside the wallet store's refresh, so ANY top-up path
 * (recharge screen, autopay, promo) trips it the moment the balance lands —
 * no screen has to remember to call it.
 */

export const WALLET_UNLOCK_TARGET = 100;
export const STARTER_PLAN_DAYS = 7;
export const STARTER_FREE_DAYS = 2;
const STARTER_SKU = 'gold-500ml'; // PYAAS Gold full cream 500 ml — the free pack

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

/** The 7-day starter plan: 2 free days credited, a daily Taaza subscription from
 *  tomorrow, and the trial anchored so the "first days free" chip shows. */
async function startStarterPlan(uid: string): Promise<void> {
  const sku = getProduct(STARTER_SKU);
  const daily = sku?.price ?? 29;
  // (a) The 2 free days, on us — idempotent per account.
  try {
    await addPromoCredit(daily * STARTER_FREE_DAYS, {
      ref_id: `starter7:${uid}`,
      remark: `7-day starter plan · first ${STARTER_FREE_DAYS} days of PYAAS Gold full cream free`,
    });
  } catch { /* promo replay lands on a later refresh; the plan still starts */ }
  // (b) The daily subscription, from tomorrow. Reuses (and revives) an existing
  // daily sub for the SKU instead of doubling the member's milk. Creation can
  // fail when no exact delivery point is on file yet — that's fine, the claim
  // flow captures the address and starts it from there.
  try {
    const existing = await listSubscriptions();
    const dup = existing.find((s) => s.product_id === STARTER_SKU && s.frequency === 'daily' && s.status !== 'cancelled');
    if (dup) {
      if (dup.status === 'paused') await reactivateSubscription(dup.id, tomorrowISO());
    } else {
      await createSubscription({
        productId: STARTER_SKU,
        variant: sku?.variant ?? '500ml Pouch',
        qty: 1,
        unitPrice: daily,
        frequency: 'daily',
        startDate: tomorrowISO(),
      });
    }
    await beginTrial(tomorrowISO());
    // The starter plan replaces the 2+2 nag for this account.
    await markSeen();
  } catch { /* no delivery point yet — the subscribe/claim flow completes it */ }
}
