/**
 * Rich farm-to-bottle passport from the PYAAS ops API (public, no auth):
 *   GET {OPS_API}/traceability/:batchCode
 * Returns the farm cluster, each contributing farmer (name, village, FAT/SNF,
 * score, collection time), and all 8 adulteration tests with pass/fail.
 *
 * This is the SAME backend the Saathi (rider/ops) app writes batches to, over
 * the shared Postgres DB — so a batch created in Saathi resolves here on scan.
 * The hosted dyno can cold-start, so every call is time-boxed: if the ops API
 * is slow/asleep the caller gets null fast and Know-Your-Milk falls back to the
 * instant Supabase `v_public_traceability` view (same data, leaner shape).
 */
const OPS_API = process.env.EXPO_PUBLIC_OPS_API_URL || 'https://pyaas-api.onrender.com';
const PASSPORT_TIMEOUT_MS = 7000;

export type OpsContributingFarm = {
  firstName: string;
  village: string | null;
  story: string | null;
  farmPhotoUrl: string | null;
  portraitUrl: string | null;
  fatPct: number | null;
  snfPct: number | null;
  score: number | null;
  sharePct: number | null;
  qtyLitres: number | null;
  collectedAt: string | null;
};

export type OpsPassport = {
  batchCode: string;
  status: string;
  processingDate: string;
  collectionDateFrom: string | null;
  collectionDateTo: string | null;
  collectedAt: string | null;
  packagedAt: string | null;
  deliveredAt: string | null;
  farmCluster: { name: string; district: string | null };
  composition: { totalQtyLitres: number; fatPct: number; snfPct: number };
  quality: { batchQaPass: boolean; antibioticPass: boolean; adulterationPass: boolean; coldChain: boolean };
  adulterationTests: { name: string; pass: boolean }[];
  contributingFarms: OpsContributingFarm[];
};

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null; // network error or aborted (timeout)
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpsPassport(batchCode: string): Promise<OpsPassport | null> {
  const res = await fetchWithTimeout(`${OPS_API}/traceability/${encodeURIComponent(batchCode)}`, PASSPORT_TIMEOUT_MS);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as OpsPassport;
  } catch {
    return null;
  }
}

/**
 * Wake the OPS API ahead of a scan. The hosted dyno sleeps after idle and
 * cold-starts in 30–60s; pinging it the moment the scanner opens means the
 * backend is usually warm by the time the customer lines up a code. Throttled
 * to once a minute and fully fire-and-forget — it never blocks or throws.
 */
let warmedAt = 0;
export function warmOpsApi(): void {
  const now = Date.now();
  if (now - warmedAt < 60_000) return;
  warmedAt = now;
  // A 404 is fine — it still spins the dyno up. Generous timeout for a cold boot.
  void fetchWithTimeout(`${OPS_API}/traceability/__warm__`, 30_000);
}
