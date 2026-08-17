/**
 * SUBSCRIPTION FLOOR — a milk subscription delivers AT LEAST 1 L per day.
 *
 * Founder rule (18 Aug 2026, absolute): "The user can only order 1L milk per
 * day by subscription. Not less than that." A 500 ml pack therefore never
 * subscribes below quantity 2. The rule is about daily MILK volume: non-milk
 * dairy (dahi, paneer, ghee) and SKUs whose volume can't be parsed keep a
 * floor of 1. One-time orders are untouched — the floor binds subscriptions
 * only.
 *
 * Every surface that sets a subscription quantity clamps through
 * {@link minSubscriptionQty}: the subscribe sheet, the subscriptions screen
 * (create AND edit), and the claim funnel's auto-created plan.
 */

const MIN_DAILY_ML = 1000;

type ProductLike = {
  id?: string;
  category?: string;
  variant?: string;
  unit?: string;
  name?: string;
};

/** Pack volume in ml, parsed from unit/variant/name ("500 ml", "1L") — null when unparsable. */
function volumeMlOf(p: ProductLike): number | null {
  const s = `${p.unit ?? ''} ${p.variant ?? ''} ${p.name ?? ''}`.toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(ml|l\b|litre|liter)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === 'ml' ? n : n * 1000;
}

function isMilk(p: ProductLike): boolean {
  // super_tea is chai-special MILK (gstFor already taxes it as milk) — its id
  // and name never say "milk", so without the category it dodged the floor.
  const cat = (p.category ?? '').toLowerCase();
  if (cat === 'milk' || cat === 'super_tea') return true;
  return `${p.id ?? ''} ${p.name ?? ''}`.toLowerCase().includes('milk');
}

/** The lowest quantity a subscription of this product may run at. */
export function minSubscriptionQty(p: ProductLike | null | undefined): number {
  if (!p || !isMilk(p)) return 1;
  const ml = volumeMlOf(p);
  if (!ml) return 1;
  return Math.max(1, Math.ceil(MIN_DAILY_ML / ml));
}
