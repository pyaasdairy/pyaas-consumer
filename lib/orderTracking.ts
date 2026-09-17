import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listOrders, type Order, type OrderStatus } from './api';
import { STATUS_LABEL } from './orderStatus';
import { notify } from './notificationCenter';

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
const SEEN_KEY = (id: string) => `pyaas_order_seen_status:${id}`;

/** Truly-instant = the express lane AND the "by HH:MM" window shape. */
export function isInstantOrder(o: Order): boolean {
  return o.lane === 'instant' && (o.delivery_window ?? '').toLowerCase().startsWith('by ');
}

export function isActive(o: Order): boolean {
  return o.status !== 'delivered' && o.status !== 'cancelled';
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

// ── Notification copy per state ──────────────────────────────────────────────
// Written for a lock screen: what happened, and what it means for the member.
function noticeFor(o: Order): { title: string; body: string } | null {
  const instant = isInstantOrder(o);
  const eta = etaText(o);
  switch (o.status) {
    case 'confirmed':
      return instant
        ? { title: 'Order confirmed', body: eta ? `Your store is on it. ${eta}.` : 'Your store is on it.' }
        : null; // a morning order's confirmation is not worth a buzz
    case 'preparing':
      return { title: 'Packing your order', body: instant ? 'Your milk is being packed right now.' : 'Your morning order is being packed.' };
    case 'assigned':
      return { title: 'Rider assigned', body: 'A rider has picked up your order.' };
    case 'out_for_delivery':
      return { title: 'On the way', body: eta ? `Your rider is on the way. ${eta}.` : 'Your rider is on the way to your door.' };
    case 'delivered':
      return { title: 'Delivered', body: 'Your order is at your door. Enjoy.' };
    case 'cancelled':
      return { title: 'Order cancelled', body: 'Anything held for this order is back in your wallet.' };
    default:
      return null;
  }
}

/**
 * Announce a status change exactly once per order per state. Persisted, so it
 * survives a relaunch and a fresh poll loop.
 */
async function announce(o: Order): Promise<void> {
  try {
    const key = SEEN_KEY(o.id);
    const seen = await AsyncStorage.getItem(key);
    if (seen === o.status) return;
    const first = seen == null;
    await AsyncStorage.setItem(key, o.status);
    // On the FIRST sighting of an order we only record where it is — the
    // member just placed it and is looking at the confirmation screen; a
    // notification for 'placed' would be noise.
    if (first && (o.status === 'placed' || o.status === 'confirmed')) return;
    const n = noticeFor(o);
    if (!n) return;
    await notify({
      kind: isInstantOrder(o) ? 'order' : 'delivery',
      title: n.title,
      body: n.body,
      href: `/order/${o.id}`,
      dedupe: `order:${o.id}:${o.status}`,
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
      const all = await listOrders();
      if (!alive.current) return;
      const active = all.filter(isActive).sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));
      setOrders(active);
      // Announce transitions for everything we can see, including the ones
      // that just finished (so "Delivered" still reaches the member).
      for (const o of all.slice(0, 8)) void announce(o);
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
