import * as SecureStore from 'expo-secure-store';
import { getRows, insertRow, getSingle, putSingle, newId } from './localStore';
import { requireUserId } from './session';
import { addPromoCredit } from './walletApi';

/**
 * "Free pack of milk on install" welcome offer, with anti-abuse safeguards.
 *
 * The reward is granted as a promotional wallet credit worth one 500 ml milk
 * pack (applied to the customer's first order). It can be claimed exactly ONCE,
 * gated on THREE layers so no one can reinstall their way to infinite free milk:
 *   1. Per PHONE  - `addPromoCredit` is idempotent on ref_id `free_pack:<phone>`,
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

export const FREE_PACK_VALUE = 29; // one 500 ml Parag Taaza pack
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

/** Claim the free pack for the signed-in phone. Idempotent + guarded. */
export async function claimFreePack(phone: string): Promise<{ ok: boolean; value: number; reason?: string }> {
  const uid = await requireUserId();
  const gate = await freePackEligible(phone);
  if (!gate.eligible) return { ok: false, value: 0, reason: gate.reason };
  const deviceId = await getDeviceId();
  const p = normPhone(phone);
  // Record the claim (device-global) before crediting.
  await insertRow<Claim>(CLAIMS_TABLE, DEVICE_OWNER, {
    phone: p, device_id: deviceId, claimed_at: new Date().toISOString(), user_id: uid,
  });
  // Grant the promo credit, idempotent on the phone so a race cannot double-credit.
  await addPromoCredit(FREE_PACK_VALUE, { ref_id: `free_pack:${p}`, remark: 'Free welcome milk pack' });
  await markSeen();
  return { ok: true, value: FREE_PACK_VALUE };
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
