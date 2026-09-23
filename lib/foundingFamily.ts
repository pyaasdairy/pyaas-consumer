import { api, isBackendConfigured, HttpError } from './apiClient';
import { getUserId } from './session';

/**
 * FOUNDING FAMILY — the membership that replaces "PYAAS Plus" (pyaas-app-spec.md,
 * 21 Sep 2026).
 *
 * THE MODEL: every home picks one of the PYAAS farms and pays ₹99 to hold a
 * seat there. A farm UNLOCKS when enough homes have claimed it; from then its
 * members get PYAAS milk, free delivery and ₹2 off every litre, and the ₹99
 * becomes their first month. Until it unlocks, nothing more is charged.
 *
 * RULE ONE OF THE SPEC: the app never types a price or a status. Farms, seat
 * counts, unlock thresholds, the member's status and place in line, and the
 * ₹99 itself all come from the backend (which reads the ERP). If the backend
 * does not answer, the screens say Founding Family is opening soon — they
 * never invent a farm or a number.
 *
 * BACKEND CONTRACT (co-dev — see the handoff):
 *   GET  /consumer/founding-family            → FoundingFamilyView
 *   POST /consumer/founding-family/join { farm_id }
 *        → { member: Member }   (₹99 taken from the wallet server-side,
 *          booked as a customer advance against FOUNDING-99, status Waiting)
 *        errors: WALLET_SHORT (with `shortfall`), FARM_UNLOCKED, ALREADY_MEMBER
 *   POST /consumer/founding-family/stop       → { member: Member }
 */

export type FarmStatus = 'filling' | 'unlocked';

export type Farm = {
  id: string;
  name: string;            // "Gonard Dairy"
  farmer: string;          // "Harsh Singh"
  place?: string | null;   // "Paraspur"
  note?: string | null;    // "Founder's family farm"
  photo_url?: string | null;
  unlocks_at: number;      // homes needed to unlock (ERP)
  claimed: number;         // homes that have claimed it (ERP)
  status: FarmStatus;
  /** What an unlocked farm opened, e.g. "Whole Farm Milk 1 L bottle and pouch". */
  unlocked_packs?: string | null;
};

export type MemberStatus = 'waiting' | 'active' | 'stopped';

export type Member = {
  status: MemberStatus;
  farm_id: string;
  line_number?: number | null;
  referral_code?: string | null;
  joined_at?: string | null;
  next_bill_date?: string | null;
};

export type FoundingFamilyView = {
  /** Monthly price from FOUNDING-99. */
  price_month: number;
  member: Member | null;
  farms: Farm[];
  /** For the "1 L a day saves ₹X a month" line (ERP level 1 vs level 3). */
  savings?: {
    level1_per_litre: number;
    level3_per_litre: number;
    delivery_fee: number;
  } | null;
};

/** Farms still open for claims. */
export function homesToGo(f: Farm): number {
  return Math.max(0, f.unlocks_at - f.claimed);
}

/** "1 L a day saves ₹111 a month (₹2,700 vs ₹2,589)" — or null without data. */
export function savingsLine(v: FoundingFamilyView | null): { saves: number; without: number; withMembership: number } | null {
  const s = v?.savings;
  if (!s || !v) return null;
  const without = Math.round((s.level1_per_litre + s.delivery_fee) * 30);
  const withMembership = Math.round(s.level3_per_litre * 30 + v.price_month);
  const saves = without - withMembership;
  return saves > 0 ? { saves, without, withMembership } : null;
}

/**
 * The member's own view. Null means the backend does not offer Founding
 * Family yet (endpoint absent, offline, or no backend) — the screen then says
 * it is opening soon instead of showing anything made up.
 */
export async function getFoundingFamily(): Promise<FoundingFamilyView | null> {
  if (!isBackendConfigured()) return null;
  if (!(await getUserId())) return null;
  try {
    const v = await api.get<FoundingFamilyView>('/founding-family');
    if (!v || !Array.isArray(v.farms) || typeof v.price_month !== 'number') return null;
    return v;
  } catch {
    return null;
  }
}

export class FoundingFamilyError extends Error {
  code: string;
  shortfall?: number;
  constructor(code: string, message: string, shortfall?: number) {
    super(message);
    this.code = code;
    this.shortfall = shortfall;
  }
}

function toFfError(e: unknown): FoundingFamilyError {
  if (e instanceof HttpError) {
    // HttpError carries the backend's machine code; the shortfall, when the
    // server sends one, is read from the message ("…short by 42") as a
    // fallback until the error body exposes it as a field.
    const code = e.code ?? (e.status === 404 ? 'NOT_AVAILABLE' : 'FAILED');
    const m = /short(?:fall)?\D*(\d+)/i.exec(e.message);
    const body = { message: e.message, shortfall: m ? Number(m[1]) : undefined };
    const msg =
      code === 'WALLET_SHORT' ? 'Your wallet needs a little more to pay ₹99.'
      : code === 'FARM_UNLOCKED' ? 'This farm has already unlocked, so claims are closed. Pick another farm.'
      : code === 'ALREADY_MEMBER' ? 'You are already in the Founding Family.'
      : code === 'NOT_AVAILABLE' ? 'Founding Family opens in the app soon.'
      : body.message ?? 'Could not complete that. Please try again.';
    return new FoundingFamilyError(code, msg, body.shortfall);
  }
  return new FoundingFamilyError('FAILED', (e as Error)?.message ?? 'Could not complete that. Please try again.');
}

/** Claim a farm and pay ₹99 from the wallet (server-side). */
export async function joinFoundingFamily(farmId: string): Promise<Member> {
  try {
    const r = await api.post<{ member: Member }>('/founding-family/join', { farm_id: farmId });
    if (!r?.member) throw new FoundingFamilyError('FAILED', 'Could not complete that. Please try again.');
    return r.member;
  } catch (e) {
    throw e instanceof FoundingFamilyError ? e : toFfError(e);
  }
}

/** Stop the membership; perks run to the end of the paid month. */
export async function stopFoundingFamily(): Promise<Member> {
  try {
    const r = await api.post<{ member: Member }>('/founding-family/stop');
    if (!r?.member) throw new FoundingFamilyError('FAILED', 'Could not stop it. Please try again.');
    return r.member;
  } catch (e) {
    throw e instanceof FoundingFamilyError ? e : toFfError(e);
  }
}

/** WhatsApp share text (spec §6, "WhatsApp · shared"). */
export function foundingShareMessage(farm: Farm | null, code: string | null | undefined, siteUrl: string): string {
  const togo = farm ? homesToGo(farm) : 0;
  const link = `${siteUrl.replace(/\/$/, '')}/foundationfamily${code ? `?ref=${encodeURIComponent(code)}` : ''}`;
  if (farm && farm.status === 'filling' && togo > 0) {
    return `I joined the PYAAS Founding Family and claimed ${farm.name}. ${togo} more ${togo === 1 ? 'home' : 'homes'} and it unlocks for our society: ${link}`;
  }
  return `I joined the PYAAS Founding Family${farm ? ` and claimed ${farm.name}` : ''}. Know Your Milk: ${link}`;
}
