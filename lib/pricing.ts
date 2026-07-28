/**
 * PYAAS pricing helpers - cart totals, wallet recharge bonus tiers and fair-use
 * order limits. Catalog prices themselves live in constants/products.ts (and,
 * once live, in the parag-api products table). No bundle or membership discounts
 * in this app: paragdairy.com shows MRP == offer price on every SKU, so the cart
 * simply sums the listed prices.
 */

/** Bundle-free cart totals. Kept as a helper so checkout/order placement share
 *  one code path. bundleSaved is always 0 (no buy-more discounts). */
export function cartTotals(lines: { id: string; price: number; qty: number }[]): {
  subtotal: number;
  bundleSaved: number;
} {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  return { subtotal, bundleSaved: 0 };
}

// ── WALLET RECHARGE TIERS ────────────────────────────────────────────────────
// Instant bonus when the customer tops up their PYAAS wallet. Kept in sync with
// the parag-api wallet recharge logic when the backend is live.
export type RechargeTier = { amount: number; bonus: number; kind: 'instant' | 'cashback'; label: string };
export const RECHARGE_TIERS: RechargeTier[] = [
  { amount: 200, bonus: 50, kind: 'instant', label: 'Add ₹200 · ₹50 free' },
  { amount: 500, bonus: 100, kind: 'instant', label: 'Add ₹500 · ₹100 free' },
  { amount: 1000, bonus: 250, kind: 'instant', label: 'Add ₹1000 · ₹250 free' },
  { amount: 10000, bonus: 1000, kind: 'cashback', label: 'Add ₹10,000 · ₹1,000 cashback' },
];

/** Bonus for an arbitrary custom recharge amount (picks the best tier met). */
export function rechargeBonus(amount: number): RechargeTier | null {
  return [...RECHARGE_TIERS].reverse().find((t) => amount >= t.amount) ?? null;
}

export const LOW_BALANCE_THRESHOLD = 200; // ₹ below which we nudge a recharge

// ── ORDER LIMITS (fair-use; protects launch inventory) ──────────────────────
export const MAX_QTY_PER_PRODUCT = 10; // units of one product per order
export const MAX_ITEMS_PER_ORDER = 30; // total units per order
