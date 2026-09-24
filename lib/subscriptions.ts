import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO, addDaysISO, todayISO } from './dates';
import { requireUserId } from './session';
import { getRows, insertRow, updateRows, deleteRows, dropTable, newId } from './localStore';
import { hasExactLocation } from './location';
import { api, isBackendConfigured, HttpError } from './apiClient';
import { registerMirrorHandler, enqueueMirror, mirrorOutcomeFor, type MirrorOutcome } from './mirrorQueue';
import { getProduct } from '../constants/products';

/** Thrown by createSubscription when no exact delivery point is on file. */
export const NEEDS_EXACT_LOCATION = 'NEEDS_EXACT_LOCATION';

// LOCAL MODE: the set of plans this phone auto-paused for low balance (local
// ids). Per-user so one account's set never leaks into another account on the
// same device (and it is removed by deleteMyAccount, which prunes
// parag:*:<uid>). In backend mode the server owns low balance and this app
// never pauses for it; the key there is what the SHIPPED build (26.07.03)
// left behind, and carryShippedAutoPauses moves it to the key below.
function lowbalKey(uid: string): string {
  return `parag:lowbal:${uid}`;
}

// BACKEND MODE: the server ids of the plans the shipped build paused for low
// balance, still waiting for the wallet to cover one delivery
// (resumeCarriedPlans). Empty once every one is resumed or taken over.
function carriedLowbalKey(uid: string): string {
  return `parag:lowbal_carried:${uid}`;
}

/** A stored JSON list of ids; [] when absent or unreadable. A storage
 *  failure throws, so a caller never mistakes it for an empty set. */
async function readIdList(key: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  } catch {
    return [];
  }
}

async function writeIdList(key: string, ids: string[]): Promise<void> {
  if (ids.length) await AsyncStorage.setItem(key, JSON.stringify(ids));
  else await AsyncStorage.removeItem(key);
}

/**
 * THE UPGRADE FROM THE SHIPPED BUILD (founder rule R3, option A). The build
 * in members' hands (release/26.07.03) paused a plan through the same POST
 * /subscriptions/{id}/pause a member's pause sends, whenever the wallet could
 * not fund one delivery, and resumed it itself once the wallet could. It kept
 * the LOCAL ids of those plans in parag:lowbal:<uid>, and its local
 * 'subscriptions' rows map each local id to the server's (backend_id). The
 * server cannot tell such a pause from the member's own, and this build drops
 * those rows on its first read (fetchSubscriptions), so without this the
 * plans stayed paused for good. Before the rows go, the set is carried over
 * as server ids; resumeCarriedPlans resumes each one once the wallet covers
 * it. A plan the member paused is not in the set and is never touched.
 *
 * A create the shipped build paused while it was still in the outbox (never
 * on the server) has no server pause to undo: it loses the pause here and
 * goes up active, and the server's noon lock skips a day the wallet cannot
 * cover. Throws on a storage failure, so the caller keeps the old rows and
 * the next read tries again.
 */
async function carryShippedAutoPauses(uid: string): Promise<void> {
  const legacy = lowbalKey(uid);
  if ((await AsyncStorage.getItem(legacy)) == null) return;
  const ids = await readIdList(legacy);
  const rows = await getRows<Subscription>('subscriptions', uid);
  const carried = await readIdList(carriedLowbalKey(uid));
  for (const id of ids) {
    const row = rows.find((s) => s.id === id);
    if (!row) continue;
    if (row.backend_id) {
      if (!carried.includes(row.backend_id)) carried.push(row.backend_id);
    } else if (row.status === 'paused') {
      await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, { status: 'active' });
    }
  }
  await writeIdList(carriedLowbalKey(uid), carried);
  await AsyncStorage.removeItem(legacy);
}

/** Whether the shipped build paused this outbox row for low balance (its set
 *  not carried yet): its create must not carry that pause to the server. */
async function shippedAutoPaused(uid: string, localId: string): Promise<boolean> {
  try {
    return (await readIdList(lowbalKey(uid))).includes(localId);
  } catch {
    return false;
  }
}

/** The member changed this plan's status themselves: whatever the shipped
 *  build did to it before, it is theirs now and is never auto-resumed. */
async function forgetCarried(uid: string, id: string): Promise<void> {
  try {
    const carried = await readIdList(carriedLowbalKey(uid));
    if (carried.includes(id)) await writeIdList(carriedLowbalKey(uid), carried.filter((x) => x !== id));
  } catch { /* the next reconcile reads the plan's status anyway */ }
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
  /** True when next_delivery_date is the server's own answer (GET
   *  /subscriptions derives it on every read, noon lock included); false or
   *  absent when it is the start_date stand-in (an older backend, or a row
   *  that is not on the server yet). */
  next_delivery_from_server?: boolean;
  created_at?: string;
  /** Server-side twin id ("sub_…") once mirrored to the backend. A mirrored
   *  subscription's daily order is created by the BACKEND worker (store manager
   *  sees it without this app opening); the on-device sweep skips it. */
  backend_id?: string | null;
  /** Backend mode only: the holiday ranges the server holds on this row
   *  (listVacations reads them). Absent on local rows. */
  vacations?: VacationRange[];
};

export type VacationRange = { start: string; end: string };

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

/** Whether the server named `iso` as this plan's next delivery. The server
 *  names a morning already locked at 12 noon the day before even for a plan
 *  paused, or put on holiday, after the lock: that morning is still delivered
 *  and billed. */
function serverNamesDay(sub: Subscription, iso: string): boolean {
  return !!sub.backend_id && sub.next_delivery_from_server === true && sub.next_delivery_date === iso;
}

/** Whether an active subscription actually delivers on a given ISO date, honouring
 *  its frequency. This is what powers the real per-day delivery counts (so the
 *  home strip never shows a fabricated lump sum of every subscription at once).
 *  A paused plan delivers only the locked morning the server names for it. */
export function subscriptionDeliversOn(sub: Subscription, iso: string): boolean {
  if (serverNamesDay(sub, iso)) return true;
  if (sub.status !== 'active') return false;
  const d = daysBetween(sub.start_date, iso);
  if (d < 0) return false; // before it starts
  // A server plan's first real morning is the server's next_delivery_date,
  // which honours the 12-noon cut-off: a plan created, changed or resumed
  // after noon skips tomorrow, and a day the member cancelled is skipped
  // although no vacation names it. No day between today and it delivers.
  // Today is left to the cadence (once the morning route has run, the
  // server already names a later day).
  if (sub.backend_id && sub.next_delivery_date && iso > todayISO() && iso < sub.next_delivery_date) return false;
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
 * The morning the server names is due whatever a holiday set after its noon
 * lock says: the server delivers it.
 */
export function subscriptionDueOn(sub: Subscription, iso: string, vacations: Vacation[] = []): boolean {
  if (serverNamesDay(sub, iso)) return true;
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

// -- Backend mode: the server's subscriptions ---------------------------------
// GET /subscriptions is the member's plan list (the app's own plans and the
// ones the server minted, such as the Welcome Litre campaign plan). It is
// held in this in-memory copy for the session (keyed by uid), refetched when
// a screen asks for a fresh read (home focus, the status card) and dropped on
// every mutation. It is never written to the device. The local
// 'subscriptions' table exists in backend mode ONLY as the offline OUTBOX: a
// create that could not reach the server (backend_id null) is shown as
// pending and replayed by the 'sub-create' handler, which deletes it once the
// server has it. Vacations are the ranges on the server's rows; the local
// 'vacations' table is local mode's only. Local mode keeps both tables as
// the plan list, as before.
let subsCache: { uid: string; rows: Subscription[] } | null = null;
// Bumped by every invalidation. A fetch that began before the bump returns
// its rows to its caller but does not keep them: a mutation landed while the
// GET was in flight, so what it read is already stale.
let subsGen = 0;

export function invalidateSubscriptionCache(): void {
  subsCache = null;
  subsGen += 1;
}

/** One plan as GET /subscriptions returns it. INVARIANT (G1, see
 *  lib/subscriptionSweep.ts): backend_id is the server's id on EVERY row, so
 *  the phone-side sweep never orders a plan the server worker ships. */
export function subscriptionFromRemote(w: Record<string, unknown>): Subscription | null {
  const sid = typeof w.id === 'string' ? w.id : '';
  if (!sid) return null;
  const ranges = Array.isArray(w.vacations) ? (w.vacations as { start?: unknown; end?: unknown }[]) : [];
  const named = typeof w.next_delivery_date === 'string' ? w.next_delivery_date : '';
  return {
    id: sid,
    product_id: (w.product_id as string) || '',
    variant: (w.variant as string) || null,
    qty: typeof w.qty === 'number' && w.qty >= 1 ? (w.qty as number) : 1,
    unit_price: typeof w.unit_price === 'number' ? (w.unit_price as number) : 0,
    frequency: ((w.frequency as string) || 'daily') as Frequency,
    delivery_slot: (w.delivery_slot as string) || null,
    pay_from_wallet: true,
    status: ((w.status as string) || 'active') as Subscription['status'],
    start_date: (w.start_date as string) || todayISO(),
    // The server's own answer when it sends one (the merged backend derives
    // it on every read); an older backend sends none, and start_date stands.
    // A plan with no day in the next three weeks (paused before the lock, a
    // long holiday) gets none either.
    next_delivery_date: named || (w.start_date as string) || null,
    next_delivery_from_server: named !== '',
    created_at: (w.created_at as string) || new Date().toISOString(),
    backend_id: sid,
    vacations: ranges
      .filter((r): r is { start: string; end: string } => typeof r.start === 'string' && typeof r.end === 'string')
      .map((r) => ({ start: r.start, end: r.end })),
  };
}

async function fetchSubscriptions(uid: string): Promise<Subscription[]> {
  const gen = subsGen;
  const remote = await api.get<Record<string, unknown>[]>('/subscriptions');
  const rows = (Array.isArray(remote) ? remote : [])
    .map(subscriptionFromRemote)
    .filter((s): s is Subscription => s !== null);
  if (gen === subsGen) subsCache = { uid, rows };
  // Rows an older build kept as mirrors of server rows (backend_id set) and
  // its local vacations are stale copies of what was just fetched; drop them.
  // The outbox (rows without backend_id) stays. The shipped build's
  // low-balance set is read through those rows, so it is carried first, and
  // the rows stay until it has been.
  const carried = await carryShippedAutoPauses(uid).then(() => true, () => false);
  if (carried) await deleteRows<Subscription>('subscriptions', uid, (s) => !!s.backend_id).catch(() => undefined);
  await dropTable('vacations', uid).catch(() => undefined);
  return rows;
}

/** The outbox: local rows the server does not have yet (backend_id null). */
async function subscriptionOutbox(uid: string): Promise<Subscription[]> {
  const rows = await getRows<Subscription>('subscriptions', uid).catch(() => [] as Subscription[]);
  return rows.filter((s) => !s.backend_id);
}

/**
 * The member's plans, cancelled ones excluded. Backend mode: the session's
 * copy of GET /subscriptions (fetched on the first read, or again when the
 * caller asks for `refresh`) plus any create still in the outbox. A failed
 * read keeps the last server answer this session; before any, it throws, so
 * no screen can mistake "unknown" for "no subscription".
 */
export async function listSubscriptions(opts?: { refresh?: boolean }): Promise<Subscription[]> {
  const uid = await requireUserId();
  let rows: Subscription[];
  if (!isBackendConfigured()) {
    rows = await getRows<Subscription>('subscriptions', uid);
  } else {
    let server: Subscription[];
    if (subsCache?.uid === uid && !opts?.refresh) {
      server = subsCache.rows;
    } else {
      try {
        server = await fetchSubscriptions(uid);
      } catch (e) {
        if (subsCache?.uid !== uid) throw e;
        server = subsCache.rows;
      }
    }
    rows = [...server, ...(await subscriptionOutbox(uid))];
  }
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
  if (!(await hasExactLocation())) throw needsExactLocation();
  // ONE LIVE SUBSCRIPTION PER PRODUCT (21 Sep): the server creates a daily
  // order for EVERY active subscription and never checks for an existing one,
  // so a second "Subscribe" on the same milk silently doubled the member's
  // daily order and charge while the app still looked like one plan. Change
  // the existing plan instead (qty, days, pause) in My subscriptions.
  // The plans checked are the ones listSubscriptions shows: in backend mode
  // the session's copy of the server's rows plus the outbox, never a local
  // table on its own. A list that cannot be read yet does not block the
  // subscribe; the server's own DUPLICATE_SUBSCRIPTION answer below does.
  const existing = await listSubscriptions().catch(() => [] as Subscription[]);
  if (existing.some((s) => s.product_id === params.productId && (s.status === 'active' || s.status === 'paused'))) {
    throw duplicateSubscription();
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
  if (!isBackendConfigured()) {
    await insertRow<Subscription>('subscriptions', uid, row);
    return id;
  }
  // POST /subscriptions FIRST: the SERVER worker owns the daily morning
  // order, and the server's row is the plan. Only when the request cannot
  // reach the server does anything land on the device: the row goes to the
  // outbox, shows as pending, and the 'sub-create' handler replays it until
  // the twin exists (a fire-and-forget here once meant a customer whose milk
  // only shipped on days they happened to open the app). A permanent
  // rejection is surfaced, not queued; the server's ADDRESS_REQUIRED is the
  // same gate as the backstop above, so it opens the same map.
  const standing = (await listVacations().catch(() => [] as Vacation[])).filter((v) => v.subscription_id === null);
  let created: Record<string, unknown>;
  try {
    created = await api.post<Record<string, unknown>>('/subscriptions', subscriptionWire(row, standing));
  } catch (e) {
    if (e instanceof HttpError && e.code === 'ADDRESS_REQUIRED') throw needsExactLocation();
    // The server's one-live-plan-per-product answer (409) is the same error
    // as the check above, so the screen shows the same line.
    if (e instanceof HttpError && e.code === DUPLICATE_SUBSCRIPTION) throw duplicateSubscription();
    if (mirrorOutcomeFor(e) === 'drop') throw e;
    await insertRow<Subscription>('subscriptions', uid, row);
    await enqueueMirror('sub-create', id);
    return id;
  }
  invalidateSubscriptionCache();
  return (created && typeof created.id === 'string' && created.id) || id;
}

function needsExactLocation(): Error {
  const e = new Error(NEEDS_EXACT_LOCATION) as Error & { code?: string };
  e.code = NEEDS_EXACT_LOCATION;
  return e;
}

/** Thrown by createSubscription for a product that already has a live plan
 *  (the app's check and the server's 409 alike). The message is the screen's
 *  copy. */
export const DUPLICATE_SUBSCRIPTION = 'DUPLICATE_SUBSCRIPTION';
function duplicateSubscription(): Error {
  const e = new Error('You already have a subscription for this milk. Change its quantity or days in My subscriptions.') as Error & { code?: string };
  e.code = DUPLICATE_SUBSCRIPTION;
  return e;
}

/** The request body POST /subscriptions reads (the field names the backend
 *  expects). `vacations` are the standing holiday ranges that ride along at
 *  birth: a twin created mid-vacation must not bill the days the app shows
 *  skipped. */
export function subscriptionWire(row: Subscription, vacations: Vacation[]): Record<string, unknown> {
  const product = getProduct(row.product_id);
  return {
    product_id: row.product_id,
    name: product?.name ?? row.product_id,
    variant: row.variant ?? product?.variant ?? '',
    qty: row.qty,
    unit_price: row.unit_price,
    frequency: row.frequency,
    delivery_slot: row.delivery_slot ?? '',
    start_date: row.start_date,
    vacations: vacations.map((v) => ({ start: v.start_date, end: v.end_date })),
  };
}

// -- Backend calls (server-owned subscriptions, subscriptions.go) -------------
// The server's 15-minute worker turns due subscriptions into morning orders +
// store delivery tasks, so every change below reaches it directly and throws
// when it cannot, for the screen to say so; only the create has an outbox.

const STATUS_ACTION: Record<Subscription['status'], 'resume' | 'pause' | 'cancel'> = {
  active: 'resume',
  paused: 'pause',
  cancelled: 'cancel',
};

// -- Mirror-queue handlers ----------------------------------------------------

async function currentRow(id: string): Promise<{ uid: string; row: Subscription | null }> {
  const uid = await requireUserId();
  const rows = await getRows<Subscription>('subscriptions', uid);
  return { uid, row: rows.find((s) => s.id === id) ?? null };
}

// The outbox replay: the queued create reaches POST /subscriptions and the row
// is deleted (the server has it now); a row with backend_id is an older
// build's mirror, not an intent.
registerMirrorHandler('sub-create', async (localId): Promise<MirrorOutcome> => {
  const { uid, row } = await currentRow(localId);
  if (!row || row.backend_id) return 'done';
  // Read before listVacations: its read carries the shipped build's set over
  // (carryShippedAutoPauses) and removes the key this looks in.
  const autoPaused = row.status === 'paused' && (await shippedAutoPaused(uid, localId));
  const standing = (await listVacations().catch(() => [] as Vacation[])).filter((v) => v.subscription_id === null);
  let created: Record<string, unknown>;
  try {
    created = await api.post<Record<string, unknown>>('/subscriptions', subscriptionWire(row, standing));
  } catch (e) {
    const outcome = mirrorOutcomeFor(e);
    // A permanent rejection must not leave the plan shown as pending forever.
    if (outcome === 'drop') await deleteRows<Subscription>('subscriptions', uid, (s) => s.id === localId).catch(() => undefined);
    return outcome;
  }
  await deleteRows<Subscription>('subscriptions', uid, (s) => s.id === localId);
  invalidateSubscriptionCache();
  // Paused while it waited: the server creates plans active, so the pause is
  // sent onto the fresh twin. Best-effort; a failure leaves it active, which
  // the next read shows. A pause the shipped build made for low balance is
  // not the member's and is not sent: the server owns low balance.
  const sid = created && typeof created.id === 'string' ? created.id : '';
  if (sid && row.status === 'paused' && !autoPaused) await api.post(`/subscriptions/${sid}/pause`).catch(() => undefined);
  return 'done';
});

// LEGACY: 'sub-status' and 'sub-edit' ops queued by older builds (which kept
// the plan list locally and mirrored changes through the queue). This build
// calls the server directly, so nothing new is ever queued under these kinds.
// The queue drains in backend mode only, where the server is the source of
// truth: an op an old build queued (an auto-resume for a wallet that came
// back, an edit of a row that build held) would be pushed onto a plan the
// server has since paused or cancelled. Both are no-ops that drop the queued
// op. Nothing is written to the device.
registerMirrorHandler('sub-status', async (): Promise<MirrorOutcome> => 'drop');

registerMirrorHandler('sub-edit', async (): Promise<MirrorOutcome> => 'drop');

export async function setSubscriptionStatus(id: string, status: Subscription['status']): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured()) {
    await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, { status });
    return;
  }
  if ((await subscriptionOutbox(uid)).some((s) => s.id === id)) {
    // Not on the server yet: a cancel withdraws the create; a pause rides on
    // the row and is sent once the twin exists (sub-create above).
    if (status === 'cancelled') await deleteRows<Subscription>('subscriptions', uid, (s) => s.id === id);
    else await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, { status });
    return;
  }
  // The copy is dropped whether or not the call landed: a 409
  // SUBSCRIPTION_STATE means the server's row is not what the session shows
  // (the plan was cancelled or paused elsewhere), and a timeout may have
  // landed; either way the next read must come from the server.
  try {
    await api.post(`/subscriptions/${id}/${STATUS_ACTION[status]}`);
  } finally {
    invalidateSubscriptionCache();
    await forgetCarried(uid, id);
  }
}

/** Edit a live subscription's plan (quantity / frequency / delivery slot). */
export async function updateSubscription(
  id: string,
  patch: Partial<Pick<Subscription, 'qty' | 'frequency' | 'delivery_slot'>>,
): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured() || (await subscriptionOutbox(uid)).some((s) => s.id === id)) {
    // Local mode, or a create still in the outbox (it carries the edit).
    await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, patch);
    return;
  }
  const body: Record<string, unknown> = {};
  if (patch.qty != null) body.qty = patch.qty;
  if (patch.frequency != null) body.frequency = patch.frequency;
  if (patch.delivery_slot !== undefined) body.delivery_slot = patch.delivery_slot ?? '';
  await api.patch(`/subscriptions/${id}`, body);
  invalidateSubscriptionCache();
}

/**
 * Reactivate a paused subscription with a fresh schedule anchor: back to
 * 'active' AND start/next-delivery reset to `startDate` (deliveries resume
 * from that day, cadence re-anchored — not back-dated to the old start).
 */
export async function reactivateSubscription(id: string, startDate: string): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured() || (await subscriptionOutbox(uid)).some((s) => s.id === id)) {
    await updateRows<Subscription>('subscriptions', uid, (s) => s.id === id, {
      status: 'active',
      start_date: startDate,
      next_delivery_date: startDate,
    });
    return;
  }
  // The anchor first, then the resume (the server's resume keeps start_date).
  await forgetCarried(uid, id);
  await api.patch(`/subscriptions/${id}`, { start_date: startDate });
  await api.post(`/subscriptions/${id}/resume`);
  invalidateSubscriptionCache();
}

// -- Vacations ----------------------------------------------------------------

/**
 * Backend mode: the holiday ranges on the server's rows, as the screens read
 * them. A range every live plan carries is one account-wide row
 * (subscription_id null, the way the vacations screen sets them); a range on
 * some plans only is one row per plan. Ids derive from the range, so they are
 * stable across refreshes and deleteVacation can find its row again.
 */
export function vacationsFromServer(subs: Subscription[]): Vacation[] {
  const live = subs.filter((s) => s.backend_id && s.status !== 'cancelled');
  const byKey = new Map<string, { range: VacationRange; subs: string[] }>();
  for (const s of live) {
    for (const r of s.vacations ?? []) {
      const key = `${r.start}|${r.end}`;
      const entry = byKey.get(key) ?? { range: r, subs: [] };
      if (!entry.subs.includes(s.id)) entry.subs.push(s.id);
      byKey.set(key, entry);
    }
  }
  const out: Vacation[] = [];
  for (const [key, { range, subs: on }] of byKey) {
    if (on.length === live.length) {
      out.push({ id: `vac:${key}`, subscription_id: null, start_date: range.start, end_date: range.end, reason: null });
    } else {
      for (const sid of on) {
        out.push({ id: `vac:${sid}:${key}`, subscription_id: sid, start_date: range.start, end_date: range.end, reason: null });
      }
    }
  }
  return out;
}

export async function listVacations(): Promise<Vacation[]> {
  const uid = await requireUserId();
  const rows = isBackendConfigured()
    ? vacationsFromServer(await listSubscriptions())
    : await getRows<Vacation>('vacations', uid);
  return rows.sort((a, b) => b.start_date.localeCompare(a.start_date));
}

/** PATCH the plan's vacation ranges (the server worker skips those days). */
async function putVacations(sub: Subscription, ranges: VacationRange[]): Promise<void> {
  await api.patch(`/subscriptions/${sub.id}`, { vacations: ranges });
}

export async function addVacation(params: { startDate: string; endDate: string; subscriptionId?: string; reason?: string }): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured()) {
    await insertRow<Vacation>('vacations', uid, {
      id: newId('vac'),
      subscription_id: params.subscriptionId ?? null,
      start_date: params.startDate,
      end_date: params.endDate,
      reason: params.reason ?? null,
    });
    return;
  }
  // The range goes onto every live plan (or the one named). Each PATCH is
  // its own write; a failure part-way shows on the next read as a range on
  // some plans only, and the screen's retry completes it.
  const targets = (await listSubscriptions()).filter((s) => s.backend_id && (!params.subscriptionId || s.id === params.subscriptionId));
  if (targets.length === 0) throw new Error('Start a subscription first. A vacation pauses the plans you have.');
  const key = `${params.startDate}|${params.endDate}`;
  try {
    for (const s of targets) {
      const ranges = s.vacations ?? [];
      if (ranges.some((r) => `${r.start}|${r.end}` === key)) continue;
      await putVacations(s, [...ranges, { start: params.startDate, end: params.endDate }]);
    }
  } finally {
    invalidateSubscriptionCache();
  }
}

export async function deleteVacation(id: string): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured()) {
    await deleteRows<Vacation>('vacations', uid, (v) => v.id === id);
    return;
  }
  const v = (await listVacations()).find((x) => x.id === id);
  if (!v) return;
  const targets = (await listSubscriptions()).filter((s) => s.backend_id && (v.subscription_id === null || s.id === v.subscription_id));
  try {
    for (const s of targets) {
      const ranges = s.vacations ?? [];
      const kept = ranges.filter((r) => !(r.start === v.start_date && r.end === v.end_date));
      if (kept.length !== ranges.length) await putVacations(s, kept);
    }
  } finally {
    invalidateSubscriptionCache();
  }
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
 * Keep subscriptions in sync with the wallet balance.
 *
 * LOCAL MODE: pause an active one the wallet can no longer fund, and resume
 * one WE auto-paused once it can be funded again. User-paused subscriptions
 * are never touched.
 *
 * BACKEND MODE: the server owns low balance. Its noon lock locks a day only
 * when the wallet covered it at 12:00 and skips it otherwise
 * (subscriptions.go lockConsumerDay), the delivery debit refuses at the door,
 * and the CRM's B-01 / B-02 triggers tell the member. A pause from this phone
 * would fight that: a pause the server never asked for, resumed by whichever
 * device reads a higher balance first. So this never pauses. What remains:
 * the reminder (a live plan costs more than the wallet holds, or a plan the
 * shipped build paused still waits for it), and resuming those plans once
 * the wallet covers them (resumeCarriedPlans).
 */
export async function reconcileWithBalance(balance: number): Promise<{ lowBalance: boolean; changed: boolean }> {
  const uid = await requireUserId();
  const key = lowbalKey(uid);
  const subs = await listSubscriptions();
  if (isBackendConfigured()) {
    const { resumed, waiting } = await resumeCarriedPlans(uid, balance);
    const lowBalance = waiting > 0 || subs.some((s) => s.status === 'active' && balance < perDeliveryCost(s));
    return { lowBalance, changed: resumed > 0 };
  }
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

/**
 * Backend mode: resume each plan the shipped build paused for low balance
 * (carryShippedAutoPauses) that is still paused on the server, once `balance`
 * covers one delivery of it. The server applies the noon rule to a resume:
 * before 12:00 it delivers from tomorrow, after it from the day after. A plan
 * the server shows active, cancelled or gone is dropped from the set; one
 * the wallet cannot cover yet waits for the next reconcile (the Subscriptions
 * screen, a recharge). Reads the server fresh while anything waits, so a plan
 * changed on another phone is judged as it is now. Error-soft: a refused
 * resume (the plan is no longer paused) drops it, a failed one waits.
 */
async function resumeCarriedPlans(uid: string, balance: number): Promise<{ resumed: number; waiting: number }> {
  let carried: string[];
  try {
    carried = await readIdList(carriedLowbalKey(uid));
  } catch {
    return { resumed: 0, waiting: 0 };
  }
  if (carried.length === 0) return { resumed: 0, waiting: 0 };
  let subs: Subscription[];
  try {
    subs = await listSubscriptions({ refresh: true });
  } catch {
    return { resumed: 0, waiting: carried.length };
  }
  const keep: string[] = [];
  let resumed = 0;
  for (const sid of carried) {
    const s = subs.find((x) => x.backend_id === sid);
    if (!s || s.status !== 'paused') continue;
    if (balance < perDeliveryCost(s)) {
      keep.push(sid);
      continue;
    }
    try {
      await api.post(`/subscriptions/${sid}/resume`);
      resumed += 1;
    } catch (e) {
      if (mirrorOutcomeFor(e) !== 'drop') keep.push(sid);
    }
  }
  if (resumed > 0) invalidateSubscriptionCache();
  await writeIdList(carriedLowbalKey(uid), keep).catch(() => undefined);
  return { resumed, waiting: keep.length };
}
