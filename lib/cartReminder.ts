import { getUserId } from './session';
import { useCart } from '../store/cart';
import { instantWindow } from './instantHours';
import { CHANNELS, cancelScheduledWhere, notificationsSupported, permissionState, scheduleAt } from './notifications';
import { offersOn } from './taglines';
import { afterQuietHours } from './quietHours';

/**
 * "YOUR CART IS WAITING" — the Zomato-style reminder (founder call, 21 Sep).
 *
 * When the member leaves the app with something in the cart, one reminder is
 * scheduled 30 minutes later:
 *   Your cart is waiting
 *   5 items • ~20 mins • ₹827          [ View Cart ]
 * Coming back to the app cancels it, as does emptying the cart or signing out.
 * Tapping it (or View Cart) opens the cart.
 *
 * Local notification, scheduled by the phone itself: free, no server. Gated
 * like the taglines on the Offers preference and notification permission,
 * and like them it waits out the quiet hours (founder decision 6, 25 Sep): a
 * reminder that would land between 22:00 and 07:00 IST comes at 07:00.
 * No product image: expo-notifications cannot show one on Android at all, and
 * on iOS it needs extra file handling — so the card is text plus the button.
 */

const AFTER_MS = 30 * 60 * 1000;
const isCartReminder = (d: Record<string, unknown>) => d.cartReminder === true;

export async function cancelCartReminder(): Promise<void> {
  await cancelScheduledWhere(isCartReminder);
}

export async function scheduleCartReminder(): Promise<void> {
  try {
    await cancelCartReminder();
    const lines = useCart.getState().lines.filter((l) => !l.outOfStock);
    if (lines.length === 0) return;
    if (!notificationsSupported()) return;
    const uid = await getUserId();
    if (!uid) return;
    if ((await permissionState()) !== 'granted') return;
    if (!(await offersOn(uid))) return;

    const fireAt = afterQuietHours(Date.now() + AFTER_MS);
    const items = lines.reduce((n, l) => n + l.qty, 0);
    const total = lines.reduce((n, l) => n + l.price * l.qty, 0);
    const instant = lines.some((l) => l.lane === 'instant');
    // The store's instant hours at fireAt (the floor when the app has no
    // answer). A pause names no reopening time, so it says closed.
    const win = instantWindow(fireAt);
    const when = instant
      ? win.open ? '~20 mins' : win.opensAtLabel ? `Instant from ${win.opensAtLabel}` : 'Instant closed'
      : 'Tomorrow, 5-7:30 AM';

    await scheduleAt(fireAt, {
      title: 'Your cart is waiting',
      body: `${items} ${items === 1 ? 'item' : 'items'} • ${when} • ₹${Math.round(total)}`,
      channel: CHANNELS.offers,
      href: '/cart',
      category: 'cart',
      identifier: 'cart-reminder',
      data: { cartReminder: true },
    });
  } catch {
    /* a reminder must never break anything */
  }
}
