import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { parseISO } from './dates';

const LOWBAL_KEY = 'pyaas_lowbal_paused_subs';

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

export async function listSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, product_id, variant, qty, unit_price, frequency, delivery_slot, pay_from_wallet, status, start_date, next_delivery_date')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as Subscription[];
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
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const start = params.startDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: uid,
      product_id: params.productId,
      variant: params.variant,
      qty: params.qty,
      unit_price: params.unitPrice,
      frequency: params.frequency,
      delivery_slot: params.deliverySlot ?? null,
      pay_from_wallet: params.payFromWallet ?? true,
      start_date: start,
      next_delivery_date: start,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function setSubscriptionStatus(id: string, status: Subscription['status']): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function listVacations(): Promise<Vacation[]> {
  const { data, error } = await supabase
    .from('subscription_vacations')
    .select('id, subscription_id, start_date, end_date, reason')
    .order('start_date', { ascending: false });
  if (error) return [];
  return (data ?? []) as Vacation[];
}

export async function addVacation(params: { startDate: string; endDate: string; subscriptionId?: string; reason?: string }): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('subscription_vacations').insert({
    user_id: uid,
    subscription_id: params.subscriptionId ?? null,
    start_date: params.startDate,
    end_date: params.endDate,
    reason: params.reason ?? null,
  });
  if (error) throw error;
}

export async function deleteVacation(id: string): Promise<void> {
  await supabase.from('subscription_vacations').delete().eq('id', id);
}

// ── Wallet gating ────────────────────────────────────────────────────────────
// Deliveries are paid from the prepaid PYAAS wallet (the rider settles each
// delivery via rider_settle_order_from_wallet). So the consumer app enforces two
// rules: you cannot start an order/subscription the wallet cannot cover, and an
// active subscription auto-pauses when the wallet can no longer fund it.

/** What one delivery of a subscription costs (qty × unit price). */
export function perDeliveryCost(s: Pick<Subscription, 'unit_price' | 'qty'>): number {
  return s.unit_price * s.qty;
}

/** Whether the wallet can fund an order/first delivery of `amount` rupees. */
export function canAfford(balance: number, amount: number): boolean {
  return balance >= amount;
}

/**
 * Keep subscriptions in sync with the wallet balance:
 *  - an ACTIVE subscription the wallet can no longer fund (balance < its
 *    per-delivery cost) is paused;
 *  - a subscription WE auto-paused for low balance is resumed once the wallet
 *    can fund it again (e.g. after a top-up).
 * User-paused subscriptions are never touched (we only resume ids we paused).
 * Returns whether any subscription is currently paused for low balance.
 */
export async function reconcileWithBalance(balance: number): Promise<{ lowBalance: boolean; changed: boolean }> {
  const subs = await listSubscriptions();
  let autoPaused: string[] = [];
  try { autoPaused = JSON.parse((await AsyncStorage.getItem(LOWBAL_KEY)) || '[]'); } catch { /* ignore */ }
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
  await AsyncStorage.setItem(LOWBAL_KEY, JSON.stringify([...set]));
  return { lowBalance: set.size > 0, changed };
}
