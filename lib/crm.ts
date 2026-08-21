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
};

export type CrmOfferView = {
  enrolled: boolean;
  entitled_free_deliveries: number;
  offer?: {
    offer_id: string;
    enrolled_at: string;
    pack1_state: string;
    pack2_state: string;
    subscription_id?: string;
  };
};

/** Route a template CTA onto an app screen; unknown/none → no button. */
export function crmCtaRoute(cta: string | null | undefined): { label: string; href: string } | null {
  switch (cta) {
    case 'recharge':
    case 'recharge_one_tap':
    case 'recharge_or_resume':
      return { label: 'Recharge', href: '/recharge' };
    case 'order':
    case 'complete_order':
    case 'open_app_or_order':
    case 'reorder':
      return { label: 'Shop milk', href: '/(tabs)' };
    case 'track':
    case 'track_live':
      return { label: 'Track order', href: '/(tabs)/orders' };
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
