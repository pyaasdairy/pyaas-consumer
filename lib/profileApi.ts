import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requireUserId, getUserId, getProfile, saveProfile, signOut, removeAccountEntry,
  getHydratedProfile, setHydratedProfile, PROFILE_OUTBOX_TABLE, type Profile,
  LOCAL_AVATAR_KEY, isDeviceAvatar, adoptLegacyAvatar,
} from './session';
import { getSingle, putSingle, dropTable } from './localStore';
import { api, isBackendConfigured } from './apiClient';
import { registerMirrorHandler, enqueueMirror, mirrorOutcomeFor, type MirrorOutcome } from './mirrorQueue';
import { getAutopay, cancelAutopay, type AutopayMandate } from './walletApi';
import { listSubscriptions, setSubscriptionStatus } from './subscriptions';
import { removeFreePackClaimsForUser } from './freePack';

/**
 * Extended profile + avatar. In backend mode the profile is GET/PATCH /me; in
 * offline mode it is the on-device store and the picked photo's local URI is
 * stored directly as the avatar.
 */

/**
 * The avatar in backend mode. The consumer presign (POST /uploads/presign)
 * mints only complaint_photo and door_photo uploads, and GET /me hands
 * avatar_url back as stored, so there is no server home for a profile photo
 * yet. A picked photo therefore stays on this phone: its local URI is kept
 * here per account and laid over the server's profile, and PATCH /me only
 * ever carries an avatar_url that already lives on a server (http/https).
 * A file:// path on the server is one no other phone, and no reinstall, can
 * load, so such a path read from GET /me is dropped (profileFromMe) and only
 * this phone's own photo is laid back over it. The key carries the uid, so
 * sign-out (session.signOut, backend mode) and deleteMyAccount erase it with
 * the account's other rows. LOCAL_AVATAR_KEY, isDeviceAvatar and
 * adoptLegacyAvatar live in session, which also reads an older build's local
 * profile row.
 */

async function getLocalAvatar(uid: string): Promise<string | null> {
  try { return (await AsyncStorage.getItem(LOCAL_AVATAR_KEY(uid))) || null; } catch { return null; }
}

async function setLocalAvatar(uid: string, uri: string | null): Promise<void> {
  try {
    if (uri) await AsyncStorage.setItem(LOCAL_AVATAR_KEY(uid), uri);
    else await AsyncStorage.removeItem(LOCAL_AVATAR_KEY(uid));
  } catch { /* the in-memory profile still shows it this session */ }
}

/** What of a profile edit may reach PATCH /me: a device-path avatar_url is
 *  dropped (an older build's outbox row can still carry one). */
function forServer(body: Partial<Profile>): Partial<Profile> {
  if (!isDeviceAvatar(body.avatar_url)) return body;
  const { avatar_url: _onDevice, ...rest } = body;
  return rest;
}

/** The profile with this phone's own photo, when it has one, as the avatar. */
async function withLocalAvatar(uid: string, profile: Profile): Promise<Profile> {
  const local = await getLocalAvatar(uid);
  return local ? { ...profile, avatar_url: local } : profile;
}

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
  // ordering here is load-bearing, not best-effort decoration.
  // The mandate READ is not best-effort. In backend mode getAutopay reads
  // GET /mandate/me; if that read fails, deletion STOPS here, before
  // /me/erasure, because the alternative is erasing the account under a
  // mandate nobody could see.
  let autopay: AutopayMandate | null;
  try {
    autopay = await getAutopay();
  } catch {
    throw new Error('Could not check your AutoPay mandate, so nothing was deleted. Check your connection and try again.');
  }
  // G3: a mandate the server shows as live (pending, active or paused) is
  // cancelled here, and a cancel that fails STOPS deletion before
  // /me/erasure with the reason: erasing the account would leave the mandate
  // charging with nobody to see it. No live mandate, nothing to cancel.
  if (autopay?.id && autopay.status !== 'cancelled') {
    try {
      await cancelAutopay(autopay.id);
    } catch {
      throw new Error('Could not cancel your AutoPay mandate, so nothing was deleted. Check your connection and try again, or cancel AutoPay from the wallet first.');
    }
  }
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

/** The profile as GET /me and PATCH /me return it (the server's field names;
 *  an absent or empty field is null, the server having no value for it). An
 *  avatar_url that is a device path (an older build PATCHed the picked
 *  photo's file:// URI) is null too: only the phone that wrote it can load
 *  it, and adoptServerProfile lays this phone's own photo back over it. */
export function profileFromMe(me: Record<string, unknown>, uid: string): Profile {
  const str = (k: string): string | null => {
    const v = me[k];
    return typeof v === 'string' && v.trim() !== '' ? v : null;
  };
  const n = me.family_member_count;
  return {
    id: uid,
    full_name: str('full_name'),
    phone: str('phone'),
    email: str('email'),
    alternate_phone: str('alternate_phone'),
    family_member_count: typeof n === 'number' && n > 0 ? n : null,
    milk_preference: str('milk_preference'),
    avatar_url: isDeviceAvatar(me.avatar_url) ? null : str('avatar_url'),
    referral_code: str('referral_code'),
    delivery_slot: str('delivery_slot'),
  };
}

/** The server's answer becomes the in-memory profile. An edit still waiting in
 *  the outbox is laid over it (newer than what the server holds), a
 *  server-known name marks setup done for this account (the cold-start gate,
 *  see session.signInWithPhone), this phone's own photo stays the avatar
 *  (LOCAL_AVATAR_KEY), and an older build's local profile row, now a stale
 *  copy of what was just fetched, is dropped, its device-path photo first
 *  kept as this phone's own (session.adoptLegacyAvatar). */
async function adoptServerProfile(uid: string, me: Record<string, unknown>): Promise<void> {
  const outbox = await getSingle<Partial<Profile>>(PROFILE_OUTBOX_TABLE, uid).catch(() => null);
  await adoptLegacyAvatar(uid, await getSingle<Profile>('profile', uid).catch(() => null));
  const profile = await withLocalAvatar(uid, { ...profileFromMe(me, uid), ...(outbox ?? {}), id: uid });
  if (profile.full_name?.trim()) {
    try { await AsyncStorage.setItem(`pyaas_setup_done:${uid}`, '1'); } catch { /* the gate also accepts the name itself */ }
  }
  await dropTable('profile', uid).catch(() => undefined);
  setHydratedProfile(uid, profile);
}

/**
 * Pull the server's profile into the in-memory copy (cold start, reinstall,
 * second device: the account remembered everything, the app just never
 * asked). Server-wins per field; a PATCH still waiting in the outbox is laid
 * over it, so an offline edit is never wiped by older truth.
 */
export async function hydrateProfileFromServer(): Promise<void> {
  if (!isBackendConfigured()) return;
  try {
    const uid = await getUserId();
    if (!uid) return;
    const me = await api.get<Record<string, unknown>>('/me');
    if (!me || typeof me !== 'object') return;
    await adoptServerProfile(uid, me);
  } catch {
    /* offline — the next session start retries */
  }
}

export async function updateProfile(patch: Partial<Omit<FullProfile, 'id' | 'referral_code'>>): Promise<void> {
  if (!isBackendConfigured()) {
    await saveProfile(patch as Partial<Profile>);
    return;
  }
  // PATCH /me is authoritative: the server's answer becomes the in-memory
  // profile, so full_name survives reinstalls and new devices and a
  // registered member is NEVER asked their name again. An edit still waiting
  // in the outbox from an earlier failure rides along, so nothing typed
  // offline is overtaken by a later edit. Only when the PATCH fails is
  // anything written to the device: the merged edit goes to the outbox,
  // shows at once from memory, and the 'profile' mirror handler below
  // replays it. A permanent rejection is surfaced, not queued.
  // An avatar named in this edit is the member's photo from now on: a device
  // path stays on this phone and is never sent (LOCAL_AVATAR_KEY); any other
  // value is sent and replaces the phone's own photo.
  const uid = await requireUserId();
  const edit = patch as Partial<Profile>;
  if (edit.avatar_url !== undefined) await setLocalAvatar(uid, isDeviceAvatar(edit.avatar_url) ? edit.avatar_url : null);
  const queued = await getSingle<Partial<Profile>>(PROFILE_OUTBOX_TABLE, uid).catch(() => null);
  const body = forServer({ ...(queued ?? {}), ...edit });
  const localAvatar = await getLocalAvatar(uid);
  const overlay = (p: Profile): Profile => ({ ...p, ...body, ...(localAvatar ? { avatar_url: localAvatar } : {}) });
  const shown = (): Profile => overlay(getHydratedProfile(uid) ?? { id: uid, full_name: null, phone: null });
  // Nothing left for the server (the edit was only a photo kept on this
  // phone): the profile shown so far, with the new photo, and no request.
  if (Object.keys(body).length === 0 && isDeviceAvatar(edit.avatar_url)) {
    setHydratedProfile(uid, overlay((await getProfile()) ?? { id: uid, full_name: null, phone: null }));
    return;
  }
  try {
    const me = await api.patch<Record<string, unknown>>('/me', body);
    await dropTable(PROFILE_OUTBOX_TABLE, uid).catch(() => undefined);
    if (me && typeof me === 'object') await adoptServerProfile(uid, me);
    else setHydratedProfile(uid, shown());
  } catch (e) {
    if (mirrorOutcomeFor(e) === 'drop') throw e;
    setHydratedProfile(uid, shown());
    await putSingle<Partial<Profile>>(PROFILE_OUTBOX_TABLE, uid, body);
    await enqueueMirror('profile');
  }
}

// The outbox replay: the queued edit reaches PATCH /me and the row is deleted;
// no row means it already landed (a later online save carried it). A
// device-path avatar an older build queued is never sent (LOCAL_AVATAR_KEY).
registerMirrorHandler('profile', async (): Promise<MirrorOutcome> => {
  const uid = await getUserId();
  if (!uid) return 'done';
  const queued = await getSingle<Partial<Profile>>(PROFILE_OUTBOX_TABLE, uid);
  if (!queued) return 'done';
  const body = forServer(queued);
  if (Object.keys(body).length === 0) {
    await dropTable(PROFILE_OUTBOX_TABLE, uid);
    return 'done';
  }
  let me: Record<string, unknown>;
  try {
    me = await api.patch<Record<string, unknown>>('/me', body);
  } catch (e) {
    const outcome = mirrorOutcomeFor(e);
    // A permanent rejection must not leave the edit shown as pending forever.
    if (outcome === 'drop') await dropTable(PROFILE_OUTBOX_TABLE, uid).catch(() => undefined);
    return outcome;
  }
  await dropTable(PROFILE_OUTBOX_TABLE, uid);
  if (me && typeof me === 'object') await adoptServerProfile(uid, me);
  return 'done';
});

/**
 * Let the user pick a photo and set it as their avatar. Returns the picked
 * photo's URI for the screen to preview, or null if they cancelled. In offline
 * mode the local URI is stored as the avatar. In backend mode there is no
 * avatar upload kind on the server yet (see LOCAL_AVATAR_KEY), so the photo is
 * kept on this phone for this account and nothing is sent: updateProfile never
 * lets a device path reach PATCH /me.
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
