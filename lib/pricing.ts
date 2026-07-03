/**
 * PYAAS pricing & offers - single source of truth for VIP pricing, buy-more
 * bundle discounts, and wallet recharge bonus tiers. Checkout, the VIP
 * comparison chart and (server-side) settlement should all read from here so
 * the customer-facing numbers and the charged numbers agree.
 *
 * Prices are placeholders the founder said will be revised - tweak freely.
 */
import { PRODUCTS, type Product } from '../constants/products';

// ── VIP ─────────────────────────────────────────────────────────────────────
export const VIP_PRICE_PER_MONTH = 99;
/** Founding-launch offer: 120 days of VIP, free, no card needed. */
export const VIP_TRIAL_DAYS = 120;
/** Flat VIP discount across the catalog (placeholder; can be per-product later). */
export const VIP_DISCOUNT = 0.12;

export function vipPrice(p: Pick<Product, 'price'>): number {
  return Math.round(p.price * (1 - VIP_DISCOUNT));
}

/** ₹ a VIP saves on a given cart (sum of per-unit savings). */
export function vipSavings(lines: { price: number; qty: number }[]): number {
  return lines.reduce((s, l) => s + (l.price - Math.round(l.price * (1 - VIP_DISCOUNT))) * l.qty, 0);
}

// ── BUNDLES (buy-more-save-more) ─────────────────────────────────────────────
// Ghee ×4 → ₹799/jar (from ₹1099) = ₹1200 off the pack. The same ~27% ratio is
// applied to other items when bought in packs of 4 (prices to be revised).
export const BUNDLE_PACK_SIZE = 4;
const GHEE_BUNDLE_RATIO = 799 / 1099; // ≈ 0.727 → ~27% off

/** Explicit per-product bundle unit prices (override the generic ratio). */
const BUNDLE_OVERRIDES: Record<string, number> = {
  ghee: 799,
};

/** Effective unit price for `qty` of a product, applying pack-of-4 bundle pricing. */
export function bundleUnitPrice(productId: string, qty: number): number {
  const p = PRODUCTS.find((x) => x.id === productId);
  if (!p) return 0;
  if (qty < BUNDLE_PACK_SIZE) return p.price;
  return BUNDLE_OVERRIDES[productId] ?? Math.round(p.price * GHEE_BUNDLE_RATIO);
}

/** ₹ saved by hitting the bundle threshold for a line. */
export function bundleSavings(productId: string, qty: number): number {
  const p = PRODUCTS.find((x) => x.id === productId);
  if (!p || qty < BUNDLE_PACK_SIZE) return 0;
  return (p.price - bundleUnitPrice(productId, qty)) * qty;
}

/** Bundle-aware cart totals - used by cart, checkout and order placement. */
export function cartTotals(lines: { id: string; price: number; qty: number }[]): {
  subtotal: number;
  bundleSaved: number;
} {
  let subtotal = 0;
  let bundleSaved = 0;
  for (const l of lines) {
    const unit = bundleUnitPrice(l.id, l.qty) || l.price;
    subtotal += unit * l.qty;
    bundleSaved += (l.price - unit) * l.qty;
  }
  return { subtotal, bundleSaved: Math.max(0, Math.round(bundleSaved)) };
}

// ── WALLET RECHARGE TIERS (mirror of public.recharge_tiers) ──────────────────
// Server is the source of truth (recharge_tiers table); this mirror is for
// instant UI without a round-trip. Keep in sync with the SQL seed.
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

export const REFERRAL_REWARD = 100; // ₹ to referrer per successful signup
export const LOW_BALANCE_THRESHOLD = 200; // ₹ below which we nudge a recharge

// ── ORDER LIMITS (fair-use; protects launch inventory) ──────────────────────
export const MAX_QTY_PER_PRODUCT = 10; // units of one product per order
export const MAX_ITEMS_PER_ORDER = 30; // total units per order

// ── AUTOPAY (PYAAS MONEY) selling points ─────────────────────────────────────
export const AUTOPAY_BENEFITS = [
  'Hassle-free recharge',
  'Pause / cancel anytime',
  '24-hour prior notification',
];
