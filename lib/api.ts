import type { CartLine } from '../store/cart';
import { cartTotals } from './pricing';
import { requireUserId, getProfile } from './session';
import { getRows, setRows, insertRow, updateRows, deleteRows, newId } from './localStore';
import { debitWallet, autoSettleTopUp } from './walletApi';
import { api, isBackendConfigured, HttpError } from './apiClient';
import { instantEtaHHMM, INSTANT_ETA_MINUTES, MORNING_WINDOW } from './deliveryMode';
import { getServiceabilitySnapshot } from './serviceability';

/**
 * Consumer data layer: addresses + orders. Runs against the on-device store so
 * the app works before the NestJS backend is deployed. Each function maps 1:1 to
 * a parag-api endpoint (addresses.controller / orders.controller); to go live,
 * swap the localStore calls for apiClient.get/post/etc against those routes.
 */

export type Address = {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
  /** Who receives the delivery at this door (mandatory in the capture flow). */
  receiver_name?: string | null;
  /** Reverse-geocoded label of the pinned spot ("4JCJ+52Q, Kattigenahalli…"). */
  geo_label?: string | null;
  // ── Delivery preferences (ride into placeOrder deliveryPrefs) ──────────────
  ring_bell?: boolean;
  call_before?: boolean;
  /** Free-text delivery instructions ("gate code 4321, don't ring after 9"). */
  instructions?: string | null;
  /** Sample door photo the member added so the rider finds the exact door. */
  door_photo_uri?: string | null;
  /** Server-side twin id (Mongo hex) once mirrored to the backend — the DB copy
   *  the subscription worker + store routing read. */
  backend_id?: string | null;
};

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type Rider = {
  id: string;
  full_name: string;
  phone: string;
  vehicle: string | null;
  rating: number | null;
  current_lat: number | null;
  current_lng: number | null;
};

export type OrderItem = {
  id: string;
  product_id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
};

export type Order = {
  id: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  // Monsoon surcharge (₹) on INSTANT orders (store-manager set, backend-authoritative).
  monsoon_fee?: number;
  total: number;
  payment_method: string;
  address_label: string;
  address_text: string;
  rider_id: string | null;
  placed_at: string;
  priority?: string | null;
  delivery_window?: string | null;
  // Delivery lane: 'instant' = ~20 min express, 'morning' = the 5–7:30 AM slot
  // (also used for a picked date). Backend stores it and mints etaAt on the task.
  lane?: 'instant' | 'morning' | null;
  // Server-minted instant ETA (ISO). Snake_case tolerated on the wire.
  etaAt?: string | null;
  eta_at?: string | null;
  // Picked delivery date (ISO YYYY-MM-DD) for a scheduled morning order.
  delivery_date?: string | null;
  proof_photo_url?: string | null;
  order_items?: OrderItem[];
  riders?: Rider | null;
  // 'instant' = one-off order placed now; 'subscription' = a recurring delivery.
  order_type?: 'instant' | 'subscription';
  // 2+2 free-day subscription delivery: the sticker `total` stands, but the wallet
  // charge is 0 (backend-set at creation from the trial phase). Badge it FREE.
  trial_free?: boolean;
  // Optional company GSTIN captured at checkout → printed on the proforma bill.
  buyer_gstin?: string | null;
  // Review-after-delivery (populated by the shared backend when configured).
  can_review?: boolean;
  review?: { rating: number; comment: string; created_at: string } | null;
};

export const DELIVERY_FEE = 15;
export const FREE_DELIVERY_OVER = 199;

export function deliveryFeeFor(subtotal: number): number {
  return subtotal >= FREE_DELIVERY_OVER || subtotal === 0 ? 0 : DELIVERY_FEE;
}

// The demo rider assigned when a customer simulates a rider pickup. Matches the
// seeded rider in apps/parag-api schema.sql.
const DEMO_RIDER: Rider = {
  id: 'rider-demo',
  full_name: 'Ram Kumar',
  phone: '+919999900000',
  vehicle: 'Bike · UP32 CD 5678',
  rating: 4.8,
  current_lat: 26.8467,
  current_lng: 80.9462,
};

// ── Addresses ────────────────────────────────────────────────────────────────
export async function listAddresses(): Promise<Address[]> {
  const uid = await requireUserId();
  const rows = await getRows<Address>('addresses', uid);
  return rows.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export async function addAddress(a: Omit<Address, 'id' | 'user_id' | 'created_at'>): Promise<Address> {
  const uid = await requireUserId();
  const existing = await getRows<Address>('addresses', uid);
  const is_default = existing.length === 0 ? true : a.is_default;
  if (is_default) {
    await updateRows<Address>('addresses', uid, () => true, { is_default: false });
  }
  const row: Address = {
    ...a,
    is_default,
    id: newId('addr'),
    user_id: uid,
    created_at: new Date().toISOString(),
  };
  const saved = await insertRow<Address>('addresses', uid, row);
  // Mirror the COMPLETE address into the backend DB (consumer_addresses) —
  // awaited so anything that immediately follows (pin patch, a subscription
  // mirror) finds it server-side. Error-soft: offline keeps the local row and
  // the app behaves exactly as before.
  await mirrorAddressCreate(uid, saved);
  return saved;
}

/** Backend twin of a local address row, if it was mirrored. */
async function addressBackendId(uid: string, id: string): Promise<string | null> {
  const rows = await getRows<Address>('addresses', uid);
  return rows.find((r) => r.id === id)?.backend_id ?? null;
}

async function mirrorAddressCreate(uid: string, row: Address): Promise<void> {
  if (!isBackendConfigured()) return;
  try {
    const geo = row as unknown as { lat?: number | null; lng?: number | null };
    const created = await api.post<{ id: string }>('/addresses', {
      label: row.label,
      line1: row.line1,
      line2: row.line2 ?? '',
      city: row.city,
      pincode: row.pincode,
      is_default: row.is_default,
      lat: geo.lat ?? undefined,
      lng: geo.lng ?? undefined,
      receiver_name: row.receiver_name ?? '',
      geo_label: row.geo_label ?? '',
      ring_bell: row.ring_bell,
      call_before: row.call_before,
      instructions: row.instructions ?? '',
      door_photo_uri: row.door_photo_uri ?? '',
    });
    if (created?.id) {
      await updateRows<Address>('addresses', uid, (r) => r.id === row.id, { backend_id: created.id });
    }
  } catch {
    /* local-only until the next save */
  }
}

export async function setDefaultAddress(id: string): Promise<void> {
  const uid = await requireUserId();
  await updateRows<Address>('addresses', uid, () => true, { is_default: false });
  await updateRows<Address>('addresses', uid, (r) => r.id === id, { is_default: true });
  const bid = await addressBackendId(uid, id);
  if (bid && isBackendConfigured()) {
    void api.post(`/addresses/${bid}/default`).catch(() => undefined);
  }
}

export async function deleteAddress(id: string): Promise<void> {
  const uid = await requireUserId();
  const bid = await addressBackendId(uid, id); // capture BEFORE the local delete
  await deleteRows<Address>('addresses', uid, (r) => r.id === id);
  if (bid && isBackendConfigured()) {
    void api.del(`/addresses/${bid}`).catch(() => undefined);
  }
}

// ── Orders ───────────────────────────────────────────────────────────────────
export async function placeOrder(params: {
  lines: CartLine[];
  address: Address;
  paymentMethod: string;            // 'cod' | 'prepaid' | 'wallet'
  couponCode?: string | null;
  couponDiscount?: number;
  vipDiscount?: number;
  deliveryPrefs?: Record<string, unknown> | null;
  priority?: 'vip' | 'normal';
  orderType?: 'instant' | 'subscription';
  buyerGstin?: string | null;
  /** Delivery lane. 'instant' = express ~20 min (one-time orders only);
   *  'morning' (default) = the 5–7:30 AM slot. */
  lane?: 'instant' | 'morning';
  /** Picked delivery date (ISO YYYY-MM-DD) → delivered in that day's morning slot. */
  deliveryDate?: string | null;
}): Promise<string> {
  const { lines, address, paymentMethod } = params;
  const couponDiscount = params.couponDiscount ?? 0;
  const uid = await requireUserId();

  // Serviceability gate. FAIL-OPEN: only an EXPLICIT `serviceable === false` (a
  // resolved out-of-zone check) blocks checkout — an unknown/loading state
  // (serviceable === null) or a network blip never stops a paying customer.
  const svc = getServiceabilitySnapshot();
  if (svc.serviceable === false) {
    throw new Error("We're not delivering to your area just yet. Join the waitlist and we'll notify you the moment we launch here.");
  }
  // Defensive: the Instant toggle is disabled in the UI when instant isn't served
  // here, but re-guard so a stale in-flight cart can't slip an instant order past
  // a store that doesn't run the express lane.
  if (params.lane === 'instant' && svc.instantClosed) {
    throw new Error('Instant delivery is closed right now. Please choose the morning slot.');
  }
  if (params.lane === 'instant' && svc.instant === false) {
    throw new Error("Instant delivery isn't available at your address yet. Please choose the morning slot.");
  }

  // Instant lane (one-time express; a subscription always rides the morning route).
  const isInstant = params.lane === 'instant' && (params.orderType ?? 'instant') !== 'subscription';
  const { subtotal } = cartTotals(lines);
  const delivery_fee = deliveryFeeFor(subtotal);
  // Monsoon surcharge: INSTANT orders only, read from the serving store's zone
  // (via serviceability). The backend re-applies it authoritatively on create.
  const monsoon_fee = isInstant ? (svc.monsoonRupees || 0) : 0;
  const total = Math.max(0, subtotal - couponDiscount) + delivery_fee + monsoon_fee;
  const address_text = [address.line1, address.line2, address.city, address.pincode]
    .filter(Boolean)
    .join(', ');

  // Delivery lane. Instant is a one-time-order express lane only — a
  // subscription always rides the morning route, whatever the caller passed.
  const lane: 'instant' | 'morning' = isInstant ? 'instant' : 'morning';
  const placedAt = new Date();
  // instant → 'by HH:MM' (now + 20 min, local); morning / picked date → the
  // 5–7:30 AM slot (a picked date also carries delivery_date below).
  const delivery_window = lane === 'instant' ? `by ${instantEtaHHMM(placedAt)}` : MORNING_WINDOW;

  const orderId = newId('ord');
  const order: Order = {
    id: orderId,
    user_id: uid,
    status: 'placed',
    subtotal,
    delivery_fee,
    monsoon_fee,
    total,
    payment_method: paymentMethod,
    address_label: address.label,
    address_text,
    rider_id: null,
    placed_at: placedAt.toISOString(),
    // Instant rides the express lane at high priority; the backend stores lane
    // and mints etaAt = placed + 20 min on the delivery task.
    priority: lane === 'instant' ? 'high' : params.priority ?? 'normal',
    delivery_window,
    lane,
    delivery_date: lane === 'instant' ? null : params.deliveryDate ?? null,
    etaAt: lane === 'instant' ? new Date(placedAt.getTime() + INSTANT_ETA_MINUTES * 60 * 1000).toISOString() : null,
    order_type: params.orderType ?? 'instant',
    buyer_gstin: params.buyerGstin?.trim() || null,
    order_items: lines.map((l) => ({
      id: newId('item'),
      product_id: l.id,
      name: l.name,
      variant: l.variant,
      price: l.price,
      qty: l.qty,
    })),
    riders: null,
  };

  // When the shared backend is configured, it OWNS the order (and debits the
  // wallet on delivery), so it reaches the Saathi rider queue. We must NOT debit
  // locally here, or the order is charged twice (once now, once on delivery).
  if (isBackendConfigured()) {
    const prof = await getProfile().catch(() => null);
    const geo = (address as unknown as { lat?: number; lng?: number });
    const created = await api.post<Order>('/orders', {
      ...order,
      consumer_name: prof?.full_name ?? undefined,
      phone: (prof as { phone?: string } | null)?.phone ?? undefined,
      geo: geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : undefined,
    });
    return created.id;
  }

  await insertRow<Order>('orders', uid, order);
  // Wallet/prepaid orders are settled immediately from the prepaid wallet (this
  // records a 'debit' in the ledger). COD orders are paid on delivery.
  if (paymentMethod === 'wallet' || paymentMethod === 'prepaid') {
    await debitWallet(total, 'order', `Order ${orderId.slice(-6)}`);
  }
  return orderId;
}

export async function listOrders(): Promise<Order[]> {
  const uid = await requireUserId();
  if (isBackendConfigured()) {
    const orders = await api.get<Order[]>(`/orders?user_id=${encodeURIComponent(uid)}`);
    // Reconcile prepaid wallet against delivered orders here too — not only on the
    // tracking screen — so an order the customer never re-opens is still charged.
    // debitWallet is idempotent by 'delivery:<orderId>', so this never double-charges.
    await settleDeliveredOrders(orders);
    return orders;
  }
  const rows = await getRows<Order>('orders', uid);
  return rows.sort((a, b) => b.placed_at.localeCompare(a.placed_at));
}

/**
 * Charge the prepaid wallet for any backend order that has been delivered and is
 * not COD. Idempotent (debitWallet keys on 'delivery:<orderId>'). If the wallet
 * is short and the member has an ACTIVE Paytm AutoPay mandate, the shortfall is
 * covered by executing the mandate (idempotent by order id end to end) and the
 * debit retried — so with AutoPay on, delivered milk is always paid for.
 * Returns the ids that still could not be settled (for callers that want to nudge).
 */
export async function settleDeliveredOrders(orders: Order[]): Promise<string[]> {
  if (!isBackendConfigured()) return [];
  const unsettled: string[] = [];
  for (const o of orders) {
    if (o.status !== 'delivered' || o.payment_method === 'cod') continue;
    try {
      await debitWallet(o.total, 'delivery', o.id);
    } catch {
      // Insufficient balance → AutoPay: execute the mandate for the shortfall
      // (keyed on the order id so a retried sweep can never double-charge),
      // then settle the delivery.
      const covered = await autoSettleTopUp(o.total, `order:${o.id}`).catch(() => false);
      if (covered) {
        try { await debitWallet(o.total, 'delivery', o.id); continue; } catch { /* still short */ }
      }
      unsettled.push(o.id); // retried on next load / manual top-up
    }
  }
  return unsettled;
}

export async function getOrder(id: string): Promise<Order | null> {
  const uid = await requireUserId();
  if (isBackendConfigured()) {
    try {
      return await api.get<Order>(`/orders/${id}`);
    } catch (e) {
      // Only a genuine 404 means "no such order" → null. A timeout / 5xx / network
      // blip must propagate so the tracking screen keeps the last-known order
      // instead of flashing "Order not found" for a live delivery.
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }
  const rows = await getRows<Order>('orders', uid);
  return rows.find((o) => o.id === id) ?? null;
}

export async function cancelOrder(id: string): Promise<void> {
  const uid = await requireUserId();
  if (isBackendConfigured()) { await api.post(`/orders/${id}/cancel`); return; }
  await updateRows<Order>('orders', uid, (o) => o.id === id && ['placed', 'confirmed'].includes(o.status), {
    status: 'cancelled',
  });
}

/** Submit a review for a DELIVERED order (backend) — the review-after-delivery
 *  write. Falls back to a local write when no backend is configured. */
export async function reviewOrder(id: string, rating: number, comment: string): Promise<Order | null> {
  if (isBackendConfigured()) {
    try { return await api.post<Order>(`/orders/${id}/review`, { rating, comment }); } catch { return null; }
  }
  // Local fallback: mark the local order reviewed so the UI dedupes.
  const uid = await requireUserId();
  await updateRows<Order>('orders', uid, (o) => o.id === id, { can_review: false, review: { rating, comment, created_at: new Date().toISOString() } });
  return getOrder(id);
}

/**
 * RIDER BACKDOOR (demo): moves the order OUT FOR DELIVERY and attaches a rider, so
 * you can see the full "order placed → delivery partner assigned" loop end to end.
 * In backend mode this hits the live dev endpoint POST /orders/:id/advance (gated
 * server-side by OTP dev mode) which assigns a demo rider; in local mode it writes
 * the mock order. Either way the tracking screen then shows the assigned rider.
 */
export async function simulateRiderAssignment(orderId: string): Promise<void> {
  if (isBackendConfigured()) { await api.post(`/orders/${orderId}/advance`, { status: 'out_for_delivery' }); return; }
  const uid = await requireUserId();
  const rows = await getRows<Order>('orders', uid);
  const next = rows.map((o) =>
    o.id === orderId ? { ...o, status: 'out_for_delivery' as OrderStatus, rider_id: DEMO_RIDER.id, riders: DEMO_RIDER } : o,
  );
  await setRows<Order>('orders', uid, next);
}

/** DEMO: mark an order delivered so the review-after-delivery flow is testable
 *  without the operator/rider app. Backend mode uses the same dev /advance
 *  endpoint; local mode writes the mock order. (In real production the rider's
 *  own /deliver call owns this transition.) */
export async function simulateDelivered(orderId: string): Promise<void> {
  if (isBackendConfigured()) { await api.post(`/orders/${orderId}/advance`, { status: 'delivered' }); return; }
  const uid = await requireUserId();
  await updateRows<Order>('orders', uid, (o) => o.id === orderId, { status: 'delivered', can_review: true });
}
