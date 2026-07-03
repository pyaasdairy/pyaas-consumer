import { supabase } from './supabase';

export type Farmer = {
  id: string;
  name: string;
  herd_size: number | null;
  snf: number | null;
  fat: number | null;
  milking_timings: string | null;
  cow_feed: string | null;
  years_experience: number | null;
  photo_url: string | null;
};

export type Farm = {
  id: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  photo_url: string | null;
  farmers?: Farmer[];
  distance_km?: number;
};

export async function listFarms(): Promise<Farm[]> {
  const { data, error } = await supabase
    .from('farms')
    .select('id, name, city, lat, lng, photo_url, farmers:farmers(*)');
  if (error) return [];
  return (data ?? []) as Farm[];
}

/** Nearest farm to a coordinate (uses the nearest_farm SQL fn, then hydrates). */
export async function nearestFarm(lat: number, lng: number): Promise<Farm | null> {
  const { data, error } = await supabase.rpc('nearest_farm', { p_lat: lat, p_lng: lng });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    // fall back to the first farm if the RPC isn't available yet
    const farms = await listFarms();
    return farms[0] ?? null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const { data: farm } = await supabase
    .from('farms')
    .select('id, name, city, lat, lng, photo_url, farmers:farmers(*)')
    .eq('id', row.farm_id)
    .maybeSingle();
  if (!farm) return null;
  return { ...(farm as Farm), distance_km: row.distance_km };
}
