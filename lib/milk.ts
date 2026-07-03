import { supabase } from './supabase';

export type MilkPassport = {
  id: string;
  batch_code: string;
  product_line: string | null;
  snf: number | null;
  fat: number | null;
  farmer_name: string | null;
  village: string | null;
  collection_centre: string | null;
  collection_time: string | null;
  collected_at: string | null;
  packaged_at: string | null;
  delivered_at: string | null;
  temperature_c: number | null;
  freshness_score: number | null;
  adulteration_passed: boolean | null;
  report_url: string | null;
  qr_payload: string | null;
};

/** Map a row of the unified ops bridge view (v_public_traceability) to a passport. */
function fromBridge(v: any): MilkPassport {
  return {
    id: v.batch_code,
    batch_code: v.batch_code,
    product_line: null,
    snf: v.snf != null ? Number(v.snf) : null,
    fat: v.fat != null ? Number(v.fat) : null,
    farmer_name: v.lead_farmer_name ?? null,
    village: v.lead_farmer_village ?? null,
    collection_centre: v.collection_centre ?? null,
    collection_time: v.production_date ?? null,
    collected_at: v.production_date ?? null,
    packaged_at: v.packaged_at ?? null,
    delivered_at: null,
    temperature_c: null,
    freshness_score: null,
    adulteration_passed: true, // a batch only forms from quality-approved collections
    report_url: null,
    qr_payload: v.qr_payload ?? `pyaas://trace/${v.batch_code}`,
  };
}

/** The customer's most recent milk batch (Know Your Milk + Quality dashboard). */
export async function getMilkPassport(): Promise<MilkPassport | null> {
  // 1) Prefer the per-customer RPC (their delivered batch's lab trace).
  const rpc = await supabase.rpc('my_milk_passport');
  if (!rpc.error && rpc.data) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (row) return row as MilkPassport;
  }
  // 2) Rider-uploaded sample, if any.
  const sample = await supabase
    .from('traceability_samples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sample.data) return sample.data as MilkPassport;
  // 3) Unified ops truth: the latest real production batch (farm-to-bottle bridge).
  const bridge = await supabase
    .from('v_public_traceability')
    .select('*')
    .order('production_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return bridge.data ? fromBridge(bridge.data) : null;
}

/** Resolve a scanned/entered batch code to its passport (QR "Know your milk"). */
export async function getMilkPassportByBatch(batchCode: string): Promise<MilkPassport | null> {
  const code = batchCode.trim();
  // Prefer a rider-uploaded sample (richer), else the ops bridge view.
  const sample = await supabase
    .from('traceability_samples')
    .select('*')
    .eq('batch_code', code)
    .maybeSingle();
  if (sample.data) return sample.data as MilkPassport;
  const bridge = await supabase
    .from('v_public_traceability')
    .select('*')
    .eq('batch_code', code)
    .maybeSingle();
  return bridge.data ? fromBridge(bridge.data) : null;
}

export type AppStats = Record<string, { value: number; label: string; unit: string }>;

export async function getAppStats(): Promise<AppStats> {
  const { data, error } = await supabase.from('app_stats').select('key, value, label, unit');
  const out: AppStats = {};
  if (!error && data) {
    for (const r of data as any[]) out[r.key] = { value: Number(r.value), label: r.label, unit: r.unit ?? '' };
  }
  return out;
}
