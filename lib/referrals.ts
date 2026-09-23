import { requireUserId, getUserId } from './session';
import { getRows, insertRow, setRows, getSingle, putSingle, newId } from './localStore';
import { api, isBackendConfigured, HttpError } from './apiClient';
import { enqueueMirror, mirrorOutcomeFor, registerMirrorHandler, type MirrorOutcome } from './mirrorQueue';

/**
 * PYAAS referrals — a shareable per-user code plus a local reward ledger. Runs
 * against the on-device store so it works fully offline for the demo; when the
 * parag-api is live these map to GET /referrals (the ledger) and GET
 * /referrals/code (the server-issued code). Each customer who signs up with your
 * code puts a fixed reward into your PYAAS Wallet, so the code below is honest
 * cooperative-member growth, no fabricated savings tied to any single farm.
 */

/** Reward, in rupees, credited per family that joins with your code. */
export const REFERRAL_REWARD = 100;

export type ReferralStatus = 'pending' | 'credited';

export type Referral = {
  id: string;
  name: string;           // the joined family's display name
  status: ReferralStatus; // credited once their signup completes
  reward_amount: number;
  created_at: string;
};

/** Single-row store of the code the user themselves entered (who referred them). */
type ReferralMeta = { referred_by: string | null };

// ── Referral code ────────────────────────────────────────────────────────────
// Derived deterministically from the user id so the same account always shows
// the same code offline (no server round-trip). Stable, uppercase, 6 chars.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function codeFromUid(uid: string): string {
  const body = hash(uid).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ('PG' + body + 'XXXX').slice(0, 6);
}

/** Carry a member's code across a uid migration: codes are derived from the
 *  uid, so without this a migrated account would silently mint a NEW code and
 *  every previously shared one would stop attributing. Stored codes win over
 *  derivation from then on. */
export async function preserveReferralCode(fromUid: string, toUid: string): Promise<void> {
  const stored = await getSingle<{ code: string }>('referral_code', fromUid);
  const code = stored?.code ?? codeFromUid(fromUid);
  await putSingle('referral_code', toUid, { code });
}

/** Backend mode: the code the server issued, held for the session. Keyed by
 *  account so a switch on a shared phone never shows the previous member's
 *  code; never written to the device, the server being the only issuer. */
let codeCache: { uid: string; code: string } | null = null;

/** The signed-in user's shareable referral code (deterministic, offline-safe;
 *  a stored code — e.g. carried over a uid migration — takes precedence). */
export async function getReferralCode(): Promise<string> {
  const uid = await getUserId();
  if (!uid) return '';
  // SERVER FIRST (21 Sep): the program never worked because the code lived
  // only on this phone and the server could not tell whose code "PGHZU4" was.
  // GET /referrals/code returns the server's code for this member; the
  // on-device derivation below is the fallback and the backend is asked to
  // use the SAME derivation, so codes already shared keep attributing.
  if (isBackendConfigured()) {
    if (codeCache?.uid === uid) return codeCache.code;
    try {
      const r = await api.get<{ code?: string }>('/referrals/code');
      const code = typeof r?.code === 'string' ? r.code.trim() : '';
      if (code) {
        codeCache = { uid, code };
        return code;
      }
    } catch { /* the derivation answers until the server does; nothing cached */ }
    return codeFromUid(uid);
  }
  const stored = await getSingle<{ code: string }>('referral_code', uid);
  return stored?.code ?? codeFromUid(uid);
}

// ── Reward ledger ────────────────────────────────────────────────────────────
// There is deliberately NO seed here. This used to fabricate three rows on the
// first read of every account — two "credited" joins from invented people
// ("Neha S.", "Arun K.") worth ₹200 — so a thirty-second-old account opened the
// refer screen to "Families joined 2 · Earned ₹200". No code path ever moved
// that ₹200 into the wallet, so it was money the member could see and never
// spend. Fabricated activity is Guideline 2.3.1, and an unpayable balance is a
// consumer-protection problem in its own right. A new member correctly starts
// empty and the screen's existing zero state handles it.

/** Backend mode: why the last ledger read answered with nothing, or null after
 *  a read the server answered. A screen can show it beside the empty state so
 *  "no families yet" is never shown for "could not ask". */
let listError: string | null = null;
export function referralListError(): string | null {
  return listError;
}
const REFERRALS_NOT_LIVE = 'Referral rewards are not available yet.';
const REFERRALS_UNAVAILABLE = 'Could not load your referrals. Check your connection and try again.';

/** Full referral ledger, newest first. */
export async function listReferrals(): Promise<Referral[]> {
  const uid = await requireUserId();
  // The ledger is the SERVER's (who joined with this member's code, what was
  // credited). In backend mode the local table never answers: a row this
  // phone holds is not a join the server will credit, so a failed read is an
  // empty list plus referralListError(), not a local ledger.
  if (isBackendConfigured()) {
    try {
      const rows = await api.get<Referral[]>('/referrals');
      listError = null;
      return (Array.isArray(rows) ? rows : []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (e) {
      listError = e instanceof HttpError && e.status === 404 ? REFERRALS_NOT_LIVE : REFERRALS_UNAVAILABLE;
      return [];
    }
  }
  const rows = await getRows<Referral>('referrals', uid);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Rolled-up stats for the header cards. `count` counts credited joins only. */
export async function listReferralStats(): Promise<{ count: number; pending: number; earned: number }> {
  const rows = await listReferrals();
  const credited = rows.filter((r) => r.status === 'credited');
  return {
    count: credited.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    earned: credited.reduce((s, r) => s + Number(r.reward_amount ?? 0), 0),
  };
}

// ── Applying someone else's code (the "have a code?" sheet) ───────────────────
export async function getReferredBy(): Promise<string | null> {
  const uid = await getUserId();
  if (!uid) return null;
  if (isBackendConfigured()) return null; // the server holds the attribution; nothing is kept here
  const meta = await getSingle<ReferralMeta>('referral_meta', uid);
  return meta?.referred_by ?? null;
}

/** Backend mode's offline outbox for an apply that never reached a verdict:
 *  the op's target is the code itself, so no table is needed. The queue
 *  deletes the op once the server accepts it or rejects it for good. */
export const REFERRAL_APPLY_MIRROR_KIND = 'referral-apply';

registerMirrorHandler(REFERRAL_APPLY_MIRROR_KIND, async (code): Promise<MirrorOutcome> => {
  if (!code) return 'done';
  await api.post('/referrals/apply', { code }); // 4xx: drop, network/5xx: retry (mirrorOutcomeFor)
  return 'done';
});

/** Record the friend's code the user entered. Their reward is granted on the
 *  referrer's side once signup completes.
 *  Backend mode: POST /referrals/apply first, and nothing is written to the
 *  device. True once the server accepted the code, or when the request never
 *  reached a verdict (offline, 5xx) and was queued for replay; false when the
 *  server rejected it (the route not deployed yet, an unknown or own code):
 *  a local row nobody on the server will ever honour would be a promise the
 *  app cannot keep. Local mode keeps the row on the device. */
export async function setReferredBy(code: string): Promise<boolean> {
  const uid = await requireUserId();
  const clean = code.trim().toUpperCase();
  if (!clean) return false;
  if (isBackendConfigured()) {
    try {
      await api.post('/referrals/apply', { code: clean });
      return true;
    } catch (e) {
      if (mirrorOutcomeFor(e) === 'drop') return false;
      await enqueueMirror(REFERRAL_APPLY_MIRROR_KIND, clean);
      return true;
    }
  }
  await putSingle<ReferralMeta>('referral_meta', uid, { referred_by: clean });
  return true;
}

/**
 * The share message, in PYAAS One Voice (pyaas-one-voice.md): the master line,
 * the before-7 AM promise, and the welcome offer with its condition in the
 * same message, exactly as §1.8 requires wherever the headline travels.
 */
export function referralShareMessage(code: string): string {
  return [
    'I get my milk from PYAAS. Know Your Milk: every pack tells you where it came from, and it is at my door before 7 AM.',
    `Use my code ${code} when you sign up.`,
    '1 Litre Free Parag Milk! 500 ml Parag Gold with your first order, and another 500 ml when you add ₹500 to your PYAAS Wallet within 7 days. New customers, in the 13 localities we serve, on the PYAAS app.',
  ].join('\n\n');
}
