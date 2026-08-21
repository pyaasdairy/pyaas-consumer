import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO, addDaysISO, todayISO } from './dates';
import { requireUserId } from './session';
import { getRows, setRows, insertRow, updateRows, deleteRows, newId } from './localStore';
import { hasExactLocation } from './location';
import { api, isBackendConfigured } from './apiClient';
import { getProduct } from '../constants/products';

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
  /** Server-side twin id ("sub_…") once mirrored to the backend. A mirrored
   *  subscription's daily order is created by the BACKEND worker (store manager
   *  sees it without this app opening); the on-device sweep skips it. */
  backend_id?: string | null;
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

/**
 * Pull server-CREATED subscriptions the local cache has never seen (today:
 * the CRM Welcome Litre campaign plan, minted by the backend at enrolment —
 * the first subscription in the product's life that this app did not create
 * itself). ADD-ONLY by design: rows the app already holds are never touched,
 * so no local pause/cancel state can be clobbered, and a backend outage
 * changes nothing (error-soft, next call retries). Runs where subscription
 * lists are actually read (home + status card), not on a timer.
 */
export async function syncServerSubscriptions(): Promise<void> {
  if (!isBackendConfigured()) return;
  let uid: string;
  try { uid = await requireUserId(); } catch { return; }
  try {
    const remote = await api.get<Record<string, unknown>[]>('/subscriptions');
    if (!Array.isArray(remote) || remote.length === 0) return;
    const rows = await getRows<Subscription>('subscriptions', uid);
    const known = new Set(rows.map((r) => r.backend_id ?? r.id));
    let added = false;
    for (const w of remote) {
      const sid = (w.id as string) || '';
      if (!sid || known.has(sid)) continue;
      rows.push({
        id: sid,
        product_id: (w.product_id as string) || '',
        variant: (w.variant as string) || null,
        qty: typeof w.qty === 'number' && w.qty >= 1 ? (w.qty as number) : 1,
        unit_price: typeof w.unit_price === 'number' ? (w.unit_price as number) : 0,
        frequency: ((w.frequency as string) || 'daily') as Frequency,
        delivery_slot: null,
        pay_from_wallet: true,
        status: ((w.status as string) || 'active') as Subscription['status'],
        start_date: (w.start_date as string) || todayISO(),
        next_delivery_date: (w.start_date as string) || null,
        created_at: (w.created_at as string) || new Date().toISOString(),
        backend_id: sid,
      });
      added = true;
    }
    if (added) await setRows<Subscription>('subscriptions', uid, rows);
  } catch { /* offline / old backend — the next read retries */ }
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
  // Best-effort backend mirror (fire-and-forget): the SERVER worker then owns
  // the daily morning order, so it reaches the store even if this app never
  // opens again. A failed mirror leaves the row local-only — the on-device
  // sweep still covers it.
  void mirrorSubscriptionCreate(uid, row);
  return id;
}

// ── Backend mirror (server-owned subscriptions, subscriptions.go) ────────────
// Local rows remain the UI's source of truth; the backend twin exists so the
// server's 15-minute worker turns due subscriptions into morning orders +
// store delivery tasks. Every mirror call is error-soft.

const MIRRORED_FREQUENCIES: Frequency[] = ['daily', 'alternate', 'weekly'];

const STATUS_ACTION: Record<Subscription['status'], 'resume' | 'pause' | 'cancel'> = {
  active: 'resume',
  paused: 'pause',
  cancelled: 'cancel',
};

async function mirrorSubscriptionCreate(uid: string, row: Subscription): Promise<void> {
  // one_time/custom are fulfilled on-device immediately — never mirrored.
  if (!isBackendConfigured() || !MIRRORED_FREQUENCIES.includes(row.frequency)) return;
  try {
    const product = getProduct(row.product_id);
    const created = await api.post<{ id: string }>('/subscriptions', {
      product_id: row.product_id,
      name: product?.name ?? row.product_id,
      variant: row.variant ?? product?.variant ?? '',
      qty: row.qty,
      unit_price: row.unit_price,
      frequency: row.frequency,
      delivery_slot: row.delivery_slot ?? '',
      start_date: row.start_date,
    });
    if (created?.id) {
      await updateRows<Subscription>('subscriptions', uid, (s) => s.id === row.id, { backend_id: created.id });
    }
  } catch {
    /* local-only; the on-device sweep covers it */
  }
}

/** The local row's backend twin id, if it was mirrored. */
async function backendIdOf(uid: string, id: string): Promise<string | null> {
  const rows = await getRows<Subscription>('subscriptions', uid);
  return rows.find((s) => s.id === id)?.backend_id ?? null;
}

/** Push the CURRENT vacation set onto every mirrored subscription (an
 *  account-wide vacation applies to all; a scoped one only to its own sub). */
async function mirrorVacations(uid: string): Promise<void> {
  if (!isBackendConfigured()) return;
  try {
    const [rows, vacations] = await Promise.all([
      getRows<Subscription>('subscriptions', uid),
      getRows<Vacation>('vacations', uid),
    ]);
    await Promise.all(
      rows
        .filter((s) => s.backend_id && s.status !== 'cancelled')
        .map((s) => {
          const ranges = vacations
            .filter((v) => v.subscription_id === null || v.subscription_id === s.id)
            .map((v) => ({ start: v.start_date, end: v.end_date }));
          return api.patch(`/subscriptions/${s.backend_id}`, { vacations: ranges }).catch(() => undefined);
        }),
    );
  } catch {
    /* error-soft */
  }
}

export async function setSubscriptionStatus(id: string, status: Subscription['status']): Promise<void> {
  const uid = await requireUserId();
  await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, { status });
  const bid = await backendIdOf(uid, id);
  if (bid && isBackendConfigured()) {
    void api.post(`/subscriptions/${bid}/${STATUS_ACTION[status]}`).catch(() => undefined);
  }
}

/** Edit a live subscription's plan (quantity / frequency / delivery slot). */
export async function updateSubscription(
  id: string,
  patch: Partial<Pick<Subscription, 'qty' | 'frequency' | 'delivery_slot'>>,
): Promise<void> {
  const uid = await requireUserId();
  await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, patch);
  const bid = await backendIdOf(uid, id);
  if (bid && isBackendConfigured()) {
    const body: Record<string, unknown> = {};
    if (patch.qty != null) body.qty = patch.qty;
    if (patch.delivery_slot !== undefined) body.delivery_slot = patch.delivery_slot ?? '';
    // The backend only runs the recurring cadences.
    if (patch.frequency && MIRRORED_FREQUENCIES.includes(patch.frequency)) body.frequency = patch.frequency;
    if (Object.keys(body).length > 0) {
      void api.patch(`/subscriptions/${bid}`, body).catch(() => undefined);
    }
  }
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
  const bid = await backendIdOf(uid, id);
  if (bid && isBackendConfigured()) {
    // Re-anchor the schedule server-side too, then resume.
    void api
      .patch(`/subscriptions/${bid}`, { start_date: startDate })
      .then(() => api.post(`/subscriptions/${bid}/resume`))
      .catch(() => undefined);
  }
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
  void mirrorVacations(uid); // the server worker must skip these days too
}

export async function deleteVacation(id: string): Promise<void> {
  const uid = await requireUserId();
  await deleteRows<Vacation>('vacations', uid, (v) => v.id === id);
  void mirrorVacations(uid);
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
