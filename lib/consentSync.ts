import Constants from 'expo-constants';
import { getUserId } from './session';
import { getRows, insertRow } from './localStore';
import { api, isBackendConfigured, HttpError } from './apiClient';
import { registerMirrorHandler, enqueueMirror, mirrorPending, type MirrorOutcome } from './mirrorQueue';
import { getDataDisclosureRecord } from './dataConsent';
import { getLocationDisclosureRecord } from './locationConsent';
import type { ConsentChoices, ConsentKey, ConsentRecord } from '../components/ConsentSheet';

/**
 * CONSENT MIRROR + HYDRATION (Phase B seam).
 *
 * Server contract (feature/crm-welcome-litre only):
 *   POST /users/me/consents  { consents: [{ type, granted, version?, language?,
 *                              app_version?, occurred_at? }] }
 *   GET  /users/me/consents  → { consents: { <type>: { granted, version?, occurred_at } } }
 *
 * THE DEPLOYED backend (release/26.07.03) 404s BOTH routes, so everything here
 * degrades silently per the lib/crm.ts contract: the local stores
 * (ConsentSheet 'consents' table + the two prominent-disclosure records) stay
 * the UX source of truth, and the app behaves byte-identically to today.
 *
 * Mirror model — one 'consents' mirror-queue kind, target '' (a single
 * collapse key): the op is a TARGET, not a payload. The handler re-reads ALL
 * current local consent state at drain time and pushes it as one batch, so
 * re-enqueueing after any consent event is last-write-wins by construction,
 * and at-least-once replay is safe because the server applies per-(user,type)
 * newest-occurred_at-wins (ties go to opt-out) — replaying a batch N times is
 * byte-identical to sending it once.
 *
 * occurred_at is the LEGAL time of the user's action (the local record's own
 * timestamp), never the flush time — the server uses it as the consent anchor.
 */

export const CONSENTS_MIRROR_KIND = 'consents';

type ServerConsentEntry = { granted?: boolean; version?: string; occurred_at?: string };
type ServerConsentMap = Record<string, ServerConsentEntry | undefined>;

/** Local optional channels → server consent types. ConsentSheet's generic
 *  'marketing' ("Offers and updates") maps to marketing_push — the only
 *  non-channel-specific promotional type in the server's closed enum. */
const CHANNEL_TYPES: { key: Exclude<ConsentKey, 'privacy' | 'terms'>; type: string }[] = [
  { key: 'marketing', type: 'marketing_push' },
  { key: 'whatsapp', type: 'marketing_whatsapp' },
  { key: 'sms', type: 'marketing_sms' },
  { key: 'email', type: 'marketing_email' },
];

async function latestConsentRecord(uid: string): Promise<ConsentRecord | null> {
  const rows = await getRows<ConsentRecord>('consents', uid);
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  return rows[0];
}

function sameChoices(a: ConsentChoices, b: ConsentChoices): boolean {
  return (['privacy', 'terms', 'marketing', 'whatsapp', 'sms', 'email'] as ConsentKey[])
    .every((k) => !!a[k] === !!b[k]);
}

registerMirrorHandler(CONSENTS_MIRROR_KIND, async (): Promise<MirrorOutcome> => {
  const uid = await getUserId();
  if (!uid) return 'done';

  const consents: Record<string, unknown>[] = [];

  // Latest ConsentSheet choices (privacy+terms + marketing channels).
  const latest = await latestConsentRecord(uid);
  if (latest) {
    const base = {
      version: latest.policy_version,
      app_version: latest.app_version,
    };
    // occurred_at is the LEGAL event time. Genuine user records carry it as
    // recorded_at; server-hydration records carry the per-type times the
    // server reported (occurred_at_by_type) and a SYNTHETIC recorded_at that
    // must never be echoed as occurred_at — the server treats a strictly-newer
    // grant as a re-grant and would reset the promo TTL anchor with no human
    // action (TCCCPR fail-open on the freshness window).
    const timeFor = (type: string): string =>
      latest.occurred_at_by_type?.[type] ?? latest.recorded_at;
    consents.push({
      type: 'privacy_terms',
      granted: !!(latest.choices.privacy && latest.choices.terms),
      occurred_at: timeFor('privacy_terms'),
      ...base,
    });
    for (const { key, type } of CHANNEL_TYPES) {
      // granted:false is sent explicitly — the backend's promo guard is
      // fail-closed and a revoke must land as a revoke, never as an omission.
      consents.push({ type, granted: !!latest.choices[key], occurred_at: timeFor(type), ...base });
    }
  }

  // Prominent-disclosure acceptances ('mirror later' seams in their modules).
  const phone = await getDataDisclosureRecord();
  if (phone) {
    consents.push({
      type: 'disclosure_phone',
      granted: true,
      version: phone.version,
      ...(phone.lang ? { language: phone.lang } : {}),
      app_version: phone.app_version,
      occurred_at: phone.accepted_at,
    });
  }
  const loc = await getLocationDisclosureRecord();
  if (loc) {
    consents.push({
      type: 'disclosure_location',
      granted: true,
      version: loc.version,
      ...(loc.lang ? { language: loc.lang } : {}),
      // Legacy/pre-Phase-B records have no timestamp; the server then anchors
      // on receive time, which only ever re-affirms an acceptance (never a
      // revoke), so the tie-goes-to-opt-out rule keeps this safe.
      ...(loc.accepted_at ? { occurred_at: loc.accepted_at } : {}),
    });
  }

  if (consents.length === 0) return 'done';

  try {
    await api.post('/users/me/consents', { consents });
  } catch (e) {
    // DEGRADE vs the DEPLOYED pre-Phase-B backend: this route answers 404.
    // The queue-wide convention (mirrorOutcomeFor) classifies every permanent
    // 4xx — 404 included — as 'drop', which is exactly what all other kinds do
    // against an old backend, and the queue must never wedge on the head op.
    // Made explicit here so the decision is documented, not implied: the local
    // record stays the visible source of truth, and the next consent event
    // re-arms this key once the Phase B backend is live.
    if (e instanceof HttpError && e.status === 404) return 'drop';
    throw e; // 400 → drop, 5xx/network/timeout → retry (mirrorOutcomeFor)
  }
  return 'done';
});

/**
 * Persist the 'consents' mirror intent and kick a drain. Storage-only on the
 * caller's path (the network flush is fire-and-forget inside the queue), and
 * error-swallowed: mirroring must NEVER interfere with a consent flow.
 * No-ops with no session / no backend — callers that record device-scoped
 * consent pre-account rely on the post-sign-in link step to re-arm it.
 */
export async function queueConsentMirror(): Promise<void> {
  try {
    await enqueueMirror(CONSENTS_MIRROR_KIND);
  } catch {
    /* never block or fail the consent UX over the mirror */
  }
}

/**
 * Reinstall hydration: pull the server's consent state into the local
 * ConsentSheet store (server wins), so a reinstall / second device remembers
 * the member's channel opt-ins/opt-outs. Fire-and-forget from session start —
 * never throws, never blocks. Skipped while a local mirror is still pending
 * (unlanded local intent must not be clobbered — mirrorQueue convention), and
 * silent on 404 (deployed backend), network errors, and 5xx.
 *
 * Deliberately does NOT touch the prominent-disclosure records: those are
 * device-scoped by design (dataConsent.ts) — a new install must re-show the
 * disclosure regardless of what the account accepted on another device.
 */
export async function hydrateConsentsFromServer(): Promise<void> {
  try {
    if (!isBackendConfigured()) return;
    const uid = await getUserId();
    if (!uid) return;
    if (await mirrorPending(CONSENTS_MIRROR_KIND)) return;

    const res = await api.get<{ consents?: ServerConsentMap }>('/users/me/consents');
    const map = res?.consents;
    if (!map) return;

    const latest = await latestConsentRecord(uid);
    const next: ConsentChoices = latest
      ? { ...latest.choices }
      : { privacy: false, terms: false, marketing: false, whatsapp: false, sms: false, email: false };

    // Per-type LEGAL event times for the record we are about to write. A
    // hydration record's recorded_at is the write moment — synthetic, no human
    // acted — so the mirror handler must never use it as occurred_at (the
    // server would treat the strictly-newer grant as a re-grant and refresh
    // the 7-day promo TTL anchor: a fail-open). For each type we keep the
    // server's own occurred_at; for types the server has never seen we inherit
    // the previous local record's legal time.
    const inheritTime = (type: string): string | undefined =>
      latest ? latest.occurred_at_by_type?.[type] ?? latest.recorded_at : undefined;
    const times: Record<string, string> = {};
    const noteTime = (type: string, entry: ServerConsentEntry | undefined) => {
      const t = entry?.occurred_at ?? inheritTime(type);
      if (t) times[type] = t;
    };

    let touched = false;
    const pt = map['privacy_terms'];
    if (typeof pt?.granted === 'boolean') {
      next.privacy = pt.granted;
      next.terms = pt.granted;
      touched = true;
    }
    noteTime('privacy_terms', pt);
    for (const { key, type } of CHANNEL_TYPES) {
      const entry = map[type];
      if (typeof entry?.granted === 'boolean') {
        next[key] = entry.granted;
        touched = true;
      }
      noteTime(type, entry);
    }
    if (!touched) return; // server has never seen a ConsentSheet type
    if (latest && sameChoices(latest.choices, next)) return; // already in sync

    // A consent toggled while the GET was in flight must not be clobbered by
    // the (now stale) server snapshot — re-check for unlanded local intent
    // before writing (mirrorQueue convention, same reason as the pre-GET gate).
    if (await mirrorPending(CONSENTS_MIRROR_KIND)) return;

    // Append-only, like recordConsents — the history stays auditable. Written
    // directly (NOT via recordConsents) so hydration never echoes a mirror op
    // back at the server. occurred_at_by_type preserves each type's legal
    // event time so a later drain (triggered by ANY other consent event)
    // echoes the true times, never this record's synthetic recorded_at.
    const rec: ConsentRecord = {
      id: `consent_${Date.now().toString(36)}`,
      choices: next,
      app_version: Constants.expoConfig?.version ?? '1.0.0',
      policy_version: latest?.policy_version ?? pt?.version ?? '',
      recorded_at: new Date().toISOString(),
      occurred_at_by_type: times,
    };
    await insertRow<ConsentRecord>('consents', uid, rec);
  } catch {
    /* 404 (old backend) / offline / 5xx — local state stands, retry next session */
  }
}
