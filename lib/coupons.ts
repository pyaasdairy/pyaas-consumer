import type { CartLine } from '../store/cart';
import { PRODUCTS, type Category } from '../constants/products';

/**
 * Coupons. Validation logic is client-side against a small local catalog (the
 * app runs offline / pre-backend); when parag-api is live, listCoupons/applyCoupon
 * call GET /coupons and POST /coupons/validate instead, which re-derive and clamp
 * the discount server-side (the client value is only a hint).
 */
export type Coupon = {
  code: string;
  title: string;
  description: string | null;
  kind: 'percent' | 'flat';
  value: number;
  applies_to: 'all' | Category;
  min_items: number;
  min_amount: number;
  max_discount: number | null;
};

// Demo coupons so the checkout coupon field works offline. Replace with the
// parag-api coupons table once the backend is deployed.
const DEMO_COUPONS: Coupon[] = [
  { code: 'PARAG50', title: '₹50 off', description: 'Flat ₹50 off orders over ₹299', kind: 'flat', value: 50, applies_to: 'all', min_items: 0, min_amount: 299, max_discount: null },
  { code: 'MILK10', title: '10% off milk', description: '10% off all milk (max ₹40)', kind: 'percent', value: 10, applies_to: 'milk', min_items: 0, min_amount: 0, max_discount: 40 },
];

export async function listCoupons(): Promise<Coupon[]> {
  return DEMO_COUPONS;
}

function categoryOf(line: CartLine): Category | undefined {
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
  if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
  return Math.round(Math.min(d, amount));
}

/** Look up + validate a coupon code against the cart. */
export async function applyCoupon(code: string, lines: CartLine[]): Promise<{ coupon: Coupon; discount: number }> {
  const coupon = DEMO_COUPONS.find((c) => c.code === code.trim().toUpperCase());
  if (!coupon) throw new Error('Invalid coupon code.');
  const discount = discountFor(coupon, lines);
  return { coupon, discount };
}
