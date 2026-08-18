import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireUserId, getProfile, saveProfile, signOut, removeAccountEntry, type Profile } from './session';
import { api, isBackendConfigured } from './apiClient';
import { getAutopay, cancelAutopay } from './walletApi';
import { listSubscriptions, setSubscriptionStatus } from './subscriptions';
import { removeFreePackClaimsForUser } from './freePack';

/**
 * Extended profile + avatar. Runs against the on-device store; when parag-api is
 * live these map to GET/PATCH /users/me and an S3-backed avatar upload (the
 * bucket below matches infra/aws/terraform, prefix avatars/<uid>). In offline
 * mode the picked photo's local URI is stored directly as the avatar.
 */

// Public S3 prefix for avatars once the backend is live (see parag-api S3 config).
const AVATAR_PREFIX = 'avatars';

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

function toFull(p: Profile | null): FullProfile | null {
  if (!p) return null;
  return {
    id: p.id,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    alternate_phone: p.alternate_phone ?? null,
    family_member_count: p.family_member_count ?? null,
    milk_preference: p.milk_preference ?? null,
    avatar_url: p.avatar_url ?? null,
    referral_code: p.referral_code ?? null,
    delivery_slot: p.delivery_slot ?? null,
  };
}

/** Permanently delete the signed-in user's account + data, then sign out.
 * (App Store / Play require an in-app deletion path for apps with accounts.)
 * In backend mode this erases the SERVER account first (POST /me/erasure →
 * cascade delete) so the promise — wallet closed, subscriptions removed, details
 * erased — is real. If that call fails we surface the error and DON'T wipe local
 * state (so the user isn't left signed-out over a still-live server account). */
export async function deleteMyAccount(): Promise<void> {
  const uid = await requireUserId();

  // Cancel the recurring commitments FIRST, while the account still exists and
  // the access token is still valid — a live UPI mandate or a sweeping
  // subscription must never outlive the account. These run BEFORE /me/erasure
  // (the erasure cascade does not itself revoke gateway mandates), so the
  // ordering here is load-bearing, not best-effort decoration. A cancel that
  // throws still lets deletion proceed, but it is attempted against a live
  // session rather than a half-erased one.
  try {
    const autopay = await getAutopay();
    if (autopay?.id && autopay.status !== 'cancelled') await cancelAutopay(autopay.id);
  } catch { /* nothing to cancel, or offline */ }
  try {
    const subs = await listSubscriptions();
    for (const s of subs) {
      if (s.status !== 'cancelled') await setSubscriptionStatus(s.id, 'cancelled');
    }
  } catch { /* nothing to cancel */ }

  if (isBackendConfigured()) {
    await api.post('/me/erasure', {});
  }

  // The old filter was `startsWith('parag:') && endsWith(':' + uid)`. That looks
  // exhaustive and is not — it provably missed four classes of key, each holding
  // PII, while the UI told the user "Your personal details are permanently
  // erased" (Guideline 5.1.1(v), DPDP Act 2023 s.8(5)):
  //
  //   1. 'parag:accounts'          ends in 'accounts', not ':<uid>'. Held email,
  //                                name, phone AND a CLEARTEXT password.
  //   2. 'parag:free_pack_claims:device'  device-scoped, holds the raw mobile.
  //   3. 'pyaas_*:<uid>'           wrong prefix entirely.
  //   4. uid IS the phone number   (uid = `u_${phone10}`), so any surviving key
  //                                leaks it in the key NAME, not just the value.
  const keys = await AsyncStorage.getAllKeys();
  const doomed = new Set<string>();

  for (const k of keys) {
    // Everything owned by this uid, under either prefix.
    if (k.endsWith(`:${uid}`)) doomed.add(k);
    // Legacy/global per-user flags that embed the uid anywhere in the key.
    if (k.includes(uid)) doomed.add(k);
  }

  // The email/password registry is a single global blob — prune just this
  // account's entry rather than nuking other profiles on a shared device.
  await removeAccountEntry(uid);

  // Device-global free-pack claims store the raw phone number to stop re-claims.
  // Drop only the rows belonging to this member.
  try { await removeFreePackClaimsForUser(uid); } catch { /* table may not exist */ }

  if (doomed.size) await AsyncStorage.multiRemove([...doomed]);

  // Keychain items survive an app uninstall, so a "deleted" user is re-identified
  // by the same device id on reinstall.
  try { await SecureStore.deleteItemAsync('parag_device_id'); } catch { /* fine */ }

  await signOut();
}

export async function getFullProfile(): Promise<FullProfile | null> {
  return toFull(await getProfile());
}

export async function updateProfile(patch: Partial<Omit<FullProfile, 'id' | 'referral_code'>>): Promise<void> {
  // Push to the SERVER first (PATCH /me) so the profile — especially full_name —
  // survives reinstalls and new devices: OTP verify hydrates it back, and a
  // registered member is NEVER asked their name again. Best-effort: offline
  // still saves locally below and re-syncs on the next profile edit.
  if (isBackendConfigured()) {
    try { await api.patch('/me', patch); } catch { /* offline — local save still lands */ }
  }
  await saveProfile(patch as Partial<Profile>);
}

/**
 * Let the user pick a photo and set it as their avatar. Returns the new avatar
 * URL, or null if they cancelled. In offline mode the photo's local URI is used
 * directly; with the backend live, upload the bytes to S3 under
 * `${AVATAR_PREFIX}/<uid>` and store the returned public URL.
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
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  if (!asset.uri) throw new Error('Could not read that photo. Please try another one.');

  const url = asset.uri;
  await updateProfile({ avatar_url: url });
  return url;
}

export async function getReferralStats(): Promise<{ count: number; earned: number }> {
  // Referral programme is not part of the PYAAS consumer app.
  return { count: 0, earned: 0 };
}
