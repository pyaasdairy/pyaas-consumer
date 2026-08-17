/**
 * PYAAS Plus - the app's loyalty membership. This is NOT a per-SKU discount tier
 * (paragdairy.com shows MRP == offer price on every product, so there are never
 * member prices or "X% off"). Plus is a paid membership whose value is service:
 * priority delivery slots, free delivery, member-only offers and early access,
 * plus priority support. Membership state is stored per-user in localStore
 * (table 'vip') so it works fully offline for the demo; when the NestJS backend
 * is live, swap the local reads/writes for the apiClient seam noted below.
 */
import { getUserId, requireUserId } from './session';
import { getSingle, putSingle } from './localStore';
import { getBalances, debitWallet } from './walletApi';

/** Days of Plus one ₹99 charge buys. */
export const PLUS_PERIOD_DAYS = 30;

/** Thrown by purchaseMembership when the wallet can't cover the ₹99 charge. */
export class InsufficientWalletError extends Error {
  shortfall: number;
  constructor(shortfall: number) {
    super('Wallet balance is too low to join PYAAS Plus.');
    this.name = 'InsufficientWalletError';
    this.shortfall = shortfall;
  }
}

/** Free trial length before the first charge. Honest launch offer, no gimmick. */
export const PLUS_TRIAL_DAYS = 30;
/** Monthly membership price in rupees (billing not wired in the demo build). */
export const PLUS_PRICE_MONTH = 99;
/** Nudge the member to top up so Plus renews when this many days (or fewer) remain. */
export const VIP_EXPIRY_WARN_DAYS = 5;

/**
 * The PYAAS Plus member price on milk.
 *
 * This was labelled "Illustrative" and had exactly three references in the repo:
 * its own definition, an import, and the marketing screen that rendered it as a
 * struck-through "Regular" beside a gold "PLUS ₹X" with a "₹Y saved / month"
 * figure. No cart, checkout, product or sweep path ever called it, so a member
 * paid ₹99 for a discount that did not exist. It is now applied for real, in
 * placeOrder, which is the single place money is computed.
 */
export const VIP_MILK_DISCOUNT_PCT = 10;

/** The Plus member price for a regular rupee price (rounded to the nearest ₹). */
export function vipPriceFor(regular: number): number {
  return Math.round(regular * (1 - VIP_MILK_DISCOUNT_PCT / 100));
}

/**
 * The price a given SKU actually bills at for this member.
 *
 * The member price applies to MILK only, which is what the Plus screen claims
 * ("Plus members pay member price on milk"). Everything else bills at the
 * regular price, so the discount can never silently widen to the whole catalog.
 */
export function memberLinePrice(category: string | undefined, regular: number, isPlus: boolean): number {
  if (!isPlus) return regular;
  const milkish = category === 'milk' || category === 'super_tea';
  return milkish ? vipPriceFor(regular) : regular;
}

export type VipStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export type VipMembership = {
  status: VipStatus;
  /** When the free trial began (null once on a paid period). */
  trial_started_at: string | null;
  /** End of the current trial or paid period; drives active + days-left. */
  current_period_end: string | null;
  /** Monthly plan for now; yearly can be added when billing is live. */
  plan: 'monthly';
  /** First time the user ever joined Plus (for "member since"). */
  started_at: string | null;
};

/** The signed-in user's membership, or null if they have never joined. */
export async function getVip(): Promise<VipMembership | null> {
  const uid = await getUserId();
  if (!uid) return null;
  // TODO(api): GET /membership/me when EXPO_PUBLIC_API_URL is set.
  return getSingle<VipMembership>('vip', uid);
}

/**
 * Is the signed-in member entitled to Plus perks right now?
 *
 * The one-call form of `vipActive(await getVip())`, for the pricing paths that
 * need the flag but do not otherwise hold membership state. Plus is SOLD on
 * "No delivery fee on any order, however small" and debits 99 rupees for it, so
 * every place that computes a delivery fee has to consult this — otherwise we
 * are charging for a perk the binary never delivers.
 */
export async function isPlusActive(): Promise<boolean> {
  try {
    return vipActive(await getVip());
  } catch {
    return false; // never fail a checkout over a membership read
  }
}

// NOTE: the free Plus trial was REMOVED (paid-only, founder's call 18 Aug).
// startTrial / the trial modal are gone; `vipOnTrial` remains only to render
// legacy rows that still carry status 'trial' until they lapse.

/**
 * Buy a paid month of PYAAS Plus by deducting ₹99 from the wallet (WALLET-FIRST,
 * same deduct path as an order). Fails closed with InsufficientWalletError
 * (carrying the shortfall) when the wallet is short, so the caller can nudge a
 * recharge. On success the membership goes ACTIVE for PLUS_PERIOD_DAYS.
 */
export async function purchaseMembership(): Promise<VipMembership & { charged: boolean }> {
  const uid = await requireUserId();
  const before = (await getBalances()).available;
  if (before < PLUS_PRICE_MONTH) {
    throw new InsufficientWalletError(PLUS_PRICE_MONTH - before);
  }
  const now = new Date();
  const existing = await getSingle<VipMembership>('vip', uid);
  // Deduct the membership fee. The ref+remark form a stable idempotency key (one
  // charge per member per calendar day) so a double-tap can't charge twice.
  await debitWallet(PLUS_PRICE_MONTH, 'payment', `PYAAS Plus ${now.toISOString().slice(0, 10)}`);
  const after = (await getBalances()).available;
  const charged = before - after >= PLUS_PRICE_MONTH - 0.5;
  // Idempotent replay: a debit for TODAY already exists, so no new money moved.
  // Two very different cases share this branch:
  //   • the membership that debit bought is STILL RUNNING → do NOT extend
  //     again (a re-tap must not grant free months); hand back the live row.
  //   • the member cancelled it (period already over — cancel is immediate)
  //     and is REJOINING the same day → they paid today and hold nothing.
  //     Returning the dead row here showed "already a member" while perks
  //     stayed off, and the day's ₹99 bought nothing. Fall through and write
  //     a fresh active month against today's existing debit.
  const stillRunning = !!existing?.current_period_end && Date.parse(existing.current_period_end) > now.getTime() && existing.status !== 'expired' && existing.status !== 'cancelled';
  if (!charged && existing && stillRunning) {
    return { ...existing, charged: false };
  }
  // EXTEND from the later of now / the current period end (an early renew ADDS a
  // month instead of discarding remaining paid days); a lapsed member starts fresh.
  const stillActive = !!existing?.current_period_end && Date.parse(existing.current_period_end) > now.getTime() && existing.status !== 'expired';
  const base = stillActive ? new Date(existing!.current_period_end!) : now;
  const end = new Date(base.getTime() + PLUS_PERIOD_DAYS * 86400000);
  const m: VipMembership = {
    status: 'active',
    trial_started_at: existing?.trial_started_at ?? null,
    current_period_end: end.toISOString(),
    plan: 'monthly',
    started_at: existing?.started_at ?? now.toISOString(),
  };
  // TODO(api): POST /membership/purchase when the backend is live.
  await putSingle<VipMembership>('vip', uid, m);
  return { ...m, charged: true };
}

/** Cancel Plus (keeps access until the current period ends). */
export async function cancelVip(): Promise<VipMembership | null> {
  const uid = await requireUserId();
  const existing = await getSingle<VipMembership>('vip', uid);
  if (!existing) return null;
  // CANCEL MEANS CANCEL (founder's call, 18 Aug): perks end immediately, not
  // at period end — a member who cancels must never still read as a member.
  // The confirm dialog states plainly that unused days are not refunded.
  const m: VipMembership = { ...existing, status: 'cancelled', current_period_end: new Date().toISOString() };
  // TODO(api): POST /membership/cancel when the backend is live.
  await putSingle<VipMembership>('vip', uid, m);
  return m;
}

/** Whether the membership currently entitles the user to Plus perks. */
export function vipActive(m: VipMembership | null): boolean {
  if (!m) return false;
  if (m.status === 'expired') return false;
  if (!m.current_period_end) return m.status === 'active';
  // Cancel is IMMEDIATE (cancelVip stamps period_end = now), so a cancelled
  // row reads inactive the moment it's written; the time check remains for
  // active/legacy-trial rows.
  return new Date(m.current_period_end).getTime() > Date.now();
}

/** Whole days left in the current trial or paid period (0 once expired). */
export function vipDaysLeft(m: VipMembership | null): number {
  if (!m?.current_period_end) return 0;
  const ms = new Date(m.current_period_end).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/** True while the user is inside the free trial window. */
export function vipOnTrial(m: VipMembership | null): boolean {
  return !!m && m.status === 'trial' && vipActive(m);
}

// ── Become-VIP upsell restraint ──────────────────────────────────────────────
// The soft "Become Plus" upsell targets happy, well-funded subscribers. Without a
// cap it would pop on EVERY Home visit — annoying the best cohort. So it snoozes
// for a few days on dismiss, per-user (uid), and re-arms only after that.
const VIP_UPSELL_SNOOZE_DAYS = 3;
const VIP_UPSELL_TABLE = 'vip_upsell_snooze';

/** True if the become-VIP upsell was dismissed within the snooze window. */
export async function vipUpsellSnoozed(): Promise<boolean> {
  const uid = await requireUserId().catch(() => null);
  if (!uid) return true; // signed out → never nag
  const row = await getSingle<{ until: string }>(VIP_UPSELL_TABLE, uid).catch(() => null);
  return !!row?.until && Date.now() < Date.parse(row.until);
}

/** Snooze the become-VIP upsell for VIP_UPSELL_SNOOZE_DAYS. */
export async function snoozeVipUpsell(): Promise<void> {
  const uid = await requireUserId().catch(() => null);
  if (!uid) return;
  await putSingle(VIP_UPSELL_TABLE, uid, {
    until: new Date(Date.now() + VIP_UPSELL_SNOOZE_DAYS * 86400000).toISOString(),
  });
}
