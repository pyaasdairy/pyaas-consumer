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
 * No single-farmer story, no invented names or photos — and no invented TESTS:
 * a batch's composition and safety results come from the federation's QA record
 * via the API or the pack shows no passport at all. See the note above
 * DEV_BATCHES for what was deleted and why.
 *
 * Every resolved batch is written to a per-user scan history table so the
 * landing screen (and a future quality dashboard) can show recent scans.
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
  /** True when the batch has been RECALLED — overrides verified in the UI. */
  recalled?: boolean;
  /** Human recall notice shown to the consumer when recalled. */
  recall_notice?: string;
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

// ── Dev-only sample batches ───────────────────────────────────────────────────
//
// WHAT WAS HERE AND WHY IT IS GONE: three hand-written batches, each carrying
// nine all-pass lab results — added water, starch, detergent, UREA, neutralizers,
// skim milk powder and ANTIBIOTIC RESIDUE — stamped verified:true and attributed
// to real, named facilities ("Parag Dairy Plant, Ramnagar, Varanasi") and real
// district cooperative unions. Those tests were never run by anyone. The
// passport screen renders them as a safety verdict on food we sell, and
// downloadBatchPassportPdf turns them into a shareable "Milk Provenance
// Passport" document that outlives the app. Inventing an antibiotic-residue or
// adulteration pass is a false representation about an article of food (FSS Act
// 2006 s.53) and a misleading advertisement (Consumer Protection Act 2019 s.89),
// and it is exactly the fabricated content App Review rejects under Guideline
// 2.3.1. A real batch passport can only come from the federation's QA records,
// so lookupBatch now resolves against the API or not at all.
//
// The sample batch below exists ONLY to keep the passport UI workable while
// GET /traceability/:batchCode is unbuilt. __DEV__ is compiled out of any
// release bundle, so it cannot survive into a store build regardless of env
// (same rule as the demo order tools in app/order/[id].tsx). Its union, plant
// and batch code are deliberately fictional and self-labelling: no real
// cooperative or plant may appear next to a lab result it did not produce, not
// even in a screenshot taken off a dev build.
//
// BRANDING (deliberate, not a leftover): the PYAAS provenance story is "PYAAS
// milk is packed at PARAG federation plants", so the ONLY user-visible Parag
// strings in the app are (a) on-pack batch codes ('PARAG-…' — they must match
// what is printed on the pouch) and (b) real facility names ('Parag Dairy
// Plant, …'). Both must come from a real record, never from this file.

const DEV_BATCHES: MilkBatch[] = __DEV__
  ? [
      {
        batch_code: 'SAMPLE-DEV-0001',
        product: 'Toned Milk (Blue)',
        pack_size: '500 ml pouch',
        batch_date: '2026-07-01',
        packed_at: '2026-07-01T05:40:00+05:30',
        best_before: '2026-07-03',
        union_name: 'Sample Dairy Union (dev data)',
        plant: 'Sample Dairy Plant',
        district: 'Sample district',
        state: 'Uttar Pradesh',
        fat_pct: 3.0,
        snf_pct: 8.5,
        member_villages: 312,
        pouring_members: 4180,
        tests: [
          { name: 'FAT', value: '3.0%', pass: true },
          { name: 'SNF', value: '8.5%', pass: true },
        ],
        verified: true,
      },
    ]
  : [];

/**
 * Batch codes offered on the landing as tappable samples. EMPTY in a release
 * build — there is no such thing as a demo pack for a real customer, and a
 * "sample batch" that renders a full safety passport is the fabrication we just
 * deleted. Callers must handle the empty case (hide the card / drop the
 * placeholder) rather than assume an element exists.
 */
export const DEMO_BATCH_CODES: string[] = DEV_BATCHES.map((b) => b.batch_code);

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Resolve a scanned/typed code to its cooperative batch passport. The API is the
 * ONLY source of a real passport: a batch's composition and safety results are
 * the federation's QA record, not something this app may compose. Returns null
 * when the code can't be traced — the caller shows its not-found state rather
 * than masquerading another batch or an invented one.
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
      // Network blip or an unknown code: fall through to null. We must NOT
      // substitute a stand-in batch — a passport for the wrong milk is worse
      // than no passport.
    }
  }

  return DEV_BATCHES.find((b) => normalizeBatchCode(b.batch_code) === norm) ?? null;
}

/**
 * Recent QA-passed batches, newest batch date first. Empty until the API serves
 * them (dev builds see the sample batch only).
 */
export async function listBatches(): Promise<MilkBatch[]> {
  // TODO(api): GET /traceability/recent -> MilkBatch[]
  return [...DEV_BATCHES].sort((a, b) => b.batch_date.localeCompare(a.batch_date));
}

/** Convenience: how many of the batch record's tests came back as a pass. */
export function testsPassed(batch: MilkBatch): number {
  return batch.tests.filter((t) => t.pass).length;
}

/**
 * Download the pack's provenance passport as a PDF. In backend mode it fetches
 * the server-rendered HTML label (all values + an embedded QR) — the same
 * app-key-gated endpoint the QR resolves through — and prints it to a PDF via
 * expo-print, then opens the share sheet. If that endpoint is unreachable it
 * renders the batch record already on screen, so the document only ever repeats
 * values that came from a real lookup; it never adds a claim of its own.
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
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'PYAAS milk passport' });
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
<div style="font-weight:800;font-size:20px;color:#E8491D">PYAAS</div>
<div style="color:#666;font-size:12px">Milk Provenance Passport</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">${rows}</table>
<h3 style="font-size:14px">Quality &amp; safety tests</h3><ul style="font-size:13px;color:#177245">${tests}</ul>
<div style="font-size:11px;color:#666;margin-top:12px">Scan the pack QR with the PYAAS app to verify provenance.</div>
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
