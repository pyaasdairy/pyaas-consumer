import { getRows, insertRow, setRows } from './localStore';
import { getUserId } from './session';
import { todayISO, addDaysISO } from './dates';
import {
  listSubscriptions,
  listVacations,
  subscriptionDueOn,
  reconcileWithBalance,
} from './subscriptions';
import { listAddresses, placeOrder } from './api';
import { isPlusActive } from './vip';
import { getTrial, NO_TRIAL } from './trial';
import { FREE_PACK_PRODUCT_ID } from './freePack';
import { getBalances } from './walletApi';
import { getProduct } from '../constants/products';
import { isBackendConfigured } from './apiClient';

/**
 * CLIENT-SIDE SUBSCRIPTION SWEEP — the "day-3 charge" engine.
 *
 * Subscriptions on their own are only a schedule (lib/subscriptions is a
 * cadence model, never a materialised order list). This sweep is what turns
 * today's due subscriptions into REAL orders, so milk actually ships and money
 * actually moves:
 *
 *   for each ACTIVE subscription, for TODAY only (no historical catch-up):
 *     if subscriptionDueOn(sub, today) and no marker for (sub.id, today):
 *       place a real order through the existing order machinery (placeOrder —
 *       lane 'morning', the 05:00–07:30 window, paid from the wallet), then
 *       write an idempotent marker row so the same (sub, day) never orders twice.
 *
 * The DEBIT then rides the existing delivered-order settle path
 * (settleDeliveredOrders → debitWallet, rewards-first on the server). Under the
 * trial the FREE days (1-2) are placed with trialFree, so the milk goes out and
 * nothing is debited, and the paid days (3-4) charge the wallet as normal;
 * after that it continues daily. In local (no-backend) mode placeOrder debits
 * immediately, so the free-day check has to happen HERE as well as server-side.
 *
 * If the wallet can't cover a due delivery the order is NOT placed (never place
 * milk that can't be paid for); reconcileWithBalance then auto-pauses the sub,
 * which surfaces the existing low-balance nudge on home.
 *
 * Runs on app launch + home focus (wired into app/(tabs)/index.tsx), always
 * non-blocking and error-soft: any failure just means a retry on the next
 * sweep — the per-day marker keeps every retry idempotent.
 */

const MARKERS_TABLE = 'sub_order_markers';
// Markers older than this are pruned (they can never match again — the sweep
// only ever looks at TODAY's ref).
const MARKER_KEEP_DAYS = 30;

export type SubOrderMarker = {
  /** Idempotency ref: `sub_order:<subId>:<YYYY-MM-DD>`. */
  ref: string;
  subscription_id: string;
  date: string; // YYYY-MM-DD (local)
  order_id: string | null;
  created_at: string;
};

export function subOrderRef(subscriptionId: string, dateISO: string): string {
  return `sub_order:${subscriptionId}:${dateISO}`;
}

// Module-level in-flight mutex: launch + focus can both fire the sweep in the
// same tick; the second caller just awaits the first run.
let sweeping: Promise<number> | null = null;

/** Run the sweep (at most one at a time). Resolves to the number of orders placed. */
export function sweepDueSubscriptions(): Promise<number> {
  if (!sweeping) {
    sweeping = runSweep()
      .catch(() => 0) // error-soft: a failed sweep retries on the next launch/focus
      .finally(() => { sweeping = null; });
  }
  return sweeping;
}

async function runSweep(): Promise<number> {
  const uid = await getUserId();
  if (!uid) return 0; // signed out — nothing to sweep

  const today = todayISO();
  const [subs, vacations] = await Promise.all([listSubscriptions(), listVacations()]);
  // A subscription mirrored to the backend (backend_id) is ordered by the
  // SERVER's daily worker — sweeping it here too would place the same morning
  // order twice. This sweep only covers local-only rows (offline mode, or a
  // row whose mirror failed).
  const backendOwned = isBackendConfigured();
  const due = subs.filter(
    (s) => s.status === 'active' && !(backendOwned && s.backend_id) && subscriptionDueOn(s, today, vacations),
  );
  if (due.length === 0) return 0;

  // Idempotency markers: one per (subscription, day). Prune the stale tail so
  // the table never grows unbounded.
  let markers = await getRows<SubOrderMarker>(MARKERS_TABLE, uid);
  const cutoff = addDaysISO(today, -MARKER_KEEP_DAYS);
  if (markers.some((m) => m.date < cutoff)) {
    markers = markers.filter((m) => m.date >= cutoff);
    await setRows(MARKERS_TABLE, uid, markers);
  }
  const done = new Set(markers.map((m) => m.ref));
  const pending = due.filter((s) => !done.has(subOrderRef(s.id, today)));
  if (pending.length === 0) return 0;

  // A delivery order needs an address; the claim/product flows always create
  // one. Without it, skip quietly (retry once the member adds an address).
  const addrs = await listAddresses().catch(() => []);
  const address = addrs.find((a) => a.is_default) ?? addrs[0];
  if (!address) return 0;

  // Affordability floor: never place a delivery the wallet can't fund.
  let balance = (await getBalances()).available;
  let placed = 0;
  let skippedShort = false;

  // Read membership once for the whole sweep — Plus waives the per-delivery fee,
  // and this is the loop that actually takes the member's money each morning.
  const isPlus = await isPlusActive();

  // The trial's FREE days must actually be free. This loop is the only thing
  // that moves money for a subscription, and it never read the trial phase — so
  // every "free" day was still debited in full locally, and only a live backend
  // was ever going to zero it. The home banner promises the first two days, so
  // the promise has to hold in both modes.
  const trial = await getTrial().catch(() => NO_TRIAL);
  const trialFreeToday = trial.phase === 'free';

  for (const sub of pending) {
    const product = getProduct(sub.product_id);
    if (!product) continue; // SKU no longer in the catalog
    // Only the trial SKU rides the trial; a member's other subscriptions bill
    // normally even while their milk trial is in its free window.
    const isTrialSku = sub.product_id === FREE_PACK_PRODUCT_ID;
    const freeDelivery = trialFreeToday && isTrialSku;
    const subtotal = sub.unit_price * sub.qty;
    // Subscriptions bill at MRP — no delivery fee (matches the Subscribe
    // button's quote; the fee remains a one-time-order concept only).
    const cost = freeDelivery ? 0 : subtotal;
    if (balance < cost) { skippedShort = true; continue; }
    try {
      const orderId = await placeOrder({
        // Mirrors the product screen's subscription first-delivery order.
        lines: [{
          id: product.id,
          lane: 'morning' as const,
          name: product.name,
          variant: sub.variant ?? product.variant,
          price: sub.unit_price,
          image: product.image,
          qty: sub.qty,
        }],
        address,
        paymentMethod: 'wallet',
        priority: 'normal',
        orderType: 'subscription',
        trialFree: freeDelivery,
        lane: 'morning', // subscriptions always ride the 05:00–07:30 route
      });
      // Marker AFTER the order lands: a failed placement leaves no marker, so
      // the next sweep retries; a placed order can never repeat for this day.
      await insertRow<SubOrderMarker>(MARKERS_TABLE, uid, {
        ref: subOrderRef(sub.id, today),
        subscription_id: sub.id,
        date: today,
        order_id: orderId,
        created_at: new Date().toISOString(),
      });
      placed += 1;
      // Reserve the cost against the running balance so a multi-sub sweep never
      // over-commits the wallet (backend mode debits on delivery, later).
      balance -= cost;
    } catch { /* per-sub error-soft — no marker, retried next sweep */ }
  }

  // Wallet can't fund a due delivery → the existing low-balance machinery:
  // auto-pause the unaffordable subs, which lights up the home nudge.
  if (skippedShort) {
    await reconcileWithBalance(balance).catch(() => { /* non-fatal */ });
  }
  return placed;
}
