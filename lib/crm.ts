import { useSyncExternalStore } from 'react';
import { api, isBackendConfigured, HttpError } from './apiClient';

/**
 * CRM (Welcome Litre) — the consumer-side seam for the backend's campaign
 * engine. Three read-mostly endpoints, all mounted under the same consumer
 * base URL the rest of the app uses:
 *
 *   GET  /crm/inbox            → CrmInboxItem[] (newest first, max 50)
 *   POST /crm/inbox/{id}/read  → { ok: true }
 *   GET  /crm/offer            → CrmOfferView
 *
 * DEFENSIVE BY CONSTRUCTION: the deployed backend may predate CRM (routes
 * 404), have CRM_ENABLED off (inbox []/offer {enrolled:false}), or be
 * unreachable. Every function here degrades to "nothing to show" — never a
 * thrown error, never a spinner a screen has to babysit. The app must render
 * pixel-identically to the pre-CRM build for every customer who has no
 * campaign state; only enrolled households with real messages see anything.
 */

export type CrmInboxItem = {
  id: string;
  trigger_id: string;
  category: string;
  body_en: string;
  body_hi: string;
  cta: string | null;
  created_at: string;
  read_at?: string | null;
  /** The order / complaint reference the message is about (backend F19).
   *  Absent on rows the deployed backend wrote and on scheduled messages. */
  order_id?: string;
  complaint_ref?: string;
};

export type CrmOfferView = {
  enrolled: boolean;
  entitled_free_deliveries: number;
  offer?: {
    offer_id: string;
    enrolled_at: string;
    pack1_state: string;
    pack2_state: string;
    /** Server-computed REAL deadline while pack 2 is locked (§16: real urgency
     *  only): the last recharge day and whole days remaining. Absent otherwise. */
    pack2_recharge_by?: string;
    pack2_days_left?: number;
    subscription_id?: string;
  };
};

/** Route a template CTA (crm_triggers.json `cta`) onto an app screen;
 *  unknown/none, and the reply-only CTAs (reply_yes, approve_yes_no…), → no
 *  route. `about` is the row's own order / complaint (backend F19): a track or
 *  rate CTA opens that order when the row names one. */
export function crmCtaRoute(
  cta: string | null | undefined,
  about?: Pick<CrmInboxItem, 'order_id' | 'complaint_ref'>,
): { label: string; href: string } | null {
  const orderHref = about?.order_id ? `/order/${about.order_id}` : null;
  switch (cta) {
    case 'recharge':
    case 'recharge_one_tap':
    case 'recharge_or_resume':
    case 'retry_payment': // B-03: the recharge did not go through
      return { label: 'Recharge', href: '/recharge' };
    case 'order':
    case 'complete_order':
    case 'open_app_or_order':
    case 'reorder':
    case 'open_shop': // FF-01: the farm unlocked
      return { label: 'Shop milk', href: '/(tabs)' };
    case 'track':
    case 'track_live':
      return { label: 'Track order', href: orderHref ?? '/(tabs)/orders' };
    case 'rate': // D-06 "Tap to rate", W-05; E-06 closes a complaint
      if (orderHref) return { label: 'Rate', href: orderHref };
      if (about?.complaint_ref) return { label: 'Complaints', href: '/complaints' };
      return { label: 'Orders', href: '/(tabs)/orders' };
    case 'tell_us': // E-01: after a low rating
    case 'choose_fix': // E-04: redeliver or refund
      return { label: 'Complaints', href: '/complaints' };
    case 'get_help_or_order': // A-06: help placing the first order
      return { label: 'Help', href: '/support' };
    case 'open_founding_family': // FF-02: you are in
    case 'share_founding_link': // FF-03: your seat is held, share your link
      return { label: 'Founding Family', href: '/(tabs)/vip' };
    case 'refer':
      return { label: 'Refer a friend', href: '/refer' };
    default:
      return null;
  }
}

/** Inbox, newest first. Empty on ANY failure — old backend, CRM off, offline. */
export async function getCrmInbox(): Promise<CrmInboxItem[]> {
  if (!isBackendConfigured()) return [];
  try {
    const rows = await api.get<CrmInboxItem[]>('/crm/inbox');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Mark one message read. Fire-and-forget; the list re-fetch is the truth. */
export async function markCrmRead(id: string): Promise<void> {
  if (!isBackendConfigured() || !id) return;
  try {
    await api.post(`/crm/inbox/${encodeURIComponent(id)}/read`);
  } catch {
    /* best-effort — an unread badge that lingers beats a crash */
  }
}

/** Campaign state for this account. Null on ANY failure (treated as "none"). */
export async function getCrmOffer(): Promise<CrmOfferView | null> {
  if (!isBackendConfigured()) return null;
  try {
    const v = await api.get<CrmOfferView>('/crm/offer');
    return v && typeof v.enrolled === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

// ── Unread-count store (deliveryMode.ts pattern: module state + subscribe) ──
// The HomeHeader bell reads this; refreshCrmUnread() is called from the home
// screen's focus effect and after the inbox marks things read. No timers here:
// screens own WHEN to refresh, this store owns the value.

let unread = 0;
const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}

export function getCrmUnread(): number {
  return unread;
}

export function useCrmUnread(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getCrmUnread,
    getCrmUnread,
  );
}

/**
 * Re-count unread from the server. Two failure classes, two behaviours:
 *   - AUTHORITATIVE empties (signed out 401/403, route absent 404, backend
 *     not configured) → count is 0: the bell must clear for the next account
 *     on this device, and never show against a backend that has no inbox.
 *   - TRANSIENT failures (network blip, 5xx) → keep the last known count:
 *     a real unread message must not vanish because one poll dropped.
 */
export async function refreshCrmUnread(): Promise<void> {
  let next = unread;
  if (!isBackendConfigured()) {
    next = 0;
  } else {
    try {
      const rows = await api.get<CrmInboxItem[]>('/crm/inbox');
      next = Array.isArray(rows) ? rows.filter((r) => !r.read_at).length : 0;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 401 || e.status === 403 || e.status === 404)) {
        next = 0; // authoritative: no session / no CRM on this backend
      } // else: transient — keep the current value
    }
  }
  if (next !== unread) {
    unread = next;
    emit();
  }
}

// ── Welcome Litre funnel (SERVER-TRUTH — no local funnel state, ever) ────────

/** The five funnel states GET /crm/eligibility can answer. */
export type WelcomeFunnelState =
  | 'eligible'          // show the offer funnel
  | 'already_enrolled'  // show the offer progress card instead of any pitch
  | 'not_eligible'      // existing/paying household — no funnel at all
  | 'address_required'  // funnel visible; CTA routes to address capture first
  | 'not_serviceable';  // funnel visible; CTA routes to the waitlist

/**
 * The single source of funnel truth. Returns null when the backend does not
 * speak CRM (deployed pre-CRM backend → 404, offline, local mode) — null
 * means "this build's Welcome Litre funnel does not exist here", and the
 * legacy pitch rules apply unchanged. NEVER cached to storage: a reinstall,
 * a second device and an existing customer all re-ask the server.
 */
export async function getWelcomeFunnelState(): Promise<WelcomeFunnelState | null> {
  if (!isBackendConfigured()) return null;
  try {
    const r = await api.get<{ status: WelcomeFunnelState }>('/crm/eligibility');
    return r?.status ?? null;
  } catch {
    return null; // 404 / offline / old backend — the funnel simply is not here
  }
}

export type WelcomePlan = {
  plan_product_id?: string; // gold-500ml | gold-1l | taaza-500ml | taaza-1l
  plan_qty?: number;
  plan_frequency?: 'daily' | 'alternate';
};

/**
 * Start the Welcome Litre (offer terms §3.1 — no payment, no wallet balance).
 * The server creates the subscription + the ₹0 first-pack order and sends
 * W-01 to the inbox; the caller only needs to refresh its views. Errors
 * bubble typed codes (ADDRESS_REQUIRED / NOT_SERVICEABLE / NOT_ELIGIBLE /
 * ALREADY_ENROLLED / BELOW_MILK_FLOOR) for the screen to route on.
 */
export async function startWelcomeLitre(plan: WelcomePlan = {}): Promise<{
  subscription_id: string;
  pack1_order_id: string;
  pack1_scheduled_for: string;
}> {
  const res = await api.post<{
    subscription_id: string;
    pack1_order_id: string;
    pack1_scheduled_for: string;
  }>('/crm/enrol/self', plan);
  // The server-created plan shows on the next subscription read, and the bell lights.
  try {
    const { invalidateSubscriptionCache } = await import('./subscriptions');
    invalidateSubscriptionCache();
  } catch { /* the next home focus refreshes anyway */ }
  void refreshCrmUnread();
  return res;
}
