import { requireUserId, getUserId } from './session';
import { getRows, setRows, newId } from './localStore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api, getText, isBackendConfigured } from './apiClient';

/**
 * Cooperative milk traceability for PARAG (Pradeshik Cooperative Dairy
 * Federation, UP). PARAG is a FEDERATION of member DISTRICT COOPERATIVE DAIRY
 * UNIONS, not a single farm, so a pack's provenance is honestly framed as:
 *   batch/pack QR  ->  the member district dairy union + processing plant
 *                   +  the pack/batch dates
 *                   +  the quality tests that batch passed (FAT, SNF,
 *                      adulteration checks).
 * No single-farmer story, no invented names or photos.
 *
 * Data layer is local-first: seeded demo batches resolve fully offline so a
 * scan/typed code works in a demo. When EXPO_PUBLIC_API_URL is set the lookup
 * prefers the PARAG API (see the apiClient seam in lookupBatch). Every resolved
 * batch is also written to a per-user scan history table so the landing screen
 * (and a future quality dashboard) can show recent scans.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** One quality/safety test printed on the batch certificate. */
export type QualityTest = {
  /** Human label, e.g. "FAT", "SNF", "Added water". */
  name: string;
  /** Optional measured value shown next to the label, e.g. "4.1%". */
  value?: string;
  /** Whether the batch passed this test. */
  pass: boolean;
};

/** A production batch traced to a PARAG member district dairy union + plant. */
export type MilkBatch = {
  /** The code printed on the pack (canonical / normalized form). */
  batch_code: string;
  /** Product line the batch was packed as, e.g. "Toned Milk (Blue)". */
  product: string;
  /** Pack size copy, e.g. "500 ml pouch". */
  pack_size: string;
  /** ISO date the raw milk was pooled/collected for this batch. */
  batch_date: string;
  /** ISO datetime the batch was packed at the plant. */
  packed_at: string;
  /** ISO date the pack is best consumed before. */
  best_before: string;
  /** Member DISTRICT COOPERATIVE DAIRY UNION this batch belongs to. */
  union_name: string;
  /** The processing dairy / plant that packed the batch. */
  plant: string;
  /** District + state the union operates in. */
  district: string;
  state: string;
  /** Headline composition. */
  fat_pct: number;
  snf_pct: number;
  /** Number of member villages that poured into this batch (cooperative scale). */
  member_villages: number;
  /** Number of pouring farmer-members behind the batch (count only, no names). */
  pouring_members: number;
  /** Quality + adulteration tests the batch passed (FAT/SNF first). */
  tests: QualityTest[];
  /** True once the batch is verified against the federation's QA records. */
  verified: boolean;
};

/** A row in the per-user scan history (parag:milk_scans:<uid>). */
export type MilkScan = {
  id: string;
  /** The raw code the user scanned/typed. */
  entered_code: string;
  /** The resolved canonical batch code. */
  batch_code: string;
  /** Union the batch traced to (denormalized for the history list). */
  union_name: string;
  scanned_at: string;
};

// ── Batch code normalization ──────────────────────────────────────────────────

/**
 * Normalize a scanned/typed code to the canonical batch form. Handles the two
 * things a QR/barcode can carry: the plain code, or a `parag://trace/<code>`
 * (or https) deep link that wraps it. Upper-cases and trims so a hand-typed
 * code matches the printed one.
 */
export function normalizeBatchCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Unwrap a deep link / URL payload to just the batch token. Covers every
  // form a Saathi-minted QR can carry: the parag://trace/<ref> deep link, a
  // /trace/<ref> or /t/<ref> web-fallback URL (the operator's
  // EXPO_PUBLIC_PUBLIC_TRACE_URL format — hybrid note GET /t/{token}), or a
  // ?batch= query param — plus the bare code itself.
  const m = s.match(/(?:parag:\/\/trace\/|\/trace\/|\/t\/|[?&]batch=)([^/?&\s]+)/i);
  if (m && m[1]) s = m[1];
  s = s.trim().toUpperCase();
  return s || null;
}

// ── Seeded demo batches (offline) ─────────────────────────────────────────────
// Real-sounding UP member district dairy unions under the PARAG federation. All
// tests pass (a batch only forms from QA-approved collections). Codes follow the
// on-pack format PARAG-<UNION>-<YYYYMMDD>-<PRODUCT>-<seq>.

function tests(fat: number, snf: number): QualityTest[] {
  return [
    { name: 'FAT', value: `${fat}%`, pass: true },
    { name: 'SNF', value: `${snf}%`, pass: true },
    { name: 'Added water', pass: true },
    { name: 'Starch', pass: true },
    { name: 'Detergent', pass: true },
    { name: 'Urea', pass: true },
    { name: 'Neutralizers', pass: true },
    { name: 'Skim milk powder', pass: true },
    { name: 'Antibiotic residue', pass: true },
  ];
}

const SEED_BATCHES: MilkBatch[] = [
  {
    batch_code: 'PARAG-LKO-20260701-TM-014',
    product: 'Toned Milk (Blue)',
    pack_size: '500 ml pouch',
    batch_date: '2026-07-01',
    packed_at: '2026-07-01T05:40:00+05:30',
    best_before: '2026-07-03',
    union_name: 'Lucknow District Cooperative Dairy Union',
    plant: 'Parag Dairy Plant, Janeshwar Mishra, Lucknow',
    district: 'Lucknow',
    state: 'Uttar Pradesh',
    fat_pct: 3.0,
    snf_pct: 8.5,
    member_villages: 312,
    pouring_members: 4180,
    tests: tests(3.0, 8.5),
    verified: true,
  },
  {
    batch_code: 'PARAG-VNS-20260630-FCM-022',
    product: 'Full Cream Milk (Gold)',
    pack_size: '500 ml pouch',
    batch_date: '2026-06-30',
    packed_at: '2026-06-30T05:20:00+05:30',
    best_before: '2026-07-02',
    union_name: 'Varanasi District Cooperative Dairy Union',
    plant: 'Parag Dairy Plant, Ramnagar, Varanasi',
    district: 'Varanasi',
    state: 'Uttar Pradesh',
    fat_pct: 6.0,
    snf_pct: 9.0,
    member_villages: 268,
    pouring_members: 3540,
    tests: tests(6.0, 9.0),
    verified: true,
  },
  {
    batch_code: 'PARAG-KNP-20260629-DTM-009',
    product: 'Double Toned Milk (Green)',
    pack_size: '1 L pouch',
    batch_date: '2026-06-29',
    packed_at: '2026-06-29T05:10:00+05:30',
    best_before: '2026-07-01',
    union_name: 'Kanpur District Cooperative Dairy Union',
    plant: 'Parag Dairy Plant, Fazalganj, Kanpur',
    district: 'Kanpur Nagar',
    state: 'Uttar Pradesh',
    fat_pct: 1.5,
    snf_pct: 9.0,
    member_villages: 401,
    pouring_members: 5120,
    tests: tests(1.5, 9.0),
    verified: true,
  },
];

/** The demo codes surfaced on the landing so a scan-less demo still works. */
export const DEMO_BATCH_CODES: string[] = SEED_BATCHES.map((b) => b.batch_code);

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Resolve a scanned/typed code to its cooperative batch passport. Local-first:
 * matches a seeded demo batch offline; when the backend is configured it prefers
 * the PARAG API. Returns null when the code can't be traced (caller shows a
 * not-found state rather than masquerading another batch).
 */
// The backend leaves top-level fat_pct/snf_pct at 0 for per-samiti batch QRs —
// the real values live in the tests array as FAT_PCT / SNF_PCT (e.g. "4.2%").
// Backfill them so the passport's FAT/SNF stat cards match the test panel.
function hydrateBatch(b: MilkBatch): MilkBatch {
  const num = (name: string): number | null => {
    const t = (b.tests ?? []).find((x) => x.name === name);
    if (!t?.value) return null;
    const n = parseFloat(String(t.value).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...b,
    fat_pct: b.fat_pct || num('FAT_PCT') || 0,
    snf_pct: b.snf_pct || num('SNF_PCT') || 0,
  };
}

export async function lookupBatch(code: string): Promise<MilkBatch | null> {
  const norm = normalizeBatchCode(code);
  if (!norm) return null;

  // Backend seam: when parag-api is live, resolve the real batch record.
  // TODO(api): GET /traceability/:batchCode -> MilkBatch
  if (isBackendConfigured()) {
    try {
      const b = await api.get<MilkBatch>(`/traceability/${encodeURIComponent(norm)}`);
      if (b) return hydrateBatch(b);
    } catch {
      // fall through to the offline seed so a demo still resolves
    }
  }

  return SEED_BATCHES.find((b) => normalizeBatchCode(b.batch_code) === norm) ?? null;
}

/**
 * All batches available for the demo (recent QA-passed batches). A quality
 * dashboard can reuse this for a recent-tests / pass-rate view. Sorted newest
 * batch date first.
 */
export async function listBatches(): Promise<MilkBatch[]> {
  // TODO(api): GET /traceability/recent -> MilkBatch[]
  return [...SEED_BATCHES].sort((a, b) => b.batch_date.localeCompare(a.batch_date));
}

/** Convenience: how many of a batch's tests passed (all, for a QA-approved batch). */
export function testsPassed(batch: MilkBatch): number {
  return batch.tests.filter((t) => t.pass).length;
}

/**
 * Download the pack's provenance passport as a PDF. In backend mode it fetches
 * the server-rendered HTML label (all values + an embedded QR) — the same
 * app-key-gated endpoint the QR resolves through — and prints it to a PDF via
 * expo-print, then opens the share sheet. Offline it builds a minimal label from
 * the resolved batch so the demo still produces a document.
 */
export async function downloadBatchPassportPdf(batch: MilkBatch): Promise<void> {
  let html: string | null = null;
  if (isBackendConfigured()) {
    const norm = normalizeBatchCode(batch.batch_code) ?? batch.batch_code;
    try {
      html = await getText(`/traceability/${encodeURIComponent(norm)}/label`);
    } catch {
      html = null; // fall back to a client-built label below
    }
  }
  if (!html) html = buildOfflineLabelHtml(batch);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'PARAG milk passport' });
  }
}

/** Minimal self-contained label for the offline demo (no server QR image). */
function buildOfflineLabelHtml(b: MilkBatch): string {
  const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const rows = [
    ['Batch code', b.batch_code], ['Product', b.product], ['Pack size', b.pack_size],
    ['Member union', b.union_name], ['Processing plant', b.plant], ['District', `${b.district}, ${b.state}`],
    ['Fat', `${b.fat_pct}%`], ['SNF', `${b.snf_pct}%`], ['Best before', b.best_before],
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td style="font-weight:600">${esc(String(v))}</td></tr>`).join('');
  const tests = b.tests.map((t) => `<li>${t.pass ? '✓' : '✗'} ${esc(t.name)}${t.value ? ` (${esc(t.value)})` : ''}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:-apple-system,system-ui,sans-serif;padding:24px;background:#FFF6EC">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #f0e2d0">
<div style="font-weight:800;font-size:20px;color:#E8491D">PARAG</div>
<div style="color:#666;font-size:12px">Milk Provenance Passport</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">${rows}</table>
<h3 style="font-size:14px">Quality &amp; safety tests</h3><ul style="font-size:13px;color:#177245">${tests}</ul>
<div style="font-size:11px;color:#666;margin-top:12px">Scan the pack QR with the PARAG app to verify provenance.</div>
</div></body></html>`;
}

// ── Per-user scan history ─────────────────────────────────────────────────────

const SCANS_TABLE = 'milk_scans';
const MAX_HISTORY = 20;

/** Record a resolved batch in the signed-in user's scan history (best effort). */
export async function recordScan(enteredCode: string, batch: MilkBatch): Promise<void> {
  let uid: string | null = null;
  try {
    uid = await getUserId();
  } catch {
    uid = null;
  }
  if (!uid) return; // history is a signed-in nicety, never block the passport
  const rows = await getRows<MilkScan>(SCANS_TABLE, uid);
  // De-dupe: drop any earlier scan of the same batch, keep the newest on top.
  const kept = rows.filter((r) => r.batch_code !== batch.batch_code);
  const row: MilkScan = {
    id: newId('scan'),
    entered_code: enteredCode,
    batch_code: batch.batch_code,
    union_name: batch.union_name,
    scanned_at: new Date().toISOString(),
  };
  const next = [row, ...kept].slice(0, MAX_HISTORY);
  await setRows<MilkScan>(SCANS_TABLE, uid, next);
}

/** Recent batches the signed-in user has scanned, newest first. */
export async function listScanHistory(): Promise<MilkScan[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const rows = await getRows<MilkScan>(SCANS_TABLE, uid);
  return rows.sort((a, b) => b.scanned_at.localeCompare(a.scanned_at));
}

/** Clear the signed-in user's scan history. */
export async function clearScanHistory(): Promise<void> {
  const uid = await requireUserId();
  await setRows<MilkScan>(SCANS_TABLE, uid, []);
}
