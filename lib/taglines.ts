import { getRows } from './localStore';
import { getUserId } from './session';
import { fetchOrders } from './api';
import { listSubscriptions } from './subscriptions';
import { useCart } from '../store/cart';
import { type ConsentRecord } from '../components/ConsentSheet';
import { isBackendConfigured } from './apiClient';
import { consentMirrorPending, readServerConsents } from './consentSync';
import { CHANNELS, cancelScheduledWhere, notificationsSupported, permissionState, scheduleAt } from './notifications';
import { taglineTimes } from './quietHours';

/**
 * TAGLINE NOTIFICATIONS — the quirky lines from "PYAAS_ app Taglines.pdf",
 * sent to the member every 2 hours in a random order (founder call, 21 Sep),
 * but never between 22:00 and 07:00 IST (founder decision 6, 25 Sep: offers
 * and taglines wait for morning). A full day carries 07:00, 09:00 ... 21:00:
 * 8 lines instead of the 12 the round-the-clock cadence sent (2 AM, 4 AM).
 *
 * COST: nothing. These are LOCAL notifications — the phone's own OS schedules
 * and shows them. No server, no push provider, no per-message fee.
 *
 * WHO GETS WHICH LINE — the PDF's own groups:
 *   - "They only browsed / looked and left" → members who have never ordered
 *     and have no subscription.
 *   - "They added to cart but didn't buy"   → members with something in the cart.
 *   - "Kinda chic" trend                     → everyone.
 * A line is only picked from a group that is true for the member, so nobody
 * with an empty cart is told their cart is lonely.
 *
 * HOW: every time the app goes to the background (and at launch) the pending
 * taglines are cancelled and the next 3 days are re-scheduled, one every 2
 * hours outside the quiet hours (lib/quietHours: a time that lands in them
 * moves to 07:00 IST and the cadence runs on from there), from the groups
 * that apply at that moment. iOS allows 64 pending notifications per app; 3
 * days is about 24 lines, capped at 36, which leaves room for everything else.
 * A member who does not open the app for 3 days stops receiving them until
 * they return.
 *
 * GATES: the member's "Offers and updates" preference must be on and the OS
 * notification permission granted. Turning Offers off cancels them at once.
 */

const BROWSED = [
  'Bas dekh ke chale gaye? Hum itne bhi bure nahi.',
  'Aapne PYAAS dekha. PYAAS ne aapko yaad kiya.',
  'Doodh dekhne aaye the ya dil churane?',
  'Ek baar aur dekh lo. Is baar dil se.',
  'Aap gaye, par PYAAS abhi yahin hai.',
  'PYAAS ko ignore karna itna easy nahi hai.',
  'Aapne dekha. Humne notice kiya.',
  'Itna handsome doodh, bas dekhne ke liye nahi hai.',
  'Scroll karna tha, doodh nahi chhodna tha.',
  'Aapki PYAAS abhi poori nahi hui.',
  'Window shopping se breakfast nahi banta.',
  'Doodh dekha. Ab doodh ghar bhi bula lo.',
];

const CART = [
  'Cart mein daala tha… rishta tod thodi diya?',
  'Aapka doodh abhi bhi aapka wait kar raha hai.',
  'Cart lonely hai. Aap bhi?',
  'Doodh pasand aaya. Payment se kya dushmani?',
  'Aapne haan toh bol di… ab shaadi kab hai?',
  'Cart mein PYAAS hai. Bas checkout ki kami hai.',
  'Aapka cart: “Bhai, mujhe ghar le chalo.”',
  'Itna sochoge toh doodh bhi overthink karega.',
  'Add kiya. Dekha. Chhod diya. Kya hua?',
  'Cart mein doodh, dil mein doubt?',
  'PYAAS ko cart mein chhodna allowed nahi hai.',
  'Wapas aao. Doodh thanda ho raha hai.',
];

const TRENDS = [
  'Kinda chic to have milk waiting in the fridge.',
  'Kinda chic to not run out of milk at 8 AM.',
  'Kinda chic to have your breakfast sorted.',
];

const EVERY_MS = 2 * 60 * 60 * 1000; // every 2 hours, 07:00-22:00 IST only
const HORIZON_MS = 3 * 24 * 60 * 60 * 1000; // 3 days ahead
const SLOTS = 36; // a hard cap inside iOS's 64-pending limit (3 days is about 24)

const isTagline = (data: Record<string, unknown>) => data.tagline === true;

/** Cancel every pending tagline (sign-out, Offers switched off). */
export async function cancelTaglines(): Promise<void> {
  await cancelScheduledWhere(isTagline);
}

/** Is the member's "Offers and updates" preference on? Backend mode: the
 *  server's consent record (GET /users/me/consents) decides; the local rows
 *  answer only while the route is not deployed or a recorded choice is still
 *  waiting to reach the server. A server that cannot be asked, or an empty
 *  local table, is "not granted": a marketing line is never sent on a
 *  default. */
export async function offersOn(uid: string): Promise<boolean> {
  if (isBackendConfigured()) {
    const pending = await consentMirrorPending().catch(() => false);
    if (!pending) {
      try {
        const server = await readServerConsents();
        if (server.deployed) return !!server.choices?.marketing;
      } catch {
        return false;
      }
    }
  }
  const rows = await getRows<ConsentRecord>('consents', uid).catch(() => [] as ConsentRecord[]);
  if (rows.length === 0) return false;
  rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  return !!rows[0].choices?.marketing;
}

/** Fisher-Yates — a fresh random order each pass through the pool. */
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let running: Promise<void> | null = null;

/**
 * Re-plan the next 3 days of taglines from the member's state right now.
 * Idempotent and safe to call often; overlapping calls share one run.
 */
export function rescheduleTaglines(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      await cancelTaglines();
      if (!notificationsSupported()) return;
      const uid = await getUserId();
      if (!uid) return;
      if ((await permissionState()) !== 'granted') return;
      if (!(await offersOn(uid))) return;

      const hasCart = useCart.getState().lines.length > 0;
      // A read, never listOrders: that one runs the wallet settle sweep, and
      // this planner runs on every backgrounding.
      const orders = await fetchOrders().catch(() => null);
      const subs = await listSubscriptions().catch(() => []);
      const hasSub = subs.some((s) => s.status === 'active' || s.status === 'paused');
      // Unknown order history (offline) → do not assume they only browsed.
      const onlyBrowsed = orders !== null && orders.length === 0 && !hasSub;

      const pool: { body: string; href: string }[] = [
        ...TRENDS.map((body) => ({ body, href: '/(tabs)' })),
        ...(onlyBrowsed ? BROWSED.map((body) => ({ body, href: '/(tabs)' })) : []),
        ...(hasCart ? CART.map((body) => ({ body, href: '/cart' })) : []),
      ];

      // When: every 2 hours for 3 days, never in the quiet hours.
      const times = taglineTimes(Date.now(), EVERY_MS, HORIZON_MS, SLOTS);

      // Random order: shuffle the pool, walk it, reshuffle when it runs out,
      // never showing the same line twice in a row across a reshuffle.
      const plan: { body: string; href: string }[] = [];
      let deck = shuffled(pool);
      while (plan.length < times.length) {
        if (deck.length === 0) {
          deck = shuffled(pool);
          if (deck.length > 1 && deck[0].body === plan[plan.length - 1]?.body) deck.push(deck.shift()!);
        }
        plan.push(deck.shift()!);
      }

      for (let i = 0; i < plan.length; i += 1) {
        await scheduleAt(times[i], {
          title: 'PYAAS',
          body: plan[i].body,
          channel: CHANNELS.offers,
          href: plan[i].href,
          data: { tagline: true },
        });
      }
    } catch {
      /* a marketing line must never break anything */
    } finally {
      running = null;
    }
  })();
  return running;
}
