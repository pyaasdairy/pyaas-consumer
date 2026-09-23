import { create } from 'zustand';
import { api, isBackendConfigured } from './apiClient';
import { getRows, insertRow, deleteRows, newId } from './localStore';
import { getUserId } from './session';
import { notify } from './notificationCenter';
import { emailCare } from './support';
import { uploadPhoto } from './uploads';

/**
 * COMPLAINT REGISTER — the in-app grievance desk.
 *
 * Until now "raise a complaint" opened the member's email app and hoped: no
 * reference number, no status, nothing either side could point at later. A
 * dairy taking money daily needs a register, and the Consumer Protection
 * (E-commerce) Rules expect a traceable grievance trail with a ticket the
 * customer can quote.
 *
 * HOW IT BEHAVES:
 *   - Filing always succeeds from the member's point of view. The row is
 *     written on-device with a human reference (PYS-XXXXX) and shown
 *     immediately in "My complaints".
 *   - With a backend it POSTs to /consumer/complaints. Once the server has
 *     the row the local copy is DELETED: the local table is an offline
 *     OUTBOX (rows with backend_id null), never a mirror of the register.
 *     The server's rows lead on every refresh; a failed GET keeps the last
 *     fetched server rows on screen with an error, and only outbox rows are
 *     ever added from the device.
 *   - Without one (or on a failure) the row is marked `queued` and retried on
 *     the next refresh, and the member is told plainly that it is waiting to
 *     reach the team, with a one-tap email escalation that carries the same
 *     reference.
 *
 * BACKEND CONTRACT (co-dev — see the handoff):
 *   POST /consumer/complaints { ref, category, order_id?, detail, photo_uri? }
 *        → { id, ref, status, created_at }
 *   GET  /consumer/complaints → [{ id, ref, category, order_id, detail,
 *        status, resolution, created_at, updated_at }]
 *   Statuses: open | in_review | resolved | closed.
 */

export type ComplaintCategory =
  | 'missing'
  | 'quality'
  | 'late'
  | 'payment'
  | 'rider'
  | 'app'
  | 'other';

export type ComplaintStatus = 'queued' | 'open' | 'in_review' | 'resolved' | 'closed';

export type Complaint = {
  id: string;
  /** Human reference the member can quote on a call. */
  ref: string;
  category: ComplaintCategory;
  order_id?: string | null;
  detail: string;
  photo_uri?: string | null;
  status: ComplaintStatus;
  resolution?: string | null;
  created_at: string;
  updated_at: string;
  /** Server-side twin id once it lands. */
  backend_id?: string | null;
};

// Labels are short on purpose: they sit in a two-column chip grid that has to
// hold on a 320dp screen, where "Problem with the app" ellipsized to
// "Problem wit…" (caught on the emulator, 18 Sep). The chips also wrap to two
// lines, so these read in full at every width.
export const COMPLAINT_CATEGORIES: { key: ComplaintCategory; label: string; icon: string }[] = [
  { key: 'missing', label: 'Not delivered', icon: 'bag-remove-outline' },
  { key: 'quality', label: 'Milk quality', icon: 'flask-outline' },
  { key: 'late', label: 'Delivered late', icon: 'time-outline' },
  { key: 'payment', label: 'Wallet or payment', icon: 'card-outline' },
  { key: 'rider', label: 'Rider', icon: 'person-outline' },
  { key: 'app', label: 'App problem', icon: 'phone-portrait-outline' },
  { key: 'other', label: 'Something else', icon: 'help-circle-outline' },
];

export function categoryLabel(key: ComplaintCategory): string {
  return COMPLAINT_CATEGORIES.find((c) => c.key === key)?.label ?? 'Complaint';
}

export const STATUS_COPY: Record<ComplaintStatus, { label: string; sub: string }> = {
  queued: { label: 'Waiting to send', sub: 'Saved on your phone. It goes to our team the moment you are back online.' },
  open: { label: 'Registered', sub: 'Our team has it and will look into it.' },
  in_review: { label: 'Being looked into', sub: 'Someone is working on this right now.' },
  resolved: { label: 'Resolved', sub: 'We have closed this one. Reopen it by filing again if it is still wrong.' },
  closed: { label: 'Closed', sub: 'This complaint is closed.' },
};

const TABLE = 'complaints';

/** PYS-4F7KQ — short, unambiguous on a phone call (no O/0/I/1). */
function makeRef(): string {
  const alphabet = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `PYS-${out}`;
}

type WireComplaint = {
  id?: string;
  ref?: string;
  category?: string;
  order_id?: string | null;
  detail?: string;
  status?: string;
  resolution?: string | null;
  created_at?: string;
  updated_at?: string;
};

function normalizeStatus(s: string | undefined): ComplaintStatus {
  const v = (s ?? '').toLowerCase();
  if (v === 'in_review' || v === 'in-review' || v === 'reviewing') return 'in_review';
  if (v === 'resolved') return 'resolved';
  if (v === 'closed') return 'closed';
  if (v === 'queued') return 'queued';
  return 'open';
}

async function postComplaint(c: Complaint): Promise<string | null> {
  if (!isBackendConfigured()) return null;
  // Contract C4: a device file:// path is useless to the operator. Upload the
  // photo and send its file_url; when that is not possible (older backend
  // without presign, offline, rejected PUT) send no photo at all.
  const photo = await uploadPhoto('complaint_photo', c.photo_uri);
  const res = await api.post<WireComplaint>('/complaints', {
    ref: c.ref,
    category: c.category,
    order_id: c.order_id ?? undefined,
    detail: c.detail,
    photo_uri: photo ?? undefined,
  });
  return res?.id ?? null;
}

/**
 * File a complaint. Never throws: the local row is the promise we can keep.
 * Returns the row so the screen can show the reference straight away.
 */
export async function fileComplaint(input: {
  category: ComplaintCategory;
  detail: string;
  orderId?: string | null;
  photoUri?: string | null;
}): Promise<Complaint> {
  const now = new Date().toISOString();
  const row: Complaint = {
    id: newId('cmp'),
    ref: makeRef(),
    category: input.category,
    order_id: input.orderId ?? null,
    detail: input.detail.trim(),
    photo_uri: input.photoUri ?? null,
    status: 'queued',
    resolution: null,
    created_at: now,
    updated_at: now,
    backend_id: null,
  };
  const uid = await getUserId();
  // The outbox row goes in first so a dead network cannot lose the complaint.
  if (uid) await insertRow<Complaint>(TABLE, uid, row).catch(() => {});
  // Try the server immediately; a failure leaves it queued for the next refresh.
  try {
    const backendId = await postComplaint(row);
    if (backendId) {
      row.backend_id = backendId;
      row.status = 'open';
      // The server has it now: the outbox row is deleted, not kept as a mirror.
      if (uid) await deleteRows<Complaint>(TABLE, uid, (r) => r.id === row.id).catch(() => {});
    }
  } catch {
    /* stays queued */
  }
  await notify({
    kind: 'account',
    title: `Complaint ${row.ref} registered`,
    body: `${categoryLabel(row.category)}. ${STATUS_COPY[row.status].sub}`,
    href: '/complaints',
    dedupe: `complaint:${row.id}`,
    silent: true, // the member is looking at the screen that raised it
  });
  await useComplaints.getState().refresh();
  return row;
}

/** Email escalation that carries the same reference the register shows. */
export function escalateByEmail(c: Complaint): Promise<boolean> {
  return emailCare(
    `PYAAS complaint ${c.ref} · ${categoryLabel(c.category)}`,
    `Reference: ${c.ref}\nCategory: ${categoryLabel(c.category)}\n${c.order_id ? `Order: ${c.order_id}\n` : ''}Raised: ${new Date(c.created_at).toLocaleString('en-IN')}\n\n${c.detail}\n\nSent from the PYAAS app`,
  );
}

type State = {
  rows: Complaint[];
  loading: boolean;
  /** Set when the register could not be read; the rows shown are the last
   *  fetched server rows plus the outbox. */
  error: string | null;
  /** The account the rows belong to, so a failed GET after an account switch
   *  never keeps the previous member's rows on screen. */
  forUid: string | null;
  refresh: () => Promise<void>;
};

const REGISTER_UNREACHABLE = 'Could not reach the complaints register. Showing what is saved on this phone.';

/**
 * The register. Server rows lead (they carry the real status); the local
 * table is only the OUTBOX (rows with backend_id null), replayed on every
 * refresh so a complaint filed on a dead network still gets there, and
 * deleted the moment the server accepts it.
 */
export const useComplaints = create<State>((set, get) => ({
  rows: [],
  loading: false,
  error: null,
  forUid: null,
  refresh: async () => {
    const uid = await getUserId();
    if (!uid) { set({ rows: [], loading: false, error: null, forUid: null }); return; }
    set({ loading: true });

    // Replay the outbox: a row the server accepts is deleted here (the server
    // has it now); one it still cannot take stays queued for the next refresh.
    // Only rows that never synced are ever posted.
    const outbox = (await getRows<Complaint>(TABLE, uid).catch(() => [] as Complaint[])).filter((r) => !r.backend_id);
    for (const q of outbox) {
      try {
        const id = await postComplaint(q);
        if (id) await deleteRows<Complaint>(TABLE, uid, (r) => r.id === q.id).catch(() => {});
      } catch {
        /* still offline — next refresh */
      }
    }

    // null = the register could not be read (backend mode only).
    let server: Complaint[] | null = null;
    if (isBackendConfigured()) {
      try {
        const wire = await api.get<WireComplaint[]>('/complaints');
        server = Array.isArray(wire)
          ? wire.map((w) => ({
            id: `srv:${w.id ?? w.ref ?? newId('cmp')}`,
            ref: w.ref || 'PYS-?????',
            category: (w.category as ComplaintCategory) ?? 'other',
            order_id: w.order_id ?? null,
            detail: w.detail ?? '',
            status: normalizeStatus(w.status),
            resolution: w.resolution ?? null,
            created_at: w.created_at ?? new Date().toISOString(),
            updated_at: w.updated_at ?? w.created_at ?? new Date().toISOString(),
            backend_id: w.id ?? null,
          }))
          : [];
        // Rows an older build kept as mirrors of server rows (backend_id set)
        // are stale copies of what was just fetched; drop them.
        await deleteRows<Complaint>(TABLE, uid, (r) => !!r.backend_id).catch(() => {});
      } catch {
        server = null;
      }
    }

    const unreachable = server === null && isBackendConfigured();
    // The server's rows lead. When the register could not be read, the last
    // fetched server rows for THIS account stay on screen under an error;
    // the local table is never promoted to the whole truth.
    const lead = server ?? (get().forUid === uid ? get().rows.filter((r) => r.id.startsWith('srv:')) : []);
    const leadRefs = new Set(lead.map((s) => s.ref));
    const pending = (await getRows<Complaint>(TABLE, uid).catch(() => [] as Complaint[]))
      .filter((r) => r.backend_id == null && !leadRefs.has(r.ref));
    const rows = [...lead, ...pending].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    set({ rows, loading: false, error: unreachable ? REGISTER_UNREACHABLE : null, forUid: uid });
  },
}));
