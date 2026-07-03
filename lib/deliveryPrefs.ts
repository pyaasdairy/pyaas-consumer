import { supabase } from './supabase';

export type DeliveryPrefs = {
  call_before: boolean;
  ring_bell: boolean;
  voice_instructions_url: string | null;
  door_image_url: string | null;
  notes: string | null;
};

export const DEFAULT_PREFS: DeliveryPrefs = {
  call_before: false,
  ring_bell: true,
  voice_instructions_url: null,
  door_image_url: null,
  notes: null,
};

export async function getDeliveryPrefs(): Promise<DeliveryPrefs> {
  const { data, error } = await supabase
    .from('delivery_preferences')
    .select('call_before, ring_bell, voice_instructions_url, door_image_url, notes')
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_PREFS };
  return data as DeliveryPrefs;
}

export async function saveDeliveryPrefs(prefs: Partial<DeliveryPrefs>): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('delivery_preferences')
    .upsert({ user_id: uid, ...prefs, updated_at: new Date().toISOString() });
  if (error) throw error;
}
