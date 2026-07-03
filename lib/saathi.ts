import { supabase } from './supabase';

/**
 * Saathi (ops/rider app) sync layer - the consumer side of the shared-DB
 * contract in "PYAAS Consumer App - Integration Notes".
 *
 * The ops app WRITES operational truth (milk entries, quality checks, batches,
 * milk passports, deliveries, rider GPS). This module READS it via the public
 * views / SECURITY DEFINER RPCs that actually exist on the unified backend.
 *
 * Everything fails soft: if an RPC isn't deployed yet the caller gets null and
 * the UI falls back to the local demo data. (Farm-story / tip / follow features
 * are not yet backed by any DB object, so their client helpers were removed
 * rather than shipped as throwing dead code · re-add them with backing
 * functions + a feature flag when that phase lands.)
 */

// ── Milk Passport (QR on every carton/bottle/tin) ────────────────────────────
export type SaathiPassport = {
  fat_pct: number | null;
  snf_pct: number | null;
  checks_passed: number | null;
  collected_at: string | null;
  packaged_at: string | null;
  delivered_at: string | null;
  cluster: string | null;
  centre: string | null;
  report: Record<string, any> | null;
};

/** Resolve a scanned passport token → full quality report. Anon-safe. */
export async function getMilkPassportByToken(token: string): Promise<SaathiPassport | null> {
  const { data, error } = await supabase.rpc('get_milk_passport', { p_token: token });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SaathiPassport) ?? null;
}

/**
 * The Saathi app prints a human-readable batch code (humanId) on every pack, e.g.
 * `PYAAS-LKO-20260612-M-007`  →  PYAAS-{centre}-{YYYYMMDD}-{M|E}-{seq}. That string
 * is what the consumer scans (1D barcode / QR-of-the-code) or types by hand, and it
 * resolves directly via GET /traceability/:batchCode.
 */
const BATCH_CODE_RE = /^PYAAS-[A-Z]{2,5}-\d{8}-[ME]-\d{3}$/;

/** True if `s` is a canonical PYAAS batch code. */
export function isBatchCode(s: string): boolean {
  return BATCH_CODE_RE.test((s ?? '').trim().toUpperCase());
}

/**
 * Normalize a scanned/typed payload to a resolvable code. Accepts the raw batch
 * code, a `pyaas://trace/<code>` deep link, or a URL ending in the code, as well
 * as legacy passport tokens. Canonical PYAAS batch codes are upper-cased; legacy
 * tokens keep their original case (the get_milk_passport RPC is case-sensitive).
 */
export function normalizeBatchCode(payload: string): string | null {
  const s = (payload ?? '').trim();
  if (!s) return null;
  // Strip any URL/deep-link wrapper: drop query/hash, take the last path segment.
  const tail = (s.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? s).trim();
  let candidate = tail;
  try {
    candidate = decodeURIComponent(tail);
  } catch {
    /* not URL-encoded — keep as-is */
  }
  candidate = candidate.replace(/\s+/g, ''); // labels can wrap; codes never contain spaces
  const upper = candidate.toUpperCase();
  if (BATCH_CODE_RE.test(upper)) return upper; // canonical batch code
  // Forward/back-compat: a plausible alnum+hyphen/underscore code or legacy token.
  return /^[A-Za-z0-9_-]{6,}$/.test(candidate) ? candidate : null;
}

/** @deprecated Use {@link normalizeBatchCode}. Kept for existing call sites. */
export const parsePassportToken = normalizeBatchCode;

// ── Live rider (orders.rider_id → riders) ────────────────────────────────────
export type SaathiRider = {
  id: string;
  full_name: string | null;
  phone: string | null;
  vehicle: string | null;
  rating: number | null;
  is_online: boolean | null;
  current_lat: number | null;
  current_lng: number | null;
};

/**
 * The rider assigned to an order, read from the `riders` table (the rider's
 * live row: name, phone, vehicle, rating, and GPS). The order's rider_id is set
 * by simulate_rider_assignment / the dispatch flow.
 */
export async function getOrderRider(riderId: string): Promise<SaathiRider | null> {
  const { data } = await supabase
    .from('riders')
    .select('id, full_name, phone, vehicle, rating, is_online, current_lat, current_lng')
    .eq('id', riderId)
    .maybeSingle();
  return (data as SaathiRider) ?? null;
}
