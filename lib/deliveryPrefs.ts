import { requireUserId, getUserId } from './session';
import { getSingle, putSingle, dropTable } from './localStore';
import { api, isBackendConfigured } from './apiClient';
import { registerMirrorHandler, enqueueMirror, mirrorOutcomeFor, type MirrorOutcome } from './mirrorQueue';

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
// when PATCH /me fails, holding just the keys the member changed, replayed
// by the mirror handler, then deleted.
let cached: { uid: string; prefs: DeliveryPrefs } | null = null;
// Bumped by every write to the copy. A GET that began before the bump
// returns its answer to its caller but does not keep it: a save landed while
// it was in flight, so what it read is already stale.
let prefsGen = 0;

function setCached(uid: string, prefs: DeliveryPrefs): void {
  cached = { uid, prefs };
  prefsGen += 1;
}

/** Sign-out: drop the session's copy; a read still in flight is discarded. */
export function clearDeliveryPrefsCache(): void {
  cached = null;
  prefsGen += 1;
}

/** The request shape PATCH /me carries (field names the backend reads).
 *  Always the whole object: the server replaces its delivery_prefs document
 *  with what it is sent (service.go updateMe), so a key left out is a key
 *  reset, not a key kept. */
export function toWire(p: DeliveryPrefs): { call_before: boolean; ring_bell: boolean; notes: string } {
  return { call_before: p.call_before, ring_bell: p.ring_bell, notes: p.notes ?? '' };
}

const PREF_KEYS = ['call_before', 'ring_bell', 'notes'] as const;

/** The keys of `prefs` whose value differs from `base`: what the member
 *  actually changed, and all the outbox carries. */
function changedKeys(base: DeliveryPrefs, prefs: Partial<DeliveryPrefs>): Partial<DeliveryPrefs> {
  const out: Record<string, unknown> = {};
  for (const k of PREF_KEYS) {
    if (prefs[k] !== undefined && prefs[k] !== base[k]) out[k] = prefs[k];
  }
  return out as Partial<DeliveryPrefs>;
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
 * the copy fetched earlier this session (else the defaults) with the keys of
 * an outbox row not yet replayed laid over it, the member's latest word.
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
    const base = cached?.uid === uid ? cached.prefs : { ...DEFAULT_PREFS };
    const pending = await getSingle<Partial<DeliveryPrefs>>(TABLE, uid).catch(() => null);
    return pending ? { ...base, ...pending } : base;
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
  // Only the keys the member changed travel; an earlier offline edit still
  // in the outbox rides along. Offline before any read this session the
  // base is the defaults, so a key the member did not touch is never sent
  // as an edit and the server's value for it stands.
  const queued = (await getSingle<Partial<DeliveryPrefs>>(TABLE, uid).catch(() => null)) ?? {};
  const edit: Partial<DeliveryPrefs> = { ...queued, ...changedKeys(current, prefs) };
  if (Object.keys(edit).length === 0) return;
  const next: DeliveryPrefs = { ...current, ...edit };
  // PATCH /me FIRST: the RIDER reads these off the delivery task, so a
  // preference that only lives in this phone is a promise the doorstep never
  // receives (call-before, ring-bell, drop notes). On success nothing is
  // written locally, and a stale outbox row from an earlier offline save is
  // dropped so its queued replay cannot overwrite this newer value. A
  // permanent rejection is surfaced, not queued (the profile and address
  // saves keep the same rule).
  try {
    const me = await api.patch<Record<string, unknown>>('/me', { delivery_prefs: toWire(next) });
    setCached(uid, me && typeof me === 'object' && 'delivery_prefs' in me ? fromServer(me) : next);
    await dropTable(TABLE, uid).catch(() => undefined);
  } catch (e) {
    if (mirrorOutcomeFor(e) === 'drop') throw e;
    // Offline: the outbox row holds the changed keys until the mirror
    // replays them.
    setCached(uid, next);
    await putSingle<Partial<DeliveryPrefs>>(TABLE, uid, edit);
    await enqueueMirror('delivery-prefs');
  }
}

registerMirrorHandler('delivery-prefs', async (): Promise<MirrorOutcome> => {
  const uid = await getUserId();
  if (!uid) return 'done';
  // Outbox only: no row means the edit already reached the server (a later
  // online save, or an earlier replay), so there is nothing to send.
  const p = await getSingle<Partial<DeliveryPrefs>>(TABLE, uid);
  if (!p) return 'done';
  // The queued keys go over a fresh read of the server's copy, never over
  // the defaults: PATCH /me replaces the whole delivery_prefs document, so
  // a key the member never touched must arrive as the server already holds
  // it. A failed read is a failed replay; the next drain retries.
  let next: DeliveryPrefs;
  try {
    next = { ...fromServer(await api.get<Record<string, unknown>>('/me')), ...p };
    await api.patch('/me', { delivery_prefs: toWire(next) });
  } catch (e) {
    const outcome = mirrorOutcomeFor(e);
    // A permanent rejection must not leave the edit queued forever.
    if (outcome === 'drop') await dropTable(TABLE, uid).catch(() => undefined);
    return outcome;
  }
  setCached(uid, next);
  await dropTable(TABLE, uid);
  return 'done';
});
