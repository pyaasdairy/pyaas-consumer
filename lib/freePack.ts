import * as SecureStore from 'expo-secure-store';
import { getRows, insertRow, getSingle, putSingle, newId } from './localStore';
import { requireUserId } from './session';
import { addPromoCredit, rechargeWallet } from './walletApi';
import { WALLET_TEST_TOPUP, testTopup } from './razorpay';
import { isBackendConfigured } from './apiClient';
import { createSubscription, listSubscriptions, reactivateSubscription } from './subscriptions';
import { tomorrowISO } from './dates';
import { getProduct } from '../constants/products';

/**
 * "Free 500 ml daily pack for 2 days" welcome funnel, with anti-abuse safeguards.
 *
 * Claiming does THREE things (the marketing gimmick is really a subscription
 * funnel):
 *   (a) credits the PROMO balance with TWO days of the 500 ml pack
 *       (2 × ₹29 = ₹58), idempotent on ref `free_pack_2day:<phone>`;
 *   (b) auto-creates a DAILY subscription for taaza-500ml starting tomorrow —
 *       days 1–2 ride the promo credit, from day 3 the wallet pays and the
 *       subscription CONTINUES until the member pauses/cancels;
 *   (c) in test-top-up mode only (EXPO_PUBLIC_WALLET_TEST_TOPUP==='true'),
 *       tops the wallet up ₹200 via the test path so the day-3 charge
 *       demonstrably succeeds.
 *
 * It can be claimed exactly ONCE, gated on THREE layers so no one can
 * reinstall their way to infinite free milk:
 *   1. Per PHONE  - `addPromoCredit` is idempotent on ref_id `free_pack_2day:<phone>`,
 *      and the device-global claims table rejects a second claim by the same phone.
 *   2. Per DEVICE - a device-global claims table (shared across every account on
 *      the device) allows only ONE free pack per device, so switching numbers on
 *      the same phone does not mint more packs.
 *   3. Server (the hard gate, when the Go backend is live) - a `free_pack_claims`
 *      table with UNIQUE(phone) plus a device fingerprint; a device that claims
 *      more than a small number of phones is flagged and denied. Local storage
 *      can be cleared by a reinstall, but the server's phone-uniqueness stands.
 *   TODO(api): POST /free-pack/claim { phone, device_id } -> server enforces uniqueness.
 */

export const FREE_PACK_PRODUCT_ID = 'taaza-500ml';
export const FREE_PACK_DAYS = 2;
/** ₹/day of the funnel SKU (falls back to the launch price if the SKU moves). */
export const FREE_PACK_DAILY_PRICE = getProduct(FREE_PACK_PRODUCT_ID)?.price ?? 29;
/** Promo credit granted on claim: two days of the 500 ml pack (2 × ₹29 = ₹58). */
export const FREE_PACK_VALUE = FREE_PACK_DAILY_PRICE * FREE_PACK_DAYS;
/** Test-mode wallet top-up so the day-3 subscription charge demonstrably succeeds. */
const TEST_TOPUP_AMOUNT = 200;
const DEVICE_ID_KEY = 'parag_device_id';
const CLAIMS_TABLE = 'free_pack_claims'; // device-global (ownerId = 'device')
const DEVICE_OWNER = 'device';
const SEEN_TABLE = 'free_pack_seen';     // device-global: popup permanently dismissed
const SNOOZE_TABLE = 'free_pack_snooze'; // device-global: soft "Maybe later" state
const MAX_CLAIMS_PER_DEVICE = 1;
// "Maybe later" re-offers the pack next session instead of losing it forever,
// up to this many soft dismissals before it stops nagging.
const MAX_SNOOZES = 3;
const SNOOZE_HOURS = 6; // don't re-nag within the same session; re-offer later

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
  const deviceId = await getDeviceId();
  const p = normPhone(phone);
  const claims = await getRows<Claim>(CLAIMS_TABLE, DEVICE_OWNER);
  if (claims.some((c) => normPhone(c.phone) === p)) return { eligible: false, reason: 'This number has already claimed its free pack.' };
  if (claims.filter((c) => c.device_id === deviceId).length >= MAX_CLAIMS_PER_DEVICE) {
    return { eligible: false, reason: 'A free pack has already been claimed on this device.' };
  }
  return { eligible: true };
}

// Module-level in-flight mutex: a double-tap (or the flow mounted on several
// screens at once) must never run two claims concurrently — the second caller
// simply awaits the first claim's result. Single JS thread makes this promise
// latch a complete guard against the check-then-act race over AsyncStorage.
let claimInFlight: Promise<{ ok: boolean; value: number; reason?: string; subscriptionId?: string }> | null = null;

/** Claim the 2-day free pack for the signed-in phone. Idempotent + guarded
 *  (serialized — concurrent calls share one claim). Credits ₹58 promo,
 *  auto-starts the taaza-500ml DAILY subscription (from tomorrow) and, in test
 *  mode, tops the wallet up so day 3 charges cleanly. */
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
  // (a) Grant the 2-day promo credit FIRST, idempotent on the phone. In backend
  // mode this either lands on the server or is durably parked for replay
  // (walletApi pending_promos); a HARD failure throws before the claim row is
  // written below, so a failed claim stays claimable instead of burning the
  // one-per-device gate with no money behind it.
  await addPromoCredit(FREE_PACK_VALUE, {
    ref_id: `free_pack_2day:${p}`,
    remark: `Free pack · ${FREE_PACK_DAYS} days of PYAAS Taaza 500 ml`,
  });
  // Record the claim (device-global) only now that the credit path succeeded.
  await insertRow<Claim>(CLAIMS_TABLE, DEVICE_OWNER, {
    phone: p, device_id: deviceId, claimed_at: new Date().toISOString(), user_id: uid,
  });
  // (b) Auto-start the daily subscription (first delivery tomorrow). Days 1–2
  // are covered by the promo credit; from day 3 the wallet pays and it keeps
  // running until paused/cancelled. Reuses an existing daily sub for the SKU
  // instead of doubling the member's milk — and REACTIVATES it (fresh start
  // date, deliveries from tomorrow) if it was paused, so "your subscription is
  // LIVE" is never reported over a sub that would deliver nothing.
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
  } catch { /* non-fatal — the promo credit stands; the member can subscribe manually */ }
  // (c) TEST-ONLY top-up (₹200) so the day-3 wallet charge demonstrably succeeds.
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
 * Show the popup while still eligible, unless it was permanently dismissed
 * (claimed, or "Maybe later" tapped MAX_SNOOZES times) or is currently snoozed
 * from a recent "Maybe later". This is why a "Maybe later" no longer loses the
 * free pack — it re-offers next session instead.
 */
export async function shouldShowFreePack(phone: string): Promise<boolean> {
  const seen = await getSingle<{ seen: boolean }>(SEEN_TABLE, DEVICE_OWNER);
  if (seen?.seen) return false;
  const snooze = await getSingle<Snooze>(SNOOZE_TABLE, DEVICE_OWNER);
  if (snooze?.snoozed_until && Date.now() < Date.parse(snooze.snoozed_until)) return false;
  const gate = await freePackEligible(phone);
  return gate.eligible;
}

/**
 * "Maybe later": snooze the offer instead of killing it. Re-offers after
 * SNOOZE_HOURS (next session), up to MAX_SNOOZES — after which it stops nagging.
 */
export async function snoozeFreePack(): Promise<void> {
  const prev = await getSingle<Snooze>(SNOOZE_TABLE, DEVICE_OWNER);
  const dismissals = (prev?.dismissals ?? 0) + 1;
  if (dismissals >= MAX_SNOOZES) {
    await markSeen();
    return;
  }
  await putSingle<Snooze>(SNOOZE_TABLE, DEVICE_OWNER, {
    dismissals,
    snoozed_until: new Date(Date.now() + SNOOZE_HOURS * 3600_000).toISOString(),
  });
}

/** Mark the popup as permanently dismissed (claimed / snooze cap reached). */
export async function markSeen(): Promise<void> {
  await putSingle<{ seen: boolean }>(SEEN_TABLE, DEVICE_OWNER, { seen: true });
}
