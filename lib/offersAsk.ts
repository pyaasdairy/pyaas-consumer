import { getSingle, putSingle } from './localStore';
import { getUserId } from './session';
import { fetchOrders } from './api';
import { offersOn } from './taglines';

/**
 * ASK FOR OFFERS IN CONTEXT (founder decision 5, 25 Sep 2026).
 *
 * Marketing consent starts UNTICKED (DPDP "clear affirmative action", TRAI's
 * promotional rules, Apple's rule on marketing notifications), so signing up
 * never grants offers. Delivery, wallet and order messages are service and
 * keep flowing whatever the member chooses. Instead of a pre-ticked box, the
 * member is asked right after their first delivery lands, when people say yes.
 *
 * This module only decides WHEN to ask and remembers that we did. The prompt
 * is a screen: on "yes" it saves exactly as Message preferences does
 * (components/ConsentSheet useConsents().save, or recordConsents, with
 * `marketing: true` and whichever channels the prompt offers), then calls
 * markOffersAsked('yes'); on "not now" or a dismissal, markOffersAsked with
 * that answer. Asked once per member on this device, never again after any
 * answer. Nothing imports this until that prompt exists.
 */

const TABLE = 'offers_ask';

export type OffersAskAnswer = 'yes' | 'no' | 'dismissed';

type OffersAskRecord = { asked_at: string; answer: OffersAskAnswer };

/**
 * Should the in-context "Send me offers?" prompt show now? True only for a
 * signed-in member who has at least one delivered order, has not granted
 * offers, and has not been asked on this device. Any failure (offline, no
 * session) answers false: the prompt is never shown on a guess.
 */
export async function offersAskDue(): Promise<boolean> {
  try {
    const uid = await getUserId();
    if (!uid) return false;
    if (await getSingle<OffersAskRecord>(TABLE, uid)) return false;
    if (await offersOn(uid)) return false;
    const orders = await fetchOrders();
    return orders.some((o) => o.status === 'delivered');
  } catch {
    return false;
  }
}

/** Record that the member was asked (and what they said), so it never repeats. */
export async function markOffersAsked(answer: OffersAskAnswer): Promise<void> {
  try {
    const uid = await getUserId();
    if (!uid) return;
    await putSingle<OffersAskRecord>(TABLE, uid, { asked_at: new Date().toISOString(), answer });
  } catch {
    /* worst case the prompt shows once more */
  }
}
