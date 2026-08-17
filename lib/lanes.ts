import type { Order } from './api';

/**
 * THE one definition of "this order rides the instant lane". Either signal
 * counts: an explicit `lane: 'instant'` OR the instant-shaped "by HH:MM"
 * delivery window (legacy rows carried lane defaults, backend rows may carry
 * only the window).
 *
 * Every screen MUST use this — the orders list previously required BOTH
 * signals (AND) while the tracking screen accepted EITHER (OR), so a
 * lane-instant order with a legacy window listed under Morning yet opened
 * with the live instant countdown: the exact mixed-lane experience the
 * lane-purity rule exists to prevent, one tap deeper.
 */
export function isInstantOrder(o: Pick<Order, 'lane' | 'delivery_window'>): boolean {
  return o.lane === 'instant' || (o.delivery_window ?? '').trim().toLowerCase().startsWith('by ');
}
