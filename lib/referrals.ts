import { requireUserId, getUserId } from './session';
import { getRows, insertRow, setRows, getSingle, putSingle, newId } from './localStore';

/**
 * PARAG referrals — a shareable per-user code plus a local reward ledger. Runs
 * against the on-device store so it works fully offline for the demo; when the
 * parag-api is live these map to GET /referrals (the ledger) and GET
 * /referrals/code (the server-issued code). Each customer who signs up with your
 * code puts a fixed reward into your PARAG Wallet, so the code below is honest
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

/** The signed-in user's shareable referral code (deterministic, offline-safe). */
export async function getReferralCode(): Promise<string> {
  const uid = await getUserId();
  return uid ? codeFromUid(uid) : '';
}

// ── Reward ledger ────────────────────────────────────────────────────────────
// Seed a couple of demo rows the first time the ledger is read so the screen
// looks alive offline. Only seeds once per account (guarded by a marker row).
async function ensureSeed(uid: string): Promise<void> {
  const rows = await getRows<Referral>('referrals', uid);
  if (rows.length) return;
  const now = Date.now();
  const day = 86400000;
  const demo: Referral[] = [
    { id: newId('ref'), name: 'Neha S.', status: 'credited', reward_amount: REFERRAL_REWARD, created_at: new Date(now - 12 * day).toISOString() },
    { id: newId('ref'), name: 'Arun K.', status: 'credited', reward_amount: REFERRAL_REWARD, created_at: new Date(now - 5 * day).toISOString() },
    { id: newId('ref'), name: 'Pending invite', status: 'pending', reward_amount: REFERRAL_REWARD, created_at: new Date(now - 1 * day).toISOString() },
  ];
  // Single write of the full set (not N inserts) so two concurrent first-reads
  // can only last-writer-win to the same 3 rows, never double-seed to 6.
  await setRows<Referral>('referrals', uid, demo);
}

/** Full referral ledger, newest first. */
export async function listReferrals(): Promise<Referral[]> {
  const uid = await requireUserId();
  // TODO(api): GET /referrals — when backend live, read the server ledger.
  await ensureSeed(uid);
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
  const meta = await getSingle<ReferralMeta>('referral_meta', uid);
  return meta?.referred_by ?? null;
}

/** Record the friend's code the user entered. Their reward is granted on the
 *  referrer's side once signup completes (server-side when the API is live). */
export async function setReferredBy(code: string): Promise<void> {
  const uid = await requireUserId();
  // TODO(api): POST /referrals/apply { code } — validate + credit server-side.
  await putSingle<ReferralMeta>('referral_meta', uid, { referred_by: code.trim().toUpperCase() });
}
