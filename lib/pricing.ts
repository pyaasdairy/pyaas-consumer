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
// NO FREE MONEY on top-ups: every tier credits exactly what was paid. The tier
// list only powers the quick-pick amount grid; `bonus` stays in the type for
// call-site compatibility but is ALWAYS 0 and rechargeBonus() always returns
// null, so no promo credit is ever granted on a recharge.
export type RechargeTier = { amount: number; bonus: number; kind: 'instant' | 'cashback'; label: string };
export const RECHARGE_TIERS: RechargeTier[] = [
  { amount: 200, bonus: 0, kind: 'instant', label: 'Add ₹200' },
  { amount: 500, bonus: 0, kind: 'instant', label: 'Add ₹500' },
  { amount: 1000, bonus: 0, kind: 'instant', label: 'Add ₹1000' },
  { amount: 10000, bonus: 0, kind: 'instant', label: 'Add ₹10,000' },
];

/** Recharge bonuses are retired: always null (you get exactly what you add). */
export function rechargeBonus(_amount: number): RechargeTier | null {
  return null;
}

export const LOW_BALANCE_THRESHOLD = 200; // ₹ below which we nudge a recharge

/**
 * CRITICAL balance (founder call, 18 Sep): below ₹100 a morning delivery can
 * genuinely fail to settle, so the nudge stops being a pink suggestion and
 * becomes a red one. LOW (< ₹200) stays the soft "top up soon" tier — two
 * tiers, one threshold each, so no screen invents its own number.
 */
export const CRITICAL_BALANCE_THRESHOLD = 100;

/** Which wallet tier a balance sits in. Drives colour + copy everywhere. */
export type BalanceTier = 'critical' | 'low' | 'healthy';
export function balanceTier(balance: number): BalanceTier {
  if (balance < CRITICAL_BALANCE_THRESHOLD) return 'critical';
  if (balance < LOW_BALANCE_THRESHOLD) return 'low';
  return 'healthy';
}

/**
 * MINIMUM RECHARGE (founder call, 18 Sep): ₹500 is the floor for EVERY top-up
 * path — presets, the custom box, a shortfall passed in by a caller. It is the
 * amount that funds a real week of mornings, and it is also the Welcome Litre
 * qualifier, so a member can never half-fund themselves into a paused
 * delivery. Every screen reads this constant; nothing hardcodes 250 or 100.
 */
export const MIN_RECHARGE = 500;

// ── ORDER LIMITS (fair-use; protects launch inventory) ──────────────────────
export const MAX_QTY_PER_PRODUCT = 10; // units of one product per order
export const MAX_ITEMS_PER_ORDER = 30; // total units per order
