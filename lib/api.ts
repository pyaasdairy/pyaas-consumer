import { supabase } from './supabase';
import type { CartLine } from '../store/cart';
import { cartTotals, bundleUnitPrice } from './pricing';
import { getOrderRider } from './saathi';

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
  total: number;
  payment_method: string;
  address_label: string;
  address_text: string;
  rider_id: string | null;
  placed_at: string;
  priority?: string | null;
  delivery_window?: string | null;
  proof_photo_url?: string | null;
  order_items?: OrderItem[];
  riders?: Rider | null;
};

export const DELIVERY_FEE = 15;
export const FREE_DELIVERY_OVER = 199;

export function deliveryFeeFor(subtotal: number): number {
  return subtotal >= FREE_DELIVERY_OVER || subtotal === 0 ? 0 : DELIVERY_FEE;
}

// ── Addresses ────────────────────────────────────────────────────────────────
export async function listAddresses(): Promise<Address[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addAddress(a: Omit<Address, 'id' | 'user_id' | 'created_at'>): Promise<Address> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  // First address becomes default automatically.
  const existing = await listAddresses();
  const is_default = existing.length === 0 ? true : a.is_default;
  if (is_default) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', uid);
  }
  const { data, error } = await supabase
    .from('addresses')
    .insert({ ...a, is_default, user_id: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setDefaultAddress(id: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', uid);
  const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
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
}): Promise<string> {
  const { lines, address, paymentMethod } = params;
  const couponDiscount = params.couponDiscount ?? 0;
  const vipDiscount = params.vipDiscount ?? 0;
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');

  // Bundle-aware subtotal + per-unit charged price.
  const { subtotal } = cartTotals(lines);
  const delivery_fee = deliveryFeeFor(subtotal);
  const total = Math.max(0, subtotal - couponDiscount - vipDiscount) + delivery_fee;
  const address_text = [address.line1, address.line2, address.city, address.pincode]
    .filter(Boolean)
    .join(', ');

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      user_id: uid,
      status: 'placed',
      subtotal,
      delivery_fee,
      total,
      payment_method: paymentMethod,
      address_label: address.label,
      address_text,
      coupon_code: params.couponCode ?? null,
      coupon_discount: couponDiscount,
      vip_discount: vipDiscount,
      delivery_prefs: params.deliveryPrefs ?? null,
      // Set delivery priority/window at INSERT so it doesn't ride on a separate
      // UPDATE (which the orders RLS policy may not permit post-placement).
      priority: params.priority ?? 'normal',
      delivery_window: params.priority === 'vip' ? '05:00-06:00' : '06:00-07:00',
    })
    .select('id')
    .single();
  if (error) throw error;

  const items = lines.map((l) => ({
    order_id: order.id,
    product_id: l.id,
    name: l.name,
    variant: l.variant,
    price: bundleUnitPrice(l.id, l.qty) || l.price,
    qty: l.qty,
  }));
  const { error: itemsErr } = await supabase.from('order_items').insert(items);
  if (itemsErr) throw itemsErr;

  // Record coupon redemption (best-effort). The server re-derives + clamps the
  // discount from the coupon rule and the order subtotal; the client value is
  // only a hint (see redeem_coupon).
  if (params.couponCode && couponDiscount > 0) {
    await supabase.rpc('redeem_coupon', { p_code: params.couponCode, p_order_id: order.id, p_discount: couponDiscount });
  }

  return order.id as string;
}

export async function listOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('placed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), riders(*)')
    .eq('id', id)
    .maybeSingle(); // a missing/RLS-hidden order returns null (→ "Order not found"), not a PGRST116 throw
  if (error) throw error;
  const order = (data ?? null) as Order | null;

  // Saathi sync: riders write their app_users id onto orders.rider_id, so the
  // legacy riders(*) join comes back null. Resolve the live rider (name,
  // phone, vehicle, GPS updated every few seconds) and map it into the same
  // shape the tracking screen already renders.
  if (order?.rider_id && !order.riders) {
    const live = await getOrderRider(order.rider_id);
    if (live) {
      order.riders = {
        id: live.id,
        full_name: live.full_name ?? 'Your rider',
        phone: live.phone ?? '',
        vehicle: live.vehicle,
        rating: live.rating,
        current_lat: live.current_lat,
        current_lng: live.current_lng,
      };
    }
  }
  return order;
}

export async function cancelOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['placed', 'confirmed']);
  if (error) throw error;
}

/**
 * RIDER BACKDOOR (demo): simulates the future rider app claiming this order and
 * heading out for delivery, so you can see the "connected with your rider" UI
 * end to end before the rider app exists. The real rider app will call the same
 * underlying tables/RPCs. Safe to ship; it only acts on the caller's own order.
 */
export async function simulateRiderAssignment(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('simulate_rider_assignment', { p_order_id: orderId });
  if (error) throw error;
}
