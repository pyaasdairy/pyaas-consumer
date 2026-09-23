import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchOrders, type Order, type OrderStatus } from './api';
import { STATUS_LABEL } from './orderStatus';
import { hhmmTo12 } from './deliveryMode';
import { addDaysISO, isoOf, todayISO } from './dates';
import { notify } from './notificationCenter';
import { getUserId } from './session';

/**
 * LIVE ORDER TRACKING — the Blinkit-shaped half of the app: while an order is
 * on its way the member sees a step tracker that MOVES, with a real countdown,
 * and gets a notification on every state change even if the app is in their
 * pocket (foreground/background while the process lives; a closed-app push is
 * the backend's half, see lib/notifications).
 *
 * The app polls because the backend has no socket: `useLiveOrders` re-reads
 * GET /orders on a short interval while the screen that mounted it is alive,
 * and stops the moment it unmounts. Nothing ticks in the background.
 *
 * The notification side is IDEMPOTENT by construction: the last status we told
 * the member about is persisted per order, so a poll that re-observes the same
 * state is silent, and an app relaunch doesn't re-announce history.
 */

const POLL_MS = 15000;
// The last-announced status marker, keyed PER ACCOUNT. It was keyed by order
// id alone, so it lived outside the account's cache: sign-out purged the
// account's notification rows (the dedupe) but not these, and on a shared
// phone one member's markers sat next to the next member's. Scoping it like
// every other per-account key means it is purged with the rest on sign-out
// and can never be read for the wrong account.
const SEEN_KEY = (uid: string, id: string) => `pyaas_order_seen_status:${uid}:${id}`;
/** A finished order older than this on FIRST sighting is history, not news. */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** Truly-instant = the express lane AND the "by HH:MM" window shape. */
export function isInstantOrder(o: Order): boolean {
  return o.lane === 'instant' && (o.delivery_window ?? '').toLowerCase().startsWith('by ');
}

/**
 * The morning (YYYY-MM-DD, local) an order is FOR. A picked date wins; an
 * instant order is for the day it was placed; an undated morning order rides
 * the next 5-7:30 AM run (the same day if placed before 5 AM).
 */
export function deliveryDayOf(o: Order): string | null {
  if (o.delivery_date) return o.delivery_date.slice(0, 10);
  const placed = new Date(o.placed_at);
  if (Number.isNaN(placed.getTime())) return null;
  if (isInstantOrder(o)) return isoOf(placed);
  return placed.getHours() < 5 ? isoOf(placed) : addDaysISO(isoOf(placed), 1);
}

/**
 * ACTIVE = still to be delivered: not delivered, not cancelled, AND its
 * delivery day has not already passed (founder call, 21 Sep: "just show the
 * active orders"). A morning order stays "placed" on the server until a rider
 * marks it delivered, so without the date check every past morning kept
 * showing as "Scheduled" and the list filled with ₹72 boxes. Display only —
 * no order is changed or cancelled by this.
 */
export function isActive(o: Order, today: string = todayISO()): boolean {
  if (o.status === 'delivered' || o.status === 'cancelled') return false;
  const day = deliveryDayOf(o);
  return day == null || day >= today;
}

/** The ETA instant we should count down to, or null for a morning order. */
export function etaDate(o: Order): Date | null {
  const raw = o.etaAt ?? o.eta_at ?? null;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (!isInstantOrder(o)) return null;
  const placed = new Date(o.placed_at);
  if (Number.isNaN(placed.getTime())) return null;
  return new Date(placed.getTime() + 20 * 60 * 1000);
}

/** "Arriving in 12 min" / "Arriving any moment" / null for morning orders. */
export function etaText(o: Order, now: Date = new Date()): string | null {
  const eta = etaDate(o);
  if (!eta) return null;
  if (o.status === 'delivered') return null;
  const mins = Math.round((eta.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return 'Arriving any moment';
  if (mins === 1) return 'Arriving in about a minute';
  return `Arriving in about ${mins} min`;
}

export type TrackStep = {
  key: OrderStatus;
  label: string;
  /** Reached (or passed). */
  done: boolean;
  /** The step the order is on right now. */
  current: boolean;
};

/** The instant-lane step tracker: four honest states, no invented ones. */
const INSTANT_FLOW: { key: OrderStatus; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'preparing', label: 'Packing your order' },
  { key: 'out_for_delivery', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

const MORNING_FLOW: { key: OrderStatus; label: string }[] = [
  { key: 'placed', label: 'Scheduled' },
  { key: 'preparing', label: 'Being packed' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

/** Map the backend's finer statuses onto the four displayed steps. */
function stepIndexFor(status: OrderStatus): number {
  switch (status) {
    case 'placed':
    case 'confirmed':
      return 0;
    case 'preparing':
    case 'assigned':
      return 1;
    case 'out_for_delivery':
      return 2;
    case 'delivered':
      return 3;
    default:
      return 0; // cancelled is rendered by the caller, not as a step
  }
}

export function trackSteps(o: Order): TrackStep[] {
  const flow = isInstantOrder(o) ? INSTANT_FLOW : MORNING_FLOW;
  const at = stepIndexFor(o.status);
  return flow.map((s, i) => ({ key: s.key, label: s.label, done: i <= at, current: i === at }));
}

// ── Notification copy per state (Swiggy-style) ────────────────────────────────
// TITLE = when it arrives ("Arriving in 24 mins"), BODY = what is happening
// now ("Rider is on the way to pick up") — the lock-screen shape members know
// from Swiggy (founder call, 21 Sep). Every update for one order REPLACES the
// previous notification (same identifier), so the member sees one live line
// that keeps counting down instead of a pile of alerts.

/** "Arriving in 24 mins" (instant) / "Arriving by 7:30 AM" (morning). */
function arrivalTitle(o: Order, now: Date = new Date()): string {
  const eta = etaDate(o);
  if (eta) {
    const mins = Math.round((eta.getTime() - now.getTime()) / 60000);
    if (mins <= 1) return 'Arriving now';
    return `Arriving in ${mins} mins`;
  }
  const end = (o.delivery_window ?? '').split('-')[1]?.trim();
  const label = end ? hhmmTo12(end) : null;
  return label ? `Arriving by ${label}` : 'Arriving this morning';
}

function noticeFor(o: Order): { title: string; body: string } | null {
  const instant = isInstantOrder(o);
  switch (o.status) {
    case 'confirmed':
      // A morning order's confirmation is not worth a buzz.
      return instant ? { title: arrivalTitle(o), body: 'Your order is accepted' } : null;
    case 'preparing':
      return { title: arrivalTitle(o), body: 'Your order is being packed' };
    case 'assigned':
      return { title: arrivalTitle(o), body: 'Rider is on the way to pick up' };
    case 'out_for_delivery':
      return { title: arrivalTitle(o), body: 'Rider is on the way to you' };
    case 'delivered':
      return { title: 'Delivered', body: 'Your order is at your door' };
    case 'cancelled':
      return { title: 'Order cancelled', body: 'Anything held for this order is back in your wallet' };
    default:
      return null;
  }
}

/**
 * Whether an order seen for the FIRST time is old news: a delivered or
 * cancelled order whose event (delivered_at, else placed_at) is more than
 * FRESH_MS ago, or has no usable timestamp at all. The first poll after a
 * switch to an account this handset has never tracked sees that account's
 * whole history with no markers; announcing every delivered row in it as
 * "Delivered" was the stale burst. This morning's delivery, seen for the
 * first time when the member opens the app, is still fresh and still lands.
 */
export function isStaleOnFirstSight(o: Order, now: number = Date.now()): boolean {
  if (o.status !== 'delivered' && o.status !== 'cancelled') return false;
  const deliveredAt = Date.parse(String((o as { delivered_at?: string }).delivered_at ?? '')) || 0;
  const at = deliveredAt || Date.parse(o.placed_at) || 0;
  return !at || now - at > FRESH_MS;
}

/**
 * Announce a status change exactly once per order per state. Persisted, so it
 * survives a relaunch and a fresh poll loop. `uid` is the account the poll
 * was made for, so a sign-out mid-flight can never write the notice under
 * the next account.
 */
async function announce(uid: string, o: Order): Promise<void> {
  try {
    const key = SEEN_KEY(uid, o.id);
    const seen = await AsyncStorage.getItem(key);
    if (seen === o.status) return;
    const first = seen == null;
    await AsyncStorage.setItem(key, o.status);
    // On the FIRST sighting of an order we only record where it is — the
    // member just placed it and is looking at the confirmation screen; a
    // notification for 'placed' would be noise.
    if (first && (o.status === 'placed' || o.status === 'confirmed')) return;
    // ...and a finished order this handset never tracked is history, not a delivery.
    if (first && isStaleOnFirstSight(o)) return;
    const n = noticeFor(o);
    if (!n) return;
    if ((await getUserId()) !== uid) return; // the account changed under the poll
    await notify({
      kind: isInstantOrder(o) ? 'order' : 'delivery',
      title: n.title,
      body: n.body,
      href: `/order/${o.id}`,
      dedupe: `order:${o.id}:${o.status}`,
      // One live notification per order: each update replaces the last.
      identifier: `order:${o.id}`,
    });
  } catch {
    /* tracking must never break on a storage hiccup */
  }
}

export type LiveOrders = {
  /** Active orders, newest first. */
  orders: Order[];
  /** The one to feature: an active instant order, else the nearest morning one. */
  featured: Order | null;
  loading: boolean;
  refresh: () => void;
  /** Re-renders every 30s so the countdown stays honest. */
  now: Date;
};

/**
 * Poll active orders while this component is mounted. `enabled` lets a screen
 * pause the loop (e.g. while it is not focused) without unmounting.
 */
export function useLiveOrders(enabled = true): LiveOrders {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      // The account this poll is for; captured BEFORE the fetch so a switch
      // while the request is in flight cannot attribute its rows elsewhere.
      const uid = await getUserId();
      if (!uid) return;
      // fetchOrders, not listOrders: a poll four times a minute must not
      // carry the settle sweep (a wallet debit per delivered row) with it.
      const all = await fetchOrders();
      if (!alive.current) return;
      const today = todayISO();
      const active = all.filter((o) => isActive(o, today)).sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));
      setOrders(active);
      // Announce transitions for everything we can see, including the ones
      // that just finished (so "Delivered" still reaches the member).
      for (const o of all.slice(0, 8)) void announce(uid, o);
    } catch {
      /* signed out / offline — keep whatever we had */
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return () => { alive.current = false; };
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => {
      alive.current = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [enabled, load]);

  const featured =
    orders.find((o) => isInstantOrder(o)) ??
    orders[0] ??
    null;

  return { orders, featured, loading, refresh: () => { void load(); }, now };
}

/** Human status line for a card ("On the way · Arriving in about 8 min"). */
export function statusLine(o: Order, now: Date = new Date()): string {
  const label = STATUS_LABEL[o.status] ?? 'In progress';
  const eta = etaText(o, now);
  return eta ? `${label} · ${eta}` : label;
}

/**
 * When an order arrives, for a list row: "Arriving in about 12 min" (instant),
 * "Today, by 7:30 AM" / "Tomorrow, by 7:30 AM" (morning).
 */
export function arrivalLine(o: Order, now: Date = new Date()): string {
  const eta = etaText(o, now);
  if (eta) return eta;
  const end = (o.delivery_window ?? '').split('-')[1]?.trim();
  const by = end ? hhmmTo12(end) : '7:30 AM';
  const day = deliveryDayOf(o);
  const today = isoOf(now);
  const label = day === today ? 'Today' : day === addDaysISO(today, 1) ? 'Tomorrow' : day ? new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Morning';
  return `${label}, by ${by}`;
}
