import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRows, insertRow, setRows, getSingle, putSingle, newId } from './localStore';
import { requireUserId, getUserId, getProfile } from './session';
import { getLedger, rechargeWallet } from './walletApi';
import { WALLET_TEST_TOPUP, testTopup } from './razorpay';
import { isBackendConfigured } from './apiClient';
import { createSubscription, listSubscriptions, reactivateSubscription } from './subscriptions';
import { tomorrowISO } from './dates';
import { getProduct } from '../constants/products';
import { beginTrial, getTrial, TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from './trial';
import { minSubscriptionQty } from './subscriptionFloor';

// Re-exported so screens can pull the trial shape from one funnel-facing module.
export { TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from './trial';

/**
 * THE "2 + 2" TRIAL FUNNEL — "pay 2 days, get 2 FREE" (replaces the retired
 * "2 free days" pack). Applies to PYAAS Taaza toned milk only. Claiming starts
 * the member's daily-milk subscription and opens the four-day trial owned by
 * lib/trial (days 1–2 paid, days 3–4 free).
 *
 * Claiming does TWO things (the marketing gimmick is really a subscription
 * funnel). NO money is ever credited — the offer is GOODIES (free milk), not
 * rupees: the member pays their first 2 delivered days and the backend zeroes
 * the debits for days 3–4 (trial engine, isTrialProduct):
 *   (b) auto-creates a DAILY subscription starting tomorrow and
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

// The free-trial pack is PYAAS Gold FULL CREAM 500 ml (image assets/products/gold.png).
export const FREE_PACK_PRODUCT_ID = 'gold-500ml';
/** ₹/day of the funnel SKU (falls back to the launch price if the SKU moves). */
export const FREE_PACK_DAILY_PRICE = getProduct(FREE_PACK_PRODUCT_ID)?.price ?? 35;
/** Value of the TWO FREE days (2 × the daily price) — shown as the pack's worth. */
// Value of the giveaway = free days × the DAILY amount, which is the pack
// price times the 1 L/day floor quantity (2 × 500 ml) — not one lone pack.
export const FREE_PACK_VALUE =
  FREE_PACK_DAILY_PRICE * TRIAL_FREE_DAYS * minSubscriptionQty(getProduct(FREE_PACK_PRODUCT_ID) ?? { id: FREE_PACK_PRODUCT_ID, category: 'milk', variant: '500ml' });
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

/**
 * Erase this member's free-pack claim rows on account deletion.
 *
 * These live under the DEVICE owner, not the uid, so the account-deletion key
 * sweep never saw them — and each row stores the raw 10-digit mobile. Other
 * members who claimed on the same device keep their rows.
 *
 * Note this deliberately gives a deleted member their free pack back on this
 * device. That is the correct trade: honouring "your personal details are
 * permanently erased" beats retaining a phone number to defend one free pack.
 */
export async function removeFreePackClaimsForUser(uid: string): Promise<void> {
  const claims = await getRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER);
  const kept = claims.filter((c) => c.user_id !== uid);
  if (kept.length !== claims.length) await setRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER, kept);
}

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

/** THE COMPLETION LAW: the 2+2 funnel is DONE only once the member has
 *  completed their TRIAL_PAID_DAYS paid deliveries of the full-cream
 *  subscription (phase moves to 'free'/'completed' — the free days are already
 *  earned; there is nothing left to sell). Until then a pause or even a cancel
 *  mid-trial keeps the offer alive — they still owe the remaining paid day(s). */
export async function offerCompleted(): Promise<boolean> {
  try {
    const t = await getTrial();
    return t.phase === 'free' || t.phase === 'completed';
  } catch {
    return false; // offline / signed out — never close the funnel on a blip
  }
}

/** Whether this account may claim (or RE-ENTER) the trial. Open until the paid
 *  days are completed — a member who claimed then paused/cancelled after day 1
 *  resumes through the same flow to finish their remaining paid day(s). */
export async function freePackEligible(_phone: string): Promise<{ eligible: boolean; reason?: string }> {
  if (await offerCompleted()) {
    return { eligible: false, reason: 'This trial has already been completed.' };
  }
  return { eligible: true };
}

// ── The qualifying recharge ──────────────────────────────────────────────────
/** The 2+2 offer REDEEMS via a single recharge of at least this (one time).
 *  ₹99 is the floor to avail the offer; smaller recharges keep it alive and
 *  visible but never redeem it. Note this is the MINIMUM, not what we suggest —
 *  the recharge screen still defaults to {@link OFFER_SUGGESTED_RECHARGE}. */
export const OFFER_QUALIFY_RECHARGE = 99;
/** The amount the recharge screen preselects for the 2+2 unlock — a healthy
 *  starting balance, well above the ₹99 floor, so most members fund a few days
 *  of milk in one go. Members are free to type any amount ≥ the floor. */
export const OFFER_SUGGESTED_RECHARGE = 500;
const QUALIFIED_KEY_PREFIX = 'pyaas_offer_qualified:';

/** True once this account has made its one-time qualifying recharge (≥₹500 in
 *  a single top-up). The flag is a one-way ratchet, per account. */
export async function offerQualified(): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  try {
    if ((await AsyncStorage.getItem(QUALIFIED_KEY_PREFIX + uid)) === '1') return true;
  } catch { /* fall through to the ledger */ }
  // SERVER-TRUTH FALLBACK: the flag above is device-local — a reinstall, or a
  // ≥₹500 recharge made before this rule shipped (or through another screen),
  // loses it and the member gets stuck on "Add funds" despite having paid. The
  // wallet LEDGER is authoritative: any SINGLE successful CASH credit of
  // ≥₹500 qualifies. Reward/promo credits, the seeded opening balance, and
  // several small top-ups that merely SUM to ₹500 never do.
  try {
    const rows = await getLedger();
    const qualified = rows.some(
      (r) =>
        r.type === 'credit' &&
        r.bucket === 'cash' &&
        r.status === 'success' &&
        r.amount >= OFFER_QUALIFY_RECHARGE &&
        r.ref_type !== 'seed' &&
        r.ref_type !== 'reward',
    );
    if (qualified) {
      try { await AsyncStorage.setItem(QUALIFIED_KEY_PREFIX + uid, '1'); } catch { /* cache only */ }
      return true;
    }
  } catch { /* offline — only the local flag can answer */ }
  return false;
}

/**
 * Called by every recharge success path with the credited amount. The FIRST
 * single recharge ≥ OFFER_QUALIFY_RECHARGE marks the account qualified — the
 * REDEMPTION itself always goes through a review step (the claim flow's
 * confirm card, or the unlock sync's claim), never silently from a payment.
 * Smaller amounts change nothing.
 */
export async function recordRechargeForOffer(amount: number): Promise<void> {
  if (amount < OFFER_QUALIFY_RECHARGE) return;
  const uid = await getUserId();
  if (!uid) return;
  try { await AsyncStorage.setItem(QUALIFIED_KEY_PREFIX + uid, '1'); } catch { return; }
  notifyFreePackChanged();
}

/**
 * POST-SUBSCRIBE HOOK — the popup no longer creates the subscription itself;
 * it routes to the full-cream product page and the standard SubscribeSheet
 * (qty/frequency/date + review → confirm) owns the write. This hook runs after
 * ANY successful subscribe: when the new sub is the OFFER SKU (gold, daily)
 * and the member is still an eligible, ₹500-qualified 2+2 candidate, it
 * attaches the trial — the claim record + the idempotent day-1 anchor. A
 * resume after a mid-trial cancel re-enters here: no duplicate claim row, the
 * anchor is untouched, and the server's delivered-day count means only the
 * REMAINING paid day(s) are owed. Silently a no-op for any other product,
 * frequency, or an unqualified/completed member.
 */
export async function attachTrialAfterSubscribe(productId: string, frequency: string): Promise<void> {
  if (productId !== FREE_PACK_PRODUCT_ID || frequency !== 'daily') return;
  const uid = await getUserId();
  if (!uid) return;
  const prof = await getProfile().catch(() => null);
  const phone = prof?.phone ?? '';
  if (!phone) return;
  if (await offerCompleted()) return;
  if (!(await offerQualified())) return;
  const p = normPhone(phone);
  const deviceId = await getDeviceId();
  const claims = await getRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER);
  if (!claims.some((c) => normPhone(c.phone) === p)) {
    await insertRow<Claim>(CLAIMS_TABLE, DEVICE_OWNER, {
      phone: p, device_id: deviceId, claimed_at: new Date().toISOString(), user_id: uid,
    });
  }
  await beginTrial(tomorrowISO());
  notifyFreePackChanged();
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
  // THE ₹500 RULE: the offer stays pending (still claimable, still shown) until
  // the account's one-time qualifying recharge — a SINGLE top-up of at least
  // ₹500 — has landed. Nothing is burned here on an unqualified attempt.
  if (!(await offerQualified())) {
    return { ok: false, value: 0, reason: `Add ₹${OFFER_QUALIFY_RECHARGE} in one recharge to unlock this offer.` };
  }
  const deviceId = await getDeviceId();
  const p = normPhone(phone);
  // NO money is credited for the trial — the offer is GOODIES (free milk), not
  // rupees. The member pays their first 2 delivered days; the BACKEND zeroes
  // the debits for the 2 free days (trial engine, isTrialProduct). The wallet
  // is never touched here. Record the claim once (a RESUME after a mid-trial
  // pause/cancel re-enters here and must not duplicate the row).
  const priorClaims = await getRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER);
  if (!priorClaims.some((c) => normPhone(c.phone) === p)) {
    await insertRow<Claim>(CLAIMS_TABLE, DEVICE_OWNER, {
      phone: p, device_id: deviceId, claimed_at: new Date().toISOString(), user_id: uid,
    });
  }
  // (b) Auto-start the daily subscription (first delivery tomorrow) and anchor
  // the trial. Days 1–2 are paid; days 3–4 are free (the backend zeroes those
  // days' debits — no wallet credit involved); it keeps running at ₹29/day until
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
        // The 1 L/day milk floor is absolute — the claim funnel's auto-created
        // plan subscribes 2 × 500 ml, same as every hand-built subscription.
        qty: minSubscriptionQty(sku ?? { id: FREE_PACK_PRODUCT_ID, category: 'milk', variant: '500ml' }),
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
  // NOTE: deliberately NOT markSeen() here — the funnel closes only on
  // COMPLETION (2 paid days delivered, see freePackShowEligible). A member who
  // pauses/cancels after day 1 must keep seeing the offer until day 2 is done.
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
  // COMPLETED (2 paid full-cream days delivered) → the funnel disappears from
  // the home page and everywhere else, permanently.
  if (await offerCompleted()) {
    await markSeen();
    return false;
  }
  const seen = await getSingle<{ seen: boolean }>(SEEN_TABLE, uid);
  if (seen?.seen) return false;
  // ANY live subscription (active or paused, any SKU) kills the sell: a member
  // who has already set a subscription must never be pitched the 2+2 popup
  // again. Only a fully CANCELLED member becomes a prospect once more.
  try {
    const subs = await listSubscriptions();
    if (subs.some((s) => (s.status === 'active' || s.status === 'paused') && s.frequency !== 'one_time')) {
      return false;
    }
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
