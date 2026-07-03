import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Avatars live in the public bucket under avatars/<uid>.* · the storage RLS only
// lets a signed-in user write paths that start with their own uid.
const AVATAR_BUCKET = 'pyaas-public';

export type FullProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  alternate_phone: string | null;
  family_member_count: number | null;
  milk_preference: string | null;
  avatar_url: string | null;
  referral_code: string | null;
  delivery_slot: string | null;
};

/** Permanently delete the signed-in user's account + personal data, then sign
 * out. Backed by the SECURITY DEFINER RPC in supabase/pyaas_v8_account_deletion.sql.
 * (App Store / Play require an in-app deletion path for apps with accounts.) */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function getFullProfile(): Promise<FullProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email, alternate_phone, family_member_count, milk_preference, avatar_url, referral_code, delivery_slot')
    .maybeSingle();
  if (error) return null;
  return (data as FullProfile) ?? null;
}

export async function updateProfile(patch: Partial<Omit<FullProfile, 'id' | 'referral_code'>>): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  // Upsert (not update): a freshly-created auth user may not have a profiles row
  // yet, in which case .update() matches 0 rows and silently "succeeds" while
  // nothing persists. Upsert creates the row (requires the "profiles self insert"
  // RLS policy) or updates the existing one.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: uid, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Let the user pick a photo from their library and set it as their avatar.
 * Returns the new public avatar URL, or null if they cancelled the picker.
 * Throws (with a friendly message) if access is denied or the upload fails.
 */
export async function pickAndUploadAvatar(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo access is off. Turn it on in Settings to set a picture.');
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  if (!asset.base64) throw new Error('Could not read that photo. Please try another one.');

  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');

  // One fixed file per user (upsert replaces it); a ?t= cache-buster on the
  // stored URL forces the new image to show even though the path is unchanged.
  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `avatars/${uid}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, decode(asset.base64), { contentType, upsert: true });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;
  await updateProfile({ avatar_url: url });
  return url;
}

export async function getReferralStats(): Promise<{ count: number; earned: number }> {
  const { data, error } = await supabase
    .from('referrals')
    .select('reward_amount, status');
  if (error || !data) return { count: 0, earned: 0 };
  const credited = data.filter((r: any) => r.status === 'credited');
  return { count: credited.length, earned: credited.reduce((s: number, r: any) => s + Number(r.reward_amount ?? 0), 0) };
}
