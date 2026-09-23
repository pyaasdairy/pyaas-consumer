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

// The flag an older build persisted under this key was a device copy of a
// server-side ledger fact. It is deleted on the first read this session and
// never written again.
const LEGACY_UNLOCK_KEY_PREFIX = 'pyaas_wallet_unlocked:';

// The unlock as THIS SESSION knows it, per account: proven by a balance the
// wallet store read from the server for the current account (syncWalletUnlock)
// or by the ledger (GET /wallet/txns), never written to the device. Only a
// proven unlock is remembered; a failed read answers locked for that check
// and asks again next time (fail-closed).
let unlocked: { uid: string } | null = null;
let legacyFlagDropped: string | null = null;

function dropLegacyFlag(uid: string): void {
  if (legacyFlagDropped === uid) return;
  legacyFlagDropped = uid;
  AsyncStorage.removeItem(LEGACY_UNLOCK_KEY_PREFIX + uid).catch(() => { legacyFlagDropped = null; });
}

/** Whether this account has ever crossed the unlock target (purchases unlocked). */
export async function purchasesUnlocked(currentBalance?: number): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  dropLegacyFlag(uid);
  // A balance at the target answers this check, but it does not latch: the
  // caller's number is whatever the wallet store holds, and only a refresh
  // that succeeded for the current account may remember the unlock for the
  // session (syncWalletUnlock, called from that success path).
  if ((currentBalance ?? 0) >= WALLET_UNLOCK_TARGET) return true;
  if (unlocked?.uid === uid) return true;
  // Not proven this session: ask the ledger (below). Never reached once the
  // unlock is known, so the unlocked hot path is a memory read with no network.
  if (ledgerProbe?.uid !== uid) {
    const p = unlockProvenByLedger(uid).finally(() => {
      if (ledgerProbe?.p === p) ledgerProbe = null;
    });
    ledgerProbe = { uid, p };
  }
  return ledgerProbe.p;
}

// SERVER TRUTH (the freePack.offerQualified pattern): the member may have
// funded the wallet past the target and spent it back below (the ratchet
// means that must NOT re-lock them), and a new phone or reinstall knows
// nothing. The wallet LEDGER is authoritative: any SINGLE successful CASH
// credit of >= the unlock target proves the account crossed it. The seeded
// opening balance, reward/promo credits, and small top-ups that merely SUM to
// the target never do. On proof the session remembers the unlock so the next
// check is a memory read. ANY failure (offline, timeout, 5xx, or a 404 from
// an older deployed backend) keeps today's answer: locked, fail-closed, zero
// UX change. Single-flight per uid so the cart CTA and SubscribeSheet
// double-checking at once share one GET /wallet/txns.
let ledgerProbe: { uid: string; p: Promise<boolean> } | null = null;

/** Sign-out: forget this account's unlock and its in-flight ledger probe. */
export function clearWalletGateSession(): void {
  unlocked = null;
  ledgerProbe = null;
  legacyFlagDropped = null;
}

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
    unlocked = { uid };
    return true;
  } catch {
    return false; // ledger unreachable: locked for this check (fail-closed)
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
 * Called from the wallet store after a balance refresh that succeeded for
 * `uid`, the account the store verified is still signed in. First time this
 * session sees the balance at the target: remember the unlock and notify
 * listeners. Idempotent and serialized; no await before the latch, so a
 * sign-out cannot slip in between. Creates NO subscription and moves NO
 * money (see header).
 */
export function syncWalletUnlock(balance: number, uid: string): Promise<void> {
  if (balance < WALLET_UNLOCK_TARGET) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSync(uid).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function doSync(uid: string): Promise<void> {
  dropLegacyFlag(uid);
  if (unlocked?.uid === uid) return; // already unlocked this session
  unlocked = { uid };
  for (const cb of listeners) { try { cb(); } catch { /* listener errors never break the unlock */ } }
}
