import { supabase } from './supabase';
import type { CartLine } from '../store/cart';
import { PRODUCTS } from '../constants/products';

export type Coupon = {
  code: string;
  title: string;
  description: string | null;
  kind: 'percent' | 'flat' | 'bundle_price';
  value: number;
  applies_to: 'all' | 'milk' | 'ghee';
  min_items: number;
  min_amount: number;
  max_discount: number | null;
  is_golden: boolean;
};

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('code, title, description, kind, value, applies_to, min_items, min_amount, max_discount, is_golden')
    .eq('active', true)
    .order('is_golden', { ascending: false });
  if (error) return [];
  return (data ?? []) as Coupon[];
}

function categoryOf(line: CartLine): 'milk' | 'ghee' | undefined {
  return PRODUCTS.find((p) => p.id === line.id)?.category;
}

/** Items + subtotal that a coupon's `applies_to` scope covers. */
function scope(lines: CartLine[], appliesTo: Coupon['applies_to']) {
  const inScope = appliesTo === 'all' ? lines : lines.filter((l) => categoryOf(l) === appliesTo);
  const items = inScope.reduce((n, l) => n + l.qty, 0);
  const amount = inScope.reduce((s, l) => s + l.price * l.qty, 0);
  return { items, amount };
}

/** Compute the discount a coupon yields for a cart. Throws if not eligible. */
export function discountFor(coupon: Coupon, lines: CartLine[]): number {
  const { items, amount } = scope(lines, coupon.applies_to);
  if (coupon.min_items && items < coupon.min_items) {
    throw new Error(`Add ${coupon.min_items - items} more item(s) to use ${coupon.code}.`);
  }
  if (coupon.min_amount && amount < coupon.min_amount) {
    throw new Error(`Spend ₹${coupon.min_amount} to use ${coupon.code}.`);
  }
  let d = 0;
  if (coupon.kind === 'percent') d = (amount * coupon.value) / 100;
  else if (coupon.kind === 'flat') d = coupon.value;
  else if (coupon.kind === 'bundle_price') d = 0; // handled by bundle pricing, not coupons
  if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
  return Math.round(Math.min(d, amount));
}

/** Look up + validate a coupon code against the cart. */
export async function applyCoupon(code: string, lines: CartLine[]): Promise<{ coupon: Coupon; discount: number }> {
  const { data, error } = await supabase
    .from('coupons')
    .select('code, title, description, kind, value, applies_to, min_items, min_amount, max_discount, is_golden')
    .eq('code', code.trim().toUpperCase())
    .eq('active', true)
    .maybeSingle();
  if (error || !data) throw new Error('Invalid coupon code.');
  const coupon = data as Coupon;
  const discount = discountFor(coupon, lines);
  return { coupon, discount };
}
