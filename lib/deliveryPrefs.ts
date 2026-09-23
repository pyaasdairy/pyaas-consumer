import { requireUserId, getUserId } from './session';
import { getSingle, putSingle, dropTable } from './localStore';
import { api, isBackendConfigured } from './apiClient';
import { registerMirrorHandler, enqueueMirror, type MirrorOutcome } from './mirrorQueue';

export type DeliveryPrefs = {
  call_before: boolean;
  ring_bell: boolean;
  voice_instructions_url: string | null;
  door_image_url: string | null;
  notes: string | null;
};

export const DEFAULT_PREFS: DeliveryPrefs = {
  call_before: false,
  // Default drop style is HANG IT OUTSIDE: the 5 AM delivery wakes nobody
  // unless the member explicitly asks for the bell.
  ring_bell: false,
  voice_instructions_url: null,
  door_image_url: null,
  notes: null,
};

const TABLE = 'delivery_prefs';

// Backend mode: the server's copy (GET /me delivery_prefs), held in memory
// for the session and never written to the device. Keyed by uid so an
// account switch never shows the previous member's doorstep instructions.
// The local row exists in backend mode ONLY as the offline outbox: written
// when PATCH /me fails, replayed by the mirror handler, then deleted.
let cached: { uid: string; prefs: DeliveryPrefs } | null = null;
// Bumped by every write to the copy. A GET that began before the bump
// returns its answer to its caller but does not keep it: a save landed while
// it was in flight, so what it read is already stale.
let prefsGen = 0;

function setCached(uid: string, prefs: DeliveryPrefs): void {
  cached = { uid, prefs };
  prefsGen += 1;
}

/** The request shape PATCH /me carries (field names the backend reads). */
export function toWire(p: DeliveryPrefs): { call_before: boolean; ring_bell: boolean; notes: string } {
  return { call_before: p.call_before, ring_bell: p.ring_bell, notes: p.notes ?? '' };
}

/** The standing prefs as GET /me returns them (delivery_prefs.note is the
 *  server's own name for the free-text line; absent = never set). */
export function fromServer(me: Record<string, unknown> | null | undefined): DeliveryPrefs {
  const d = (me?.delivery_prefs ?? null) as { call_before?: unknown; ring_bell?: unknown; note?: unknown } | null;
  return {
    ...DEFAULT_PREFS,
    call_before: d?.call_before === true,
    ring_bell: d?.ring_bell === true,
    notes: typeof d?.note === 'string' && d.note.trim() ? d.note : null,
  };
}

async function fetchFromServer(uid: string): Promise<DeliveryPrefs> {
  const gen = prefsGen;
  const prefs = fromServer(await api.get<Record<string, unknown>>('/me'));
  if (gen === prefsGen) cached = { uid, prefs };
  return prefs;
}

/**
 * The member's standing doorstep preferences. Backend mode reads the
 * session's in-memory copy, fetching GET /me the first time (or when the
 * caller asks for a refresh, as the editing screen does on focus); offline,
 * an outbox row not yet replayed is the member's latest word, then the copy
 * fetched earlier this session, then the defaults.
 */
export async function getDeliveryPrefs(opts?: { refresh?: boolean }): Promise<DeliveryPrefs> {
  const uid = await getUserId();
  if (!uid) return { ...DEFAULT_PREFS };
  if (!isBackendConfigured()) {
    const row = await getSingle<DeliveryPrefs>(TABLE, uid);
    return row ?? { ...DEFAULT_PREFS };
  }
  if (cached?.uid === uid && !opts?.refresh) return cached.prefs;
  try {
    return await fetchFromServer(uid);
  } catch {
    const pending = await getSingle<DeliveryPrefs>(TABLE, uid).catch(() => null);
    if (pending) return pending;
    if (cached?.uid === uid) return cached.prefs;
    return { ...DEFAULT_PREFS };
  }
}

export async function saveDeliveryPrefs(prefs: Partial<DeliveryPrefs>): Promise<void> {
  const uid = await requireUserId();
  if (!isBackendConfigured()) {
    const current = (await getSingle<DeliveryPrefs>(TABLE, uid)) ?? { ...DEFAULT_PREFS };
    await putSingle<DeliveryPrefs>(TABLE, uid, { ...current, ...prefs });
    return;
  }
  const current = cached?.uid === uid ? cached.prefs : await getDeliveryPrefs();
  const next: DeliveryPrefs = { ...current, ...prefs };
  // PATCH /me FIRST: the RIDER reads these off the delivery task, so a
  // preference that only lives in this phone is a promise the doorstep never
  // receives (call-before, ring-bell, drop notes). On success nothing is
  // written locally, and a stale outbox row from an earlier offline save is
  // dropped so its queued replay cannot overwrite this newer value.
  try {
    const me = await api.patch<Record<string, unknown>>('/me', { delivery_prefs: toWire(next) });
    setCached(uid, me && typeof me === 'object' && 'delivery_prefs' in me ? fromServer(me) : next);
    await dropTable(TABLE, uid).catch(() => undefined);
  } catch {
    // Offline: the outbox row holds the edit until the mirror replays it.
    setCached(uid, next);
    await putSingle<DeliveryPrefs>(TABLE, uid, next);
    await enqueueMirror('delivery-prefs');
  }
}

registerMirrorHandler('delivery-prefs', async (): Promise<MirrorOutcome> => {
  const uid = await getUserId();
  if (!uid) return 'done';
  // Outbox only: no row means the edit already reached the server (a later
  // online save, or an earlier replay), so there is nothing to send.
  const p = await getSingle<DeliveryPrefs>(TABLE, uid);
  if (!p) return 'done';
  await api.patch('/me', { delivery_prefs: toWire(p) });
  setCached(uid, p);
  await dropTable(TABLE, uid);
  return 'done';
});
