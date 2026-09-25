/**
 * THE ONE VOICE DELIVERY RULE, as the server bills it.
 *
 * The published rule (pyaas-one-voice.md 1.2; founder, 25 Sep 2026) is ₹5 a
 * delivery below ₹199, free from ₹199, never for a Founding Family member. The
 * server's ₹5 is the ERP's DELIVERY-FEE once the Dolibarr sync has seen it (the
 * stored price with its GST), else FOUNDING_DELIVERY_FEE_PAISE. So the cart
 * quotes the amount the server will bill, the backend sends the rule it bills by
 * (additive `delivery: { fee, free_from }` on GET /serviceability and GET
 * /founding-family) and this module keeps the last answer for the session.
 *
 * Nothing is written to the device. The rule is the same for every account, so
 * it is not keyed by user. With no answer yet (no backend, an older server, the
 * Play reviewer's local verdict) the published ₹5 / ₹199 apply.
 */

/** The published One Voice fee (₹) and free-from line (₹): the fallback. */
export const ONE_VOICE_FEE = 5;
export const ONE_VOICE_FREE_FROM = 199;

export type DeliveryRule = { fee: number; freeFrom: number };

let served: DeliveryRule | null = null;

/**
 * Keep the rule a server response carried (`{ fee, free_from }`). Anything
 * malformed is ignored and the last good answer (or the fallback) stands.
 */
export function rememberDeliveryRule(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as { fee?: unknown; free_from?: unknown };
  const fee = r.fee;
  const freeFrom = r.free_from;
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) return;
  if (typeof freeFrom !== 'number' || !Number.isFinite(freeFrom) || freeFrom <= 0) return;
  served = { fee, freeFrom };
}

/** The rule the next quote uses: the server's last answer, else ₹5 / ₹199. */
export function deliveryRuleNow(): DeliveryRule {
  return served ?? { fee: ONE_VOICE_FEE, freeFrom: ONE_VOICE_FREE_FROM };
}
