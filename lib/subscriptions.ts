import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO, addDaysISO, todayISO } from './dates';
import { requireUserId } from './session';
import { getRows, insertRow, updateRows, deleteRows, newId } from './localStore';
import { hasExactLocation } from './location';

/** Thrown by createSubscription when no exact delivery point is on file. */
export const NEEDS_EXACT_LOCATION = 'NEEDS_EXACT_LOCATION';

// Per-user so one account's auto-paused set never leaks into another account on
// the same device (and it is removed by deleteMyAccount, which prunes parag:*:<uid>).
function lowbalKey(uid: string): string {
  return `parag:lowbal:${uid}`;
}

export type Frequency = 'daily' | 'alternate' | 'weekly' | 'custom' | 'one_time';

export type Subscription = {
  id: string;
  product_id: string;
  variant: string | null;
  qty: number;
  unit_price: number;
  frequency: Frequency;
  delivery_slot: string | null;
  pay_from_wallet: boolean;
  status: 'active' | 'paused' | 'cancelled';
  start_date: string;
  next_delivery_date: string | null;
  created_at?: string;
};

export type Vacation = {
  id: string;
  subscription_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseISO(toIso).getTime() - parseISO(fromIso).getTime()) / 86400000);
}

/** Whether an active subscription actually delivers on a given ISO date, honouring
 *  its frequency. This is what powers the real per-day delivery counts (so the
 *  home strip never shows a fabricated lump sum of every subscription at once). */
export function subscriptionDeliversOn(sub: Subscription, iso: string): boolean {
  if (sub.status !== 'active') return false;
  const d = daysBetween(sub.start_date, iso);
  if (d < 0) return false; // before it starts
  switch (sub.frequency) {
    case 'daily': return true;
    case 'alternate': return d % 2 === 0;
    case 'weekly': return d % 7 === 0;
    case 'one_time': return d === 0;
    case 'custom': return true; // no custom calendar modelled yet; treat as daily
    default: return true;
  }
}

/** Real deliveries scheduled for a single day: the matching subscriptions and the
 *  total unit count (sum of their quantities). */
export function deliveriesForDay(subs: Subscription[], iso: string): { count: number; items: Subscription[] } {
  const items = subs.filter((s) => subscriptionDeliversOn(s, iso));
  return { count: items.reduce((n, s) => n + s.qty, 0), items };
}

/**
 * due(sub, date) per the Saathi delivery note (Appendix B): the cadence matches
 * AND the date is within [start, end] AND is not inside any pause range AND is
 * not skipped. Pauses and skips both come from the vacations list (a skip is a
 * one-day vacation, start == end). Dates are YYYY-MM-DD so string compare works.
 */
export function subscriptionDueOn(sub: Subscription, iso: string, vacations: Vacation[] = []): boolean {
  if (!subscriptionDeliversOn(sub, iso)) return false;
  return !vacations.some(
    (v) => (v.subscription_id === null || v.subscription_id === sub.id) && iso >= v.start_date && iso <= v.end_date,
  );
}

/**
 * Rolling delivery preview: the consumer-facing view of the demand model. The
 * next `days` days of scheduled deliveries, evaluated ON THE FLY from cadence +
 * pauses/skips (never a materialised list of future orders, per the note's
 * "do not materialise the future"). Days with no delivery are omitted.
 */
export function upcomingDeliveries(
  subs: Subscription[],
  vacations: Vacation[],
  fromISO: string,
  days: number,
): { date: string; count: number; items: Subscription[] }[] {
  const out: { date: string; count: number; items: Subscription[] }[] = [];
  for (let i = 0; i < days; i++) {
    const iso = addDaysISO(fromISO, i);
    const items = subs.filter((s) => subscriptionDueOn(s, iso, vacations));
    if (items.length) out.push({ date: iso, count: items.reduce((n, s) => n + s.qty, 0), items });
  }
  return out;
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const uid = await requireUserId();
  const rows = await getRows<Subscription>('subscriptions', uid);
  return rows
    .filter((s) => s.status !== 'cancelled')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export async function createSubscription(params: {
  productId: string;
  variant: string;
  qty: number;
  unitPrice: number;
  frequency: Frequency;
  deliverySlot?: string;
  payFromWallet?: boolean;
  /** ISO date (YYYY-MM-DD) the first delivery should land on. Defaults to today. */
  startDate?: string;
}): Promise<string> {
  const uid = await requireUserId();
  // HARD BACKSTOP: a subscription may never be created without an EXACT delivery
  // point (map pin / GPS / an address with coordinates). Every subscribe path
  // must capture the location first, so the rider always has a real door.
  if (!(await hasExactLocation())) {
    const e = new Error(NEEDS_EXACT_LOCATION) as Error & { code?: string };
    e.code = NEEDS_EXACT_LOCATION;
    throw e;
  }
  // LOCAL calendar date (lib/dates), never toISOString(): UTC would be
  // yesterday between local midnight and 05:30 IST and phase-shift the cadence.
  const start = params.startDate ?? todayISO();
  const id = newId('sub');
  const row: Subscription = {
    id,
    product_id: params.productId,
    variant: params.variant,
    qty: params.qty,
    unit_price: params.unitPrice,
    frequency: params.frequency,
    delivery_slot: params.deliverySlot ?? null,
    pay_from_wallet: params.payFromWallet ?? true,
    status: 'active',
    start_date: start,
    next_delivery_date: start,
    created_at: new Date().toISOString(),
  };
  await insertRow<Subscription>('subscriptions', uid, row);
  return id;
}

export async function setSubscriptionStatus(id: string, status: Subscription['status']): Promise<void> {
  const uid = await requireUserId();
  await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, { status });
}

/**
 * Reactivate a paused subscription with a fresh schedule anchor: back to
 * 'active' AND start/next-delivery reset to `startDate` (deliveries resume
 * from that day, cadence re-anchored — not back-dated to the old start).
 */
export async function reactivateSubscription(id: string, startDate: string): Promise<void> {
  const uid = await requireUserId();
  await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, {
    status: 'active',
    start_date: startDate,
    next_delivery_date: startDate,
  });
}

export async function listVacations(): Promise<Vacation[]> {
  const uid = await requireUserId();
  const rows = await getRows<Vacation>('vacations', uid);
  return rows.sort((a, b) => b.start_date.localeCompare(a.start_date));
}

export async function addVacation(params: { startDate: string; endDate: string; subscriptionId?: string; reason?: string }): Promise<void> {
  const uid = await requireUserId();
  await insertRow<Vacation>('vacations', uid, {
    id: newId('vac'),
    subscription_id: params.subscriptionId ?? null,
    start_date: params.startDate,
    end_date: params.endDate,
    reason: params.reason ?? null,
  });
}

export async function deleteVacation(id: string): Promise<void> {
  const uid = await requireUserId();
  await deleteRows<Vacation>('vacations', uid, (v) => v.id === id);
}

// ── Wallet gating ────────────────────────────────────────────────────────────
// Deliveries can be paid from the prepaid PYAAS wallet, so the app enforces two
// rules: you cannot start a subscription the wallet cannot cover, and an active
// subscription auto-pauses when the wallet can no longer fund it.

/** What one delivery of a subscription costs (qty × unit price). */
export function perDeliveryCost(s: Pick<Subscription, 'unit_price' | 'qty'>): number {
  return s.unit_price * s.qty;
}

/**
 * PREPAID START GATE — a subscription may never begin unless the wallet already
 * holds at least this many days of its per-delivery charge. Applies in BOTH
 * local and backend modes: no funds, no subscription.
 */
export const MIN_SUB_DAYS_COVER = 2;

/** Minimum wallet balance required to START a subscription of `perDelivery` rupees. */
export function minWalletToStart(perDelivery: number): number {
  return Math.ceil(perDelivery) * MIN_SUB_DAYS_COVER;
}

/** Whether the wallet can fund an order/first delivery of `amount` rupees. */
export function canAfford(balance: number, amount: number): boolean {
  return balance >= amount;
}

/**
 * Keep subscriptions in sync with the wallet balance: pause an active one the
 * wallet can no longer fund, and resume one WE auto-paused once it can be funded
 * again. User-paused subscriptions are never touched.
 */
export async function reconcileWithBalance(balance: number): Promise<{ lowBalance: boolean; changed: boolean }> {
  const uid = await requireUserId();
  const key = lowbalKey(uid);
  const subs = await listSubscriptions();
  let autoPaused: string[] = [];
  try { autoPaused = JSON.parse((await AsyncStorage.getItem(key)) || '[]'); } catch { /* ignore */ }
  const set = new Set<string>(autoPaused);
  let changed = false;
  for (const s of subs) {
    const cost = perDeliveryCost(s);
    if (s.status === 'active' && balance < cost) {
      try { await setSubscriptionStatus(s.id, 'paused'); set.add(s.id); changed = true; } catch { /* ignore */ }
    } else if (s.status === 'paused' && set.has(s.id) && balance >= cost) {
      try { await setSubscriptionStatus(s.id, 'active'); set.delete(s.id); changed = true; } catch { /* ignore */ }
    } else if (s.status === 'active' && set.has(s.id)) {
      set.delete(s.id); // funded + active again → clear a stale flag
    }
  }
  await AsyncStorage.setItem(key, JSON.stringify([...set]));
  return { lowBalance: set.size > 0, changed };
}
