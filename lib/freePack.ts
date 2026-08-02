import * as SecureStore from 'expo-secure-store';
import { getRows, insertRow, getSingle, putSingle, newId } from './localStore';
import { requireUserId } from './session';
import { addPromoCredit, rechargeWallet } from './walletApi';
import { WALLET_TEST_TOPUP, testTopup } from './razorpay';
import { isBackendConfigured } from './apiClient';
import { createSubscription, listSubscriptions, reactivateSubscription } from './subscriptions';
import { tomorrowISO } from './dates';
import { getProduct } from '../constants/products';
import { beginTrial, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from './trial';

// Re-exported so screens can pull the trial shape from one funnel-facing module.
export { TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from './trial';

/**
 * THE "2 + 2" TRIAL FUNNEL — "pay 2 days, get 2 FREE" (replaces the retired
 * "2 free days" pack). Applies to PYAAS Taaza toned milk only. Claiming starts
 * the member's daily-milk subscription and opens the four-day trial owned by
 * lib/trial (days 1–2 paid, days 3–4 free).
 *
 * Claiming does THREE things (the marketing gimmick is really a subscription
 * funnel):
 *   (a) credits the PROMO balance with the value of the TWO FREE days
 *       (2 × ₹29 = ₹58), idempotent on ref `trial_2plus2:<phone>`, so days 3–4
 *       net out for free in the local demo (the backend zeroes free-day debits
 *       for real);
 *   (b) auto-creates a DAILY subscription for taaza-500ml starting tomorrow and
 *       anchors the trial (beginTrial): days 1–2 are paid from the wallet,
 *       days 3–4 are free, and the subscription CONTINUES at ₹29/day until the
 *       member pauses/cancels;
 *   (c) in test-top-up mode only (EXPO_PUBLIC_WALLET_TEST_TOPUP==='true'),
 *       tops the wallet up ₹200 via the test path so the paid days demonstrably
 *       charge cleanly.
 *
 * It can be claimed exactly ONCE PER NUMBER, gated on two layers so no one can
 * reinstall their way to infinite free milk — while every new sign-up is still a
 * fresh first-time user (so the funnel shows + is testable):
 *   1. Per PHONE  - `addPromoCredit` is idempotent on ref_id `trial_2plus2:<phone>`,
 *      and the claims table rejects a second claim by the same number. (We no
 *      longer cap by DEVICE — that suppressed the offer for every later account
 *      on a shared/test device; phone-uniqueness is the honest gate.)
 *   2. Server (the hard gate, when the Go backend is live) - a `free_pack_claims`
 *      table with UNIQUE(phone) plus a device fingerprint; a device that claims
 *      more than a small number of phones is flagged and denied. Local storage
 *      can be cleared by a reinstall, but the server's phone-uniqueness stands.
 *   TODO(api): POST /consumer/trial/claim { phone, device_id } -> server enforces uniqueness.
 *
 * The SHOW state (seen / snooze) is keyed PER USER (uid), not per device, so the
 * banner + pop-up re-arm for each account and re-appear on reopen until claimed.
 */

export const FREE_PACK_PRODUCT_ID = 'taaza-500ml';
/** ₹/day of the funnel SKU (falls back to the launch price if the SKU moves). */
export const FREE_PACK_DAILY_PRICE = getProduct(FREE_PACK_PRODUCT_ID)?.price ?? 29;
/** Promo credit granted on claim: the value of the TWO FREE days (2 × ₹29). */
export const FREE_PACK_VALUE = FREE_PACK_DAILY_PRICE * TRIAL_FREE_DAYS;
/** Test-mode wallet top-up so the paid-day subscription charges demonstrably succeed. */
const TEST_TOPUP_AMOUNT = 200;
const DEVICE_ID_KEY = 'parag_device_id';
const CLAIMS_TABLE = 'free_pack_claims'; // device-global (ownerId = 'device')
const DEVICE_OWNER = 'device';
const SEEN_TABLE = 'free_pack_seen';     // PER-USER (keyed by uid): popup permanently dismissed
const SNOOZE_TABLE = 'free_pack_snooze'; // PER-USER (keyed by uid): soft "Maybe later" state
// "Maybe later" re-offers the pack next session and NEVER gives up permanently
// (only a claim / a real subscription stops it) — the relentless money-first funnel.
const SNOOZE_HOURS = 6; // don't re-nag within the same session; re-offer next session

type Claim = { phone: string; device_id: string; claimed_at: string; user_id: string };

/** Stable-ish device id (persisted in secure store). The real cross-reinstall
 *  gate is server-side phone uniqueness; this is the local device layer. */
export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = newId('dev');
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

function normPhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/** Whether this account is eligible to claim (phone not used, device under cap). */
export async function freePackEligible(phone: string): Promise<{ eligible: boolean; reason?: string }> {
  const p = normPhone(phone);
  const claims = await getRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER);
  // Phone-uniqueness is the real gate (the server enforces it hard). We no longer
  // block by device count — one trial PER NUMBER — so every new sign-up is a fresh
  // first-time user (and the funnel is testable), while a re-claim by the same
  // number is still refused.
  if (claims.some((c) => normPhone(c.phone) === p)) return { eligible: false, reason: 'This number has already started its trial.' };
  return { eligible: true };
}

// Module-level in-flight mutex: a double-tap (or the flow mounted on several
// screens at once) must never run two claims concurrently — the second caller
// simply awaits the first claim's result. Single JS thread makes this promise
// latch a complete guard against the check-then-act race over AsyncStorage.
let claimInFlight: Promise<{ ok: boolean; value: number; reason?: string; subscriptionId?: string }> | null = null;

/** Start the 2+2 trial subscription for the signed-in phone. Idempotent +
 *  guarded (serialized, concurrent calls share one claim). Credits the 2 free
 *  days of PYAAS Taaza as promo, auto-starts the taaza-500ml DAILY subscription
 *  (from tomorrow), anchors the trial, and in test mode tops the wallet up so
 *  the paid days charge cleanly. */
export function claimFreePack(phone: string): Promise<{ ok: boolean; value: number; reason?: string; subscriptionId?: string }> {
  if (!claimInFlight) {
    claimInFlight = doClaimFreePack(phone).finally(() => { claimInFlight = null; });
  }
  return claimInFlight;
}

async function doClaimFreePack(phone: string): Promise<{ ok: boolean; value: number; reason?: string; subscriptionId?: string }> {
  const uid = await requireUserId();
  const gate = await freePackEligible(phone);
  if (!gate.eligible) return { ok: false, value: 0, reason: gate.reason };
  const deviceId = await getDeviceId();
  const p = normPhone(phone);
  // (a) Grant the 2-free-days promo credit FIRST, idempotent on the phone. In backend
  // mode this either lands on the server or is durably parked for replay
  // (walletApi pending_promos); a HARD failure throws before the claim row is
  // written below, so a failed claim stays claimable instead of burning the
  // one-per-device gate with no money behind it.
  await addPromoCredit(FREE_PACK_VALUE, {
    ref_id: `trial_2plus2:${p}`,
    remark: `Trial · ${TRIAL_FREE_DAYS} free days of PYAAS Taaza toned milk 500 ml`,
  });
  // Record the claim (device-global) only now that the credit path succeeded.
  await insertRow<Claim>(CLAIMS_TABLE, DEVICE_OWNER, {
    phone: p, device_id: deviceId, claimed_at: new Date().toISOString(), user_id: uid,
  });
  // (b) Auto-start the daily subscription (first delivery tomorrow) and anchor
  // the trial. Days 1–2 are paid; days 3–4 are free (backend zeroes the debit,
  // the local promo credit covers it); it keeps running at ₹29/day until
  // paused/cancelled. Reuses an existing daily sub for the SKU instead of
  // doubling the member's milk — and REACTIVATES it (fresh start date,
  // deliveries from tomorrow) if it was paused, so "your subscription is LIVE"
  // is never reported over a sub that would deliver nothing.
  let subscriptionId: string | undefined;
  try {
    const existing = await listSubscriptions();
    const dup = existing.find((s) => s.product_id === FREE_PACK_PRODUCT_ID && s.frequency === 'daily' && s.status !== 'cancelled');
    if (dup) {
      if (dup.status === 'paused') await reactivateSubscription(dup.id, tomorrowISO());
      subscriptionId = dup.id;
    } else {
      const sku = getProduct(FREE_PACK_PRODUCT_ID);
      subscriptionId = await createSubscription({
        productId: FREE_PACK_PRODUCT_ID,
        variant: sku?.variant ?? '500ml Pouch',
        qty: 1,
        unitPrice: FREE_PACK_DAILY_PRICE,
        frequency: 'daily',
        startDate: tomorrowISO(),
      });
    }
    // Day 1 = the first delivery (tomorrow). Idempotent, so a re-claim over an
    // existing subscription never re-arms the trial.
    await beginTrial(tomorrowISO());
  } catch { /* non-fatal — the promo credit stands; the member can subscribe manually */ }
  // (c) TEST-ONLY top-up (₹200) so the paid-day wallet charge demonstrably succeeds.
  if (WALLET_TEST_TOPUP) {
    const topupRef = `free_pack_topup:${p}`;
    try {
      if (isBackendConfigured()) await testTopup(TEST_TOPUP_AMOUNT);
      else await rechargeWallet(TEST_TOPUP_AMOUNT, 'test', topupRef);
    } catch {
      // Backend-mode failure is left alone (a local row would be invisible
      // money next to the server wallet); this is a dev convenience only.
      // In local mode, retry the ledger write once — idempotent on the ref.
      if (!isBackendConfigured()) {
        try { await rechargeWallet(TEST_TOPUP_AMOUNT, 'test', topupRef); } catch { /* non-fatal */ }
      }
    }
  }
  await markSeen();
  notifyFreePackChanged();
  return { ok: true, value: FREE_PACK_VALUE, subscriptionId };
}

// ── Change listeners ─────────────────────────────────────────────────────────
// The claim can happen from the boot modal while the home tab stays focused, so
// focus-based rechecks never fire. Screens showing claim-dependent UI (the home
// "Claim your free pack" card) subscribe here and re-check on every claim.
const freePackListeners = new Set<() => void>();

/** Subscribe to free-pack claims; returns an unsubscribe. */
export function onFreePackChanged(cb: () => void): () => void {
  freePackListeners.add(cb);
  return () => freePackListeners.delete(cb);
}

function notifyFreePackChanged() {
  for (const cb of freePackListeners) {
    try { cb(); } catch { /* listener errors never break the claim */ }
  }
}

type Snooze = { dismissals: number; snoozed_until: string };

/**
 * SHOW-eligibility for the BANNER: a trial candidate who has NOT claimed and has
 * NOT permanently dismissed the offer. Per-USER (keyed by uid), so every new
 * sign-in is a fresh first-time user — never suppressed by a prior account on the
 * same device. Ignores the soft snooze (the banner stays; only the pop-up snoozes).
 */
export async function freePackShowEligible(phone: string): Promise<boolean> {
  const uid = await requireUserId().catch(() => null);
  if (!uid) return false;
  const seen = await getSingle<{ seen: boolean }>(SEEN_TABLE, uid);
  if (seen?.seen) return false;
  // Already subscribed (via ANY path, not just the 2+2 claim) → they are not a
  // "start your subscription" candidate, so the trial banner/pop-up must NOT nag
  // them. (Fixes the case where a member who subscribed from a product page keeps
  // seeing the trial funnel because they never tripped the per-user 'seen' flag.)
  try {
    const subs = await listSubscriptions();
    // Exclude one-time orders — only a RECURRING active/paused sub disqualifies the
    // 2+2 offer (matches the same filter in index.tsx / PromoGate / SubscriptionStatusCard).
    if (subs.some((s) => (s.status === 'active' || s.status === 'paused') && s.frequency !== 'one_time')) return false;
  } catch { /* offline — fall through to the claim gate */ }
  const gate = await freePackEligible(phone);
  return gate.eligible;
}

/**
 * Show the POP-UP: show-eligible AND not currently snoozed from a recent "Maybe
 * later". Per-user, so it re-arms for each account and re-shows on reopen until
 * the member claims or snoozes it away.
 */
export async function shouldShowFreePack(phone: string): Promise<boolean> {
  if (!(await freePackShowEligible(phone))) return false;
  const uid = await requireUserId().catch(() => null);
  if (!uid) return false;
  const snooze = await getSingle<Snooze>(SNOOZE_TABLE, uid);
  if (snooze?.snoozed_until && Date.now() < Date.parse(snooze.snoozed_until)) return false;
  return true;
}

/**
 * "Maybe later": RELENTLESS money-first funnel — a dismissal only SNOOZES the
 * offer for SNOOZE_HOURS; it NEVER permanently gives up. The 2+2 keeps coming back
 * every session until the member either CLAIMS it or starts a subscription (both
 * of which flip freePackShowEligible off). It stays session-dismissible (no
 * user-trapping interstitial), so it forces the decision without bricking the app.
 */
export async function snoozeFreePack(): Promise<void> {
  const uid = await requireUserId().catch(() => null);
  if (!uid) return;
  const prev = await getSingle<Snooze>(SNOOZE_TABLE, uid);
  const dismissals = (prev?.dismissals ?? 0) + 1;
  await putSingle<Snooze>(SNOOZE_TABLE, uid, {
    dismissals,
    snoozed_until: new Date(Date.now() + SNOOZE_HOURS * 3600_000).toISOString(),
  });
}

/** Mark the popup as permanently dismissed for THIS user (claimed / snooze cap). */
export async function markSeen(): Promise<void> {
  const uid = await requireUserId().catch(() => null);
  if (!uid) return;
  await putSingle<{ seen: boolean }>(SEEN_TABLE, uid, { seen: true });
}
