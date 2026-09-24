import { create } from 'zustand';
import { getRows, insertRow, updateRows, setRows, newId } from './localStore';
import { getUserId } from './session';
import { getCrmInbox, markCrmRead, crmCtaRoute, type CrmInboxItem } from './crm';
import { notifyNow, setBadge, CHANNELS, type ChannelId } from './notifications';

/**
 * THE NOTIFICATION CENTRE — one feed for everything the app has to tell a
 * member, and the single place that decides whether an event also becomes an
 * OS notification.
 *
 * Two sources, one list:
 *   - LOCAL rows the app writes itself (an order moving, a delivery landing, a
 *     wallet under the floor, a recharge credited). These exist with no
 *     backend at all, which is why the bell is never empty on a fresh install
 *     the moment the member does something. They are client-generated notices
 *     with no server endpoint, so the local table is their feed cache (capped
 *     at MAX_ROWS) and the dedupe record, not a copy of anything the server
 *     holds.
 *   - CRM rows the backend's campaign engine delivers (GET /crm/inbox). Those
 *     already powered the Messages screen; they now share this feed so a
 *     member has ONE place to look instead of two. The backend also announces
 *     order confirmed / out for delivery / delivered and complaint received /
 *     resolved there, so when the two sources describe one event the local
 *     notice is left out of the merge (dropNoticesTheServerSent).
 *
 * Every write goes through `notify()`, which:
 *   1. drops duplicates by `dedupe` (an order reaching 'out_for_delivery' is
 *      one event no matter how many times a poll observes it),
 *   2. persists the row so the feed survives a relaunch,
 *   3. asks lib/notifications to post it to the OS — which silently declines
 *      when permission is off, so the in-app row is always the source of truth.
 *
 * The unread count drives the header bell and the iOS app-icon badge.
 */

export type NoticeKind = 'order' | 'delivery' | 'wallet' | 'offer' | 'account';

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** In-app route the row opens. */
  href?: string | null;
  created_at: string;
  read_at?: string | null;
  /** One row per real-world event. */
  dedupe?: string | null;
  source: 'local' | 'crm';
};

const TABLE = 'notifications';
/** Keep the feed bounded — a milk app does not need last year's rider updates. */
const MAX_ROWS = 80;

const CHANNEL_FOR: Record<NoticeKind, ChannelId> = {
  order: CHANNELS.orders,
  delivery: CHANNELS.delivery,
  wallet: CHANNELS.wallet,
  offer: CHANNELS.offers,
  account: CHANNELS.wallet,
};

const ICON_FOR: Record<NoticeKind, string> = {
  order: 'bicycle',
  delivery: 'sunny',
  wallet: 'wallet',
  offer: 'gift',
  account: 'person-circle',
};

/** Ionicons name for a row — kept here so every surface renders it the same. */
export function noticeIcon(kind: NoticeKind): string {
  return ICON_FOR[kind] ?? 'notifications';
}

/** The row's kind from its trigger (crm_triggers.json). The inbox `category`
 *  is the consent class (service_implicit, service_explicit, transactional,
 *  promotional), never a topic, so the trigger id's family decides: D- the
 *  delivery lifecycle, B- the wallet and billing, E- complaints and ratings
 *  (as the app's own complaint notice). A promotional row, the Welcome Litre
 *  (W-), Founding Family (FF-) and the rest are offers. */
function crmKind(m: Pick<CrmInboxItem, 'trigger_id' | 'category'>): NoticeKind {
  if ((m.category ?? '').toLowerCase() === 'promotional') return 'offer';
  const id = (m.trigger_id ?? '').toUpperCase();
  if (id.startsWith('D-')) return 'delivery';
  if (id.startsWith('B-')) return 'wallet';
  if (id.startsWith('E-')) return 'account';
  return 'offer';
}

function fromCrm(m: CrmInboxItem): Notice {
  const body = m.body_en || m.body_hi || '';
  return {
    id: `crm:${m.id}`,
    kind: crmKind(m),
    // CRM messages are a single body string; the first sentence makes an
    // honest title and the whole body still shows underneath.
    title: body.split(/(?<=[.!?])\s/)[0]?.slice(0, 72) || 'PYAAS',
    body,
    // Messages was folded into Notifications (founder call, 21 Sep): a campaign
    // row opens its own call to action (Recharge, Track order…), or nothing.
    href: crmCtaRoute(m.cta, m)?.href ?? null,
    created_at: m.created_at,
    read_at: m.read_at ?? null,
    dedupe: `crm:${m.id}`,
    source: 'crm',
  };
}

type State = {
  rows: Notice[];
  unread: number;
  loading: boolean;
  /** Re-read local rows + the CRM inbox and merge. */
  refresh: () => Promise<void>;
  /** Mark everything currently in the feed as read. */
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  /** Wipe on sign-out so the next account never sees the last one's feed. */
  reset: () => void;
};

/** The server's inbox triggers (crm_triggers.json ids) that announce the same
 *  real-world event a local notice's dedupe key names. */
const SERVER_TRIGGERS_FOR: Record<string, string[]> = {
  'order:confirmed': ['D-01'],
  'order:preparing': ['D-02'],
  'order:assigned': ['D-02'],
  'order:out_for_delivery': ['D-02'],
  'order:delivered': ['D-06'],
  // A task that failed or a store cancel turns the order 'cancelled' and
  // sends D-09 (not delivered) for the same order.
  'order:cancelled': ['D-09'],
  complaint: ['E-02', 'E-04', 'E-05'],
};

/** How far apart the two rows for one event may be: the poll that raises the
 *  local notice can run hours after the server emitted its row. */
const SAME_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What a local dedupe key names: the event class (the key of
 *  SERVER_TRIGGERS_FOR) and the order id or complaint ref. */
export function eventOfDedupeKey(dedupe: string | null | undefined): { cls: string; ref: string } | null {
  if (!dedupe) return null;
  const order = /^order:(.+):([a-z_]+)$/.exec(dedupe);
  if (order) return { cls: `order:${order[2]}`, ref: order[1] };
  const complaint = /^complaint:(.+)$/.exec(dedupe);
  if (complaint) return { cls: 'complaint', ref: complaint[1] };
  return null;
}

/**
 * The local notices minus those the server's inbox also announces, so a
 * member never sees the app's own row and the CRM's row for one event. A
 * server row that carries the order id or complaint ref (order_id /
 * complaint_ref, sent by the backend since F19) and announces the same event
 * class is that event outright; a row naming a DIFFERENT order or complaint
 * is never paired. A server row whose text names the ref is the event too.
 * Rows the deployed backend wrote carry neither, so a local notice is
 * otherwise paired with the nearest unpaired server row of the same event
 * class (by trigger id) within SAME_EVENT_WINDOW_MS, one to one. An unpaired
 * local notice stays: the server said nothing about that event.
 */
export function dropNoticesTheServerSent(local: Notice[], inbox: CrmInboxItem[]): Notice[] {
  const server = inbox.map((m) => ({ m, at: Date.parse(m.created_at) || 0, taken: false }));
  const keep: Notice[] = [];
  for (const n of local) {
    const ev = eventOfDedupeKey(n.dedupe);
    if (!ev) { keep.push(n); continue; }
    const triggers = SERVER_TRIGGERS_FOR[ev.cls];
    const refOf = (m: CrmInboxItem): string => (ev.cls === 'complaint' ? m.complaint_ref : m.order_id) ?? '';
    const exact = server.find((s) => !s.taken && refOf(s.m) === ev.ref && !!triggers?.includes(s.m.trigger_id));
    if (exact) { exact.taken = true; continue; }
    // The text names the ref: only for a row of this event class that carries
    // no ref of its own (a row that does was judged by `exact` above). Other
    // rows name orders too, e.g. the B-06 refund after a rider's undo
    // ("delivery <order> reversed"), and are not this event.
    const named = ev.ref.length >= 4
      ? server.find((s) => !s.taken && !s.m.order_id && !s.m.complaint_ref && !!triggers?.includes(s.m.trigger_id)
        && ((s.m.body_en ?? '').includes(ev.ref) || (s.m.body_hi ?? '').includes(ev.ref)))
      : undefined;
    if (named) { named.taken = true; continue; }
    const at = Date.parse(n.created_at) || 0;
    let nearest: (typeof server)[number] | null = null;
    for (const s of server) {
      if (s.taken || !triggers?.includes(s.m.trigger_id)) continue;
      const ref = refOf(s.m);
      if (ref && ref !== ev.ref) continue; // that row is about another order or complaint
      const gap = Math.abs(s.at - at);
      if (gap <= SAME_EVENT_WINDOW_MS && (!nearest || gap < Math.abs(nearest.at - at))) nearest = s;
    }
    if (nearest) { nearest.taken = true; continue; }
    keep.push(n);
  }
  return keep;
}

function sortAndCap(rows: Notice[]): Notice[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const k = r.dedupe || r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, MAX_ROWS);
}

export const useNotifications = create<State>((set, get) => ({
  rows: [],
  unread: 0,
  loading: false,
  refresh: async () => {
    const uid = await getUserId();
    if (!uid) {
      set({ rows: [], unread: 0, loading: false });
      void setBadge(0);
      return;
    }
    set({ loading: true });
    const local = await getRows<Notice>(TABLE, uid).catch(() => [] as Notice[]);
    // CRM degrades to [] on an old backend / offline — never throws.
    const inbox = await getCrmInbox();
    // One row per event: a local notice the server also announced is left
    // out here (its table row stays, as the dedupe record for notify()).
    const rows = sortAndCap([...dropNoticesTheServerSent(local, inbox), ...inbox.map(fromCrm)]);
    const unread = rows.filter((r) => !r.read_at).length;
    set({ rows, unread, loading: false });
    void setBadge(unread);
  },
  markAllRead: async () => {
    const uid = await getUserId();
    const now = new Date().toISOString();
    // Capture the CRM rows that are STILL unread before the optimistic set
    // below stamps every row read; only those are posted. Reading the store
    // after the set found nothing unread and posted every CRM row, on every
    // focus of the notifications screen.
    const unreadCrm = get().rows
      .filter((r) => r.source === 'crm' && !r.read_at)
      .map((r) => r.id.replace(/^crm:/, ''));
    const rows = get().rows.map((r) => (r.read_at ? r : { ...r, read_at: now }));
    set({ rows, unread: 0 });
    void setBadge(0);
    if (uid) {
      await updateRows<Notice>(TABLE, uid, (r) => !r.read_at, { read_at: now }).catch(() => {});
    }
    // CRM keeps its own read state server-side.
    await Promise.all(unreadCrm.map((id) => markCrmRead(id))).catch(() => {});
  },
  markRead: async (id) => {
    const uid = await getUserId();
    const now = new Date().toISOString();
    const rows = get().rows.map((r) => (r.id === id && !r.read_at ? { ...r, read_at: now } : r));
    set({ rows, unread: rows.filter((r) => !r.read_at).length });
    void setBadge(rows.filter((r) => !r.read_at).length);
    if (id.startsWith('crm:')) { await markCrmRead(id.slice(4)); return; }
    if (uid) await updateRows<Notice>(TABLE, uid, (r) => r.id === id, { read_at: now }).catch(() => {});
  },
  reset: () => {
    set({ rows: [], unread: 0, loading: false });
    void setBadge(0);
  },
}));

export type NotifyInput = {
  kind: NoticeKind;
  title: string;
  body: string;
  href?: string;
  /** One row per real-world event — a repeat with the same key is dropped. */
  dedupe?: string;
  /** Skip the OS notification and only write the in-app row. */
  silent?: boolean;
  /** OS notification id: a later notify() with the same id REPLACES it. */
  identifier?: string;
};

/**
 * Record something worth telling the member: writes the in-app row, then (when
 * permission allows) posts it to the OS. Safe to call from a poll loop — the
 * dedupe key makes it idempotent. Never throws.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const uid = await getUserId();
    if (!uid) return; // nothing to attach it to yet
    const existing = await getRows<Notice>(TABLE, uid).catch(() => [] as Notice[]);
    if (input.dedupe && existing.some((r) => r.dedupe === input.dedupe)) return;
    const row: Notice = {
      id: newId('notif'),
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      created_at: new Date().toISOString(),
      read_at: null,
      dedupe: input.dedupe ?? null,
      source: 'local',
    };
    await insertRow<Notice>(TABLE, uid, row);
    // Trim the table so it can't grow without bound across months of use.
    const all = await getRows<Notice>(TABLE, uid).catch(() => [] as Notice[]);
    if (all.length > MAX_ROWS) {
      const keep = [...all].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, MAX_ROWS);
      await setRows<Notice>(TABLE, uid, keep).catch(() => {});
    }
    // Reflect immediately in any mounted feed / bell.
    const merged = sortAndCap([row, ...useNotifications.getState().rows]);
    const unread = merged.filter((r) => !r.read_at).length;
    useNotifications.setState({ rows: merged, unread });
    void setBadge(unread);
    if (!input.silent) {
      void notifyNow({
        title: input.title,
        body: input.body,
        channel: CHANNEL_FOR[input.kind],
        href: input.href,
        identifier: input.identifier,
      });
    }
  } catch {
    /* a notification must never be able to break the flow that raised it */
  }
}

/** Sign-out hook: drop the in-memory feed (rows stay scoped to the old uid). */
export function resetNotificationCenter(): void {
  useNotifications.getState().reset();
}
