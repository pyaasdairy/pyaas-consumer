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

/**
 * Illustrative PYAAS Plus member price on milk, shown on the Plus comparison.
 * The real, permanent Plus value is service (free delivery + priority slots);
 * this modest member price makes the "VIP vs regular" comparison concrete.
 */
export const VIP_MILK_DISCOUNT_PCT = 10;

/** The Plus member price for a regular rupee price (rounded to the nearest ₹). */
export function vipPriceFor(regular: number): number {
  return Math.round(regular * (1 - VIP_MILK_DISCOUNT_PCT / 100));
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
 * Start (or restart) the user's free Plus trial. Writes a real membership row so
 * the card activates immediately and Plus perks apply across the app. Restarting
 * after an expired/cancelled membership keeps the original join date.
 */
export async function startTrial(): Promise<VipMembership> {
  const uid = await requireUserId();
  const now = new Date();
  const end = new Date(now.getTime() + PLUS_TRIAL_DAYS * 86400000);
  const existing = await getSingle<VipMembership>('vip', uid);
  const m: VipMembership = {
    status: 'trial',
    trial_started_at: now.toISOString(),
    current_period_end: end.toISOString(),
    plan: 'monthly',
    started_at: existing?.started_at ?? now.toISOString(),
  };
  // TODO(api): POST /membership/trial when the backend is live.
  await putSingle<VipMembership>('vip', uid, m);
  return m;
}

/**
 * Buy a paid month of PYAAS Plus by deducting ₹99 from the wallet (WALLET-FIRST,
 * same deduct path as an order). Fails closed with InsufficientWalletError
 * (carrying the shortfall) when the wallet is short, so the caller can nudge a
 * recharge. On success the membership goes ACTIVE for PLUS_PERIOD_DAYS.
 */
export async function purchaseMembership(): Promise<VipMembership> {
  const uid = await requireUserId();
  const { available } = await getBalances();
  if (available < PLUS_PRICE_MONTH) {
    throw new InsufficientWalletError(PLUS_PRICE_MONTH - available);
  }
  const now = new Date();
  const end = new Date(now.getTime() + PLUS_PERIOD_DAYS * 86400000);
  const existing = await getSingle<VipMembership>('vip', uid);
  // Deduct the membership fee from the wallet. The ref+remark form a stable
  // idempotency key (one charge per member per calendar day) so a double-tap
  // can't charge twice.
  await debitWallet(PLUS_PRICE_MONTH, 'payment', `PYAAS Plus ${now.toISOString().slice(0, 10)}`);
  const m: VipMembership = {
    status: 'active',
    trial_started_at: existing?.trial_started_at ?? null,
    current_period_end: end.toISOString(),
    plan: 'monthly',
    started_at: existing?.started_at ?? now.toISOString(),
  };
  // TODO(api): POST /membership/purchase when the backend is live.
  await putSingle<VipMembership>('vip', uid, m);
  return m;
}

/** Cancel Plus (keeps access until the current period ends). */
export async function cancelVip(): Promise<VipMembership | null> {
  const uid = await requireUserId();
  const existing = await getSingle<VipMembership>('vip', uid);
  if (!existing) return null;
  const m: VipMembership = { ...existing, status: 'cancelled' };
  // TODO(api): POST /membership/cancel when the backend is live.
  await putSingle<VipMembership>('vip', uid, m);
  return m;
}

/** Whether the membership currently entitles the user to Plus perks. */
export function vipActive(m: VipMembership | null): boolean {
  if (!m) return false;
  if (m.status === 'expired') return false;
  if (!m.current_period_end) return m.status === 'active';
  // A cancelled membership still runs to the end of its paid/trial period.
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
