import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from './session';
import { getLedger } from './walletApi';

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

/** Whether this account has ever crossed the unlock target (purchases unlocked). */
export async function purchasesUnlocked(currentBalance?: number): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  if ((currentBalance ?? 0) >= WALLET_UNLOCK_TARGET) return true;
  try {
    if ((await AsyncStorage.getItem(UNLOCK_KEY_PREFIX + uid)) === '1') return true;
  } catch { /* flag unreadable — fall through to the ledger */ }
  // Flag ABSENT → ask the ledger (below). Never reached when the flag is set,
  // so the unlocked hot path stays a single local read with no network.
  if (ledgerProbe?.uid !== uid) {
    const p = unlockProvenByLedger(uid).finally(() => {
      if (ledgerProbe?.p === p) ledgerProbe = null;
    });
    ledgerProbe = { uid, p };
  }
  return ledgerProbe.p;
}

// SERVER-TRUTH FALLBACK (the freePack.offerQualified pattern): the unlock flag
// is device-local — a reinstall or a new phone loses it even though the member
// already funded the wallet past ₹100, and the balance they were left with may
// have been spent back below the target (the ratchet means that must NOT
// re-lock them). The wallet LEDGER is authoritative: any SINGLE successful
// CASH credit of ≥ the unlock target proves the account crossed it. The seeded
// opening balance, reward/promo credits, and small top-ups that merely SUM to
// the target never do. On proof the local flag is re-cached so the next check
// is flag-only again. ANY failure (offline, timeout, 5xx, or a 404 from an
// older deployed backend) keeps today's answer: locked, fail-closed, zero UX
// change. Single-flight per uid so the cart CTA and SubscribeSheet double-
// checking at once share one GET /wallet/txns.
let ledgerProbe: { uid: string; p: Promise<boolean> } | null = null;

async function unlockProvenByLedger(uid: string): Promise<boolean> {
  try {
    const rows = await getLedger();
    const proven = rows.some(
      (r) =>
        r.type === 'credit' &&
        r.bucket === 'cash' &&
        r.status === 'success' &&
        r.amount >= WALLET_UNLOCK_TARGET &&
        r.ref_type !== 'seed' &&
        r.ref_type !== 'reward',
    );
    if (!proven) return false;
    try { await AsyncStorage.setItem(UNLOCK_KEY_PREFIX + uid, '1'); } catch { /* cache only — the ledger answered */ }
    return true;
  } catch {
    return false; // ledger unreachable — only the local flag can unlock (fail-closed)
  }
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
