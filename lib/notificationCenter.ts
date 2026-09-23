import { create } from 'zustand';
import { getRows, insertRow, updateRows, setRows, newId } from './localStore';
import { getUserId } from './session';
import { getCrmInbox, markCrmRead, type CrmInboxItem } from './crm';
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
 *     the moment the member does something.
 *   - CRM rows the backend's campaign engine delivers (GET /crm/inbox). Those
 *     already powered the Messages screen; they now share this feed so a
 *     member has ONE place to look instead of two.
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

function crmKind(category: string | null | undefined): NoticeKind {
  const c = (category ?? '').toLowerCase();
  if (c.includes('order') || c.includes('deliver')) return 'delivery';
  if (c.includes('wallet') || c.includes('recharge') || c.includes('payment')) return 'wallet';
  if (c.includes('offer') || c.includes('campaign') || c.includes('welcome')) return 'offer';
  return 'offer';
}

function fromCrm(m: CrmInboxItem): Notice {
  const body = m.body_en || m.body_hi || '';
  return {
    id: `crm:${m.id}`,
    kind: crmKind(m.category),
    // CRM messages are a single body string; the first sentence makes an
    // honest title and the whole body still shows underneath.
    title: body.split(/(?<=[.!?])\s/)[0]?.slice(0, 72) || 'PYAAS',
    body,
    href: '/inbox',
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
    const crm = (await getCrmInbox()).map(fromCrm);
    const rows = sortAndCap([...local, ...crm]);
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
