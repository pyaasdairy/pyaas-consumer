import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSingle, putSingle, dropTable } from './localStore';

/** New accounts start with an EMPTY wallet. Money only ever enters the wallet
 *  through a real Razorpay top-up (see lib/razorpay.ts) or the one legit Rs29
 *  free-pack promo credit — never a free seed on sign-in. */
const DEMO_WALLET_SEED = 0;

/**
 * Session + profile for the PYAAS consumer app.
 *
 * In this build the phone-OTP flow runs against the on-device store (demo /
 * offline mode): any 10-digit number plus the demo code signs in and gets a
 * stable per-phone account. When the NestJS backend is deployed, swap the demo
 * sign-in for apiClient POST /auth/otp/request + /auth/otp/verify (which return
 * JWT access + refresh tokens) and read the profile from GET /users/me. The rest
 * of the app already goes through this module, so only these functions change.
 */

export type SessionUser = { id: string };
export type Session = { user: SessionUser } | null;

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email?: string | null;
  alternate_phone?: string | null;
  family_member_count?: number | null;
  milk_preference?: string | null;
  avatar_url?: string | null;
  referral_code?: string | null;
  delivery_slot?: string | null;
};

const UID_KEY = 'parag_current_uid';
/** Demo OTP that signs in any number when there is no live SMS backend. */
export const DEMO_OTP = '123456';

// ── User id derivation ───────────────────────────────────────────────────────
// The uid used to BE the phone number (`u_<10 digits>`), which leaked the
// number into every AsyncStorage key name, backend query string and diag line.
// New sessions get either the SERVER's own profile id (backend mode — correct
// for server association by construction) or a random local id. A device-local
// phone→uid index (phone stored only as a short hash) keeps repeat local
// logins landing on the same account without a phone-derived key anywhere.
const UID_INDEX_KEY = 'parag_uid_index';
const LOGIN_PHONE_KEY = 'parag_login_phone';
const LEGACY_UID_RE = /^u_\d{10}$/;

function hash10(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Random local id. An IDENTIFIER, not a secret — collision odds on one device
 *  are negligible and nothing authorizes off this value. */
function newLocalUid(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `usr_${Date.now().toString(36)}${rand()}${rand()}`;
}

async function readUidIndex(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(UID_INDEX_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeUidIndexEntry(digits: string, uid: string): Promise<void> {
  const idx = await readUidIndex();
  idx[hash10(digits)] = uid;
  await AsyncStorage.setItem(UID_INDEX_KEY, JSON.stringify(idx));
}

/** Copy every AsyncStorage row keyed by (or internally referencing) `fromUid`
 *  to `toUid`, flip the session pointer, then delete the old rows. The
 *  write-new → flip-pointer → delete-old order makes a crash at ANY step
 *  re-runnable: the legacy pattern is still detected next launch and the
 *  copies are idempotent overwrites. The phone VALUE (+91…) never matches the
 *  `u_<digits>` token, so profile data itself is untouched. */
async function migrateUidData(fromUid: string, toUid: string): Promise<void> {
  try {
    const { preserveReferralCode } = await import('./referrals');
    await preserveReferralCode(fromUid, toUid);
  } catch { /* code re-derives from the new uid if this misses */ }
  const keys = await AsyncStorage.getAllKeys();
  const affected = keys.filter((k) => k.includes(fromUid));
  for (const k of affected) {
    const v = await AsyncStorage.getItem(k);
    if (v == null) continue;
    await AsyncStorage.setItem(k.split(fromUid).join(toUid), v.split(fromUid).join(toUid));
  }
  await AsyncStorage.setItem(UID_KEY, toUid);
  currentUid = toUid;
  if (affected.length) await AsyncStorage.multiRemove(affected);
  try {
    const { linkDisclosureToAccount } = await import('./dataConsent');
    await linkDisclosureToAccount(toUid);
  } catch { /* best-effort consent audit trail */ }
}

/** The OTP-verified phone of the CURRENT login (device-scoped, last 10
 *  digits). The Play-reviewer gate compares against THIS — never the editable
 *  profile phone field, and no longer the uid shape. */
export async function getLoginPhone(): Promise<string | null> {
  return AsyncStorage.getItem(LOGIN_PHONE_KEY);
}

let currentUid: string | null = null;
// Bumped at the start of every sign-in. The detached goodbyes signOut fires
// (push unbind, token revoke, token wipe) compare against it so a sign-in that
// lands while they are in flight is never revoked or wiped by the previous one.
let sessionEpoch = 0;
const listeners = new Set<() => void>();

export function onSessionChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  listeners.forEach((l) => l());
}

// -- Backend mode: the hydrated profile ---------------------------------------
// The server owns the profile; what the app shows in backend mode is this
// in-memory copy. It is seeded synchronously from the OTP sign-in response
// (before the emit, so the router gate sees a returning member's name at
// once), refreshed from GET /me by profileApi.hydrateProfileFromServer, and
// cleared on sign-out. It is never written to the device: the local 'profile'
// row is local mode's store, and in backend mode the only local row is the
// OUTBOX below, holding a PATCH /me that failed until it is replayed.
let hydratedProfile: { uid: string; profile: Profile } | null = null;

/** Backend mode's offline outbox: the merged patch of a PATCH /me that failed,
 *  replayed by profileApi's 'profile' mirror handler and deleted once it lands. */
export const PROFILE_OUTBOX_TABLE = 'profile_outbox';

/** The in-memory profile held for `uid`, or null when none was hydrated yet. */
export function getHydratedProfile(uid: string): Profile | null {
  return hydratedProfile?.uid === uid ? hydratedProfile.profile : null;
}

/** Replace the in-memory profile for `uid` (backend mode) and tell the auth
 *  gate, the same way saveProfile does after a local write. */
export function setHydratedProfile(uid: string, profile: Profile): void {
  hydratedProfile = { uid, profile: { ...profile, id: uid } };
  emit();
}

// -- Backend mode: the profile photo kept on this phone -----------------------
// There is no server home for a profile photo yet (see profileApi), so a
// picked photo stays on the phone that picked it, per account, under this
// key. The uid in the key lets sign-out and deleteMyAccount erase it with the
// account's other rows. An avatar_url that is a device path is shown only as
// this phone's own photo: the same path from GET /me is one only the phone
// that wrote it can load, never another phone or a reinstall.
export const LOCAL_AVATAR_KEY = (uid: string): string => `pyaas_avatar_local:${uid}`;

/** A non-empty avatar_url that is not an http(s) URL: a path on one device. */
export function isDeviceAvatar(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && !/^https?:\/\//i.test(v.trim());
}

/** An older build kept the profile, avatar included, in a local 'profile'
 *  row, and PATCHed a picked photo's device path to the server as it was.
 *  Before that row is dropped, a device-path avatar in it becomes this
 *  phone's own photo, unless the phone already has one, so a phone upgraded
 *  from that build keeps showing the photo it showed. */
export async function adoptLegacyAvatar(uid: string, legacy: Partial<Profile> | null): Promise<void> {
  if (!legacy || !isDeviceAvatar(legacy.avatar_url)) return;
  try {
    if (!(await AsyncStorage.getItem(LOCAL_AVATAR_KEY(uid)))) await AsyncStorage.setItem(LOCAL_AVATAR_KEY(uid), legacy.avatar_url);
  } catch { /* the in-memory copy still shows it this session */ }
}

/** Load the persisted session on cold start. */
export async function loadSession(): Promise<Session> {
  currentUid = await AsyncStorage.getItem(UID_KEY);
  // One-time repair of the legacy phone-derived uid — LOCAL mode only. In
  // backend mode the id must follow the SERVER's own profile id, which we only
  // learn at the next OTP verify (signInWithPhone adopts it there); changing
  // the id under a live server session on our own could orphan server rows.
  if (currentUid && LEGACY_UID_RE.test(currentUid)) {
    try {
      const { isBackendConfigured } = await import('./apiClient');
      if (!isBackendConfigured()) {
        const oldUid = currentUid;
        const digits = oldUid.slice(2);
        const toUid = newLocalUid();
        await migrateUidData(oldUid, toUid);
        await writeUidIndexEntry(digits, toUid);
      }
    } catch { /* keep the legacy uid — never risk the member's data */ }
  }
  return currentUid ? { user: { id: currentUid } } : null;
}

export function getSessionSync(): Session {
  return currentUid ? { user: { id: currentUid } } : null;
}

/** The signed-in user id, or throw. Every data-layer write uses this. */
export async function requireUserId(): Promise<string> {
  if (!currentUid) currentUid = await AsyncStorage.getItem(UID_KEY);
  if (!currentUid) throw new Error('Not signed in.');
  return currentUid;
}

/** The signed-in user id, or null (never throws). */
export async function getUserId(): Promise<string | null> {
  if (!currentUid) currentUid = await AsyncStorage.getItem(UID_KEY);
  return currentUid;
}

/** Sign in with a phone number. Creates the account + a profile row on first
 *  use, keyed stably so repeat logins return the same data. Pass the
 *  server-known `fullName` (from OTP verify) so a RETURNING member's name is
 *  written BEFORE the emit — the router gate then never even flashes the
 *  complete-profile step on a fresh device. */
export async function signInWithPhone(phone: string, fullName?: string | null, serverId?: string | null): Promise<void> {
  sessionEpoch += 1;
  const digits = phone.replace(/\D/g, '').slice(-10);
  // Device-scoped record of the OTP-verified login phone (reviewer gate reads
  // this; it is not reachable from profile-edit).
  await AsyncStorage.setItem(LOGIN_PHONE_KEY, digits);
  const legacyUid = `u_${digits}`;
  const sid = typeof serverId === 'string' ? serverId.trim() : '';
  let uid: string;
  if (sid) {
    // Backend mode: the server's own profile id IS the account identity.
    uid = sid;
  } else {
    const idx = await readUidIndex();
    uid = idx[hash10(digits)] ?? '';
    if (!uid) uid = newLocalUid(); // never a phone-derived id again
  }
  // Adopt any legacy phone-keyed rows for this phone exactly once (covers
  // both fresh random ids and server ids on updated installs).
  if (uid !== legacyUid) {
    const legacy = await getSingle<Profile>('profile', legacyUid);
    if (legacy) await migrateUidData(legacyUid, uid);
  }
  await writeUidIndexEntry(digits, uid);
  await AsyncStorage.setItem(UID_KEY, uid);
  currentUid = uid;
  const nm = fullName?.trim() || null;
  if (sid) {
    // Backend mode: the server owns the profile and nothing is written to
    // the device. The sign-in response seeds the in-memory copy BEFORE the
    // emit, so the router gate sees a returning member's name at once. A
    // server-known name also marks setup done for this account: on a cold
    // start the copy is empty until GET /me answers (and stays so offline),
    // and that flag is what keeps the gate from routing to complete-profile.
    hydratedProfile = { uid, profile: { id: uid, full_name: nm, phone: `+91${digits}`, email: null } };
    if (nm) {
      try { await AsyncStorage.setItem(`pyaas_setup_done:${uid}`, '1'); } catch { /* set again from GET /me */ }
    }
  } else {
    const existing = await getSingle<Profile>('profile', uid);
    if (!existing) {
      await putSingle<Profile>('profile', uid, {
        id: uid,
        full_name: nm,
        phone: `+91${digits}`,
        email: null,
      });
      // Seed a demo wallet balance so the prepaid order flow works offline.
      // Local mode only: with a server id the wallet lives on the server and
      // a local row would be a second, never-read copy.
      await putSingle<{ balance: number }>('wallet', uid, { balance: DEMO_WALLET_SEED });
    } else if (nm && !existing.full_name) {
      // Returning member, fresh install: hydrate the server-known name pre-emit.
      await putSingle<Profile>('profile', uid, { ...existing, full_name: nm });
    }
  }
  emit();
}

// ── Email + password accounts (secondary to phone OTP) ──────────────────────
// Global registry (email -> account) so sign-in can find the account across the
// device. In this build passwords are matched locally; when parag-api is live,
// swap these for apiClient POST /auth/register + /auth/login (bcrypt server-side)
// and store the returned JWTs via lib/apiClient.
// SECURITY — DO NOT REACH THIS PATH.
// `password` below is stored in CLEARTEXT in unencrypted AsyncStorage, in one
// device-global blob alongside the email, name and phone of every account ever
// created on this handset. That is a real exposure (readable on a rooted device,
// and swept into some backup/transfer flows) and users reuse passwords.
//
// It is now unreachable: the app's only sign-in is phone OTP, and the last entry
// point into the email screens (components/ClaimPackFlow.tsx) was repointed at
// /(auth)/otp. deleteMyAccount() also prunes this key, which it previously missed
// entirely — a "deleted" member could sign back in with the same password.
//
// BEFORE ever re-enabling email/password sign-in: store a salted hash via
// expo-crypto into expo-secure-store (already a dependency, used for JWTs in
// lib/apiClient.ts), or move authentication to the backend. Never re-ship this.
const ACCOUNTS_KEY = 'parag:accounts';
type Account = { uid: string; email: string; password: string; full_name: string | null; phone: string | null };

async function readAccounts(): Promise<Record<string, Account>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ACCOUNTS_KEY)) || '{}');
  } catch {
    return {};
  }
}

// RETIRED. Email/password auth is gone — the only supported flow is phone OTP,
// which never stores a password. These stubs remain so the (now empty) registry
// can still be PRUNED on account deletion (removeAccountEntry below), but they
// can never again write a cleartext credential. The sign-in/sign-up routes are
// redirects to the OTP screen, so nothing calls these; they throw defensively
// in case a future deep link or refactor reaches them.
export async function signUpWithEmail(_email: string, _password: string, _fullName: string, _phone: string): Promise<void> {
  throw new Error('Email sign-up is no longer supported. Please sign in with your phone number.');
}

export async function signInWithEmail(_email: string, _password: string): Promise<void> {
  throw new Error('Email sign-in is no longer supported. Please sign in with your phone number.');
}

/**
 * Remove one account from the email/password registry, by uid.
 *
 * Account deletion previously left 'parag:accounts' completely untouched (the
 * key ends in 'accounts', not ':<uid>', so the sweep's suffix filter skipped
 * it), which meant a "deleted" member's email, name, phone and PASSWORD all
 * survived — and signing in with the same email still worked. The registry is
 * one global blob shared by every account on the device, so prune the single
 * entry rather than dropping the key.
 */
export async function removeAccountEntry(uid: string): Promise<void> {
  const accounts = await readAccounts();
  const email = Object.keys(accounts).find((em) => accounts[em]?.uid === uid);
  if (!email) return; // phone-OTP member — never had a registry entry
  delete accounts[email];
  if (Object.keys(accounts).length === 0) await AsyncStorage.removeItem(ACCOUNTS_KEY);
  else await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function signOut(): Promise<void> {
  const uid = currentUid ?? (await AsyncStorage.getItem(UID_KEY));
  // The low-balance reminder is per account: forget this account's copy and
  // reset the in-memory preference and its hydration latch BEFORE the uid
  // goes, or the next member on this phone inherits an armed threshold that
  // never re-hydrates. Dynamic import: autoTopup itself imports session.
  try {
    const { clearAutoTopup } = await import('./autoTopup');
    await clearAutoTopup();
  } catch { /* best-effort */ }
  // The taglines and the cart reminder are scheduled on the device for the
  // member who is leaving; they are cancelled here, not in the auth provider,
  // so deleteMyAccount (which ends in this signOut) cancels them too.
  // Dynamic imports: both modules import session.
  try {
    const [taglines, cart] = await Promise.all([import('./taglines'), import('./cartReminder')]);
    await Promise.all([taglines.cancelTaglines(), cart.cancelCartReminder()]);
  } catch { /* best-effort */ }
  await AsyncStorage.removeItem(UID_KEY);
  await AsyncStorage.removeItem(LOGIN_PHONE_KEY);
  currentUid = null;
  hydratedProfile = null; // the next member on this phone never sees this one's profile
  // Every other in-memory copy of this account's server state goes with it
  // (address book, plan list, trial answer, delivery prefs, wallet unlock,
  // offer qualification, wallet balance, referral code), so the same account signing back
  // in refetches instead of reading the previous session. Dynamic imports:
  // these modules import session.
  try {
    const [addr, subs, trial, prefs, gate, pack, wallet, refs] = await Promise.all([
      import('./api'), import('./subscriptions'), import('./trial'), import('./deliveryPrefs'), import('./walletGate'), import('./freePack'), import('../store/wallet'), import('./referrals'),
    ]);
    addr.invalidateAddressCache();
    subs.invalidateSubscriptionCache();
    trial.clearTrialCache();
    prefs.clearDeliveryPrefsCache();
    gate.clearWalletGateSession();
    pack.clearFreePackSession();
    wallet.resetWallet();
    refs.clearReferralCache();
  } catch { /* best-effort */ }
  // Shared/resold devices must not retain the previous member's phone, exact
  // home coordinates and spend history after sign-out. In backend mode the
  // server is the source of truth, so the local rows are just cache — purge
  // them. In LOCAL mode the rows ARE the data (same phone → same uid brings
  // them back on re-login), so they stay.
  try {
    const { isBackendConfigured } = await import('./apiClient');
    if (uid && isBackendConfigured()) {
      const keys = await AsyncStorage.getAllKeys();
      // NOT everything is "just cache": `vip` is the ONLY copy of a PYAAS
      // Plus membership already debited from the SERVER wallet (no backend
      // persistence yet), and purging it destroys paid state, so it is
      // spared as the evidence row. Referrals are server-first now (the
      // applied code goes to POST /referrals/apply, never a local row), so
      // everything else re-hydrates from the server on the next sign-in.
      const KEEP = /^parag:vip:/;
      const doomed = keys.filter((k) => k.includes(uid) && !KEEP.test(k));
      if (doomed.length) await AsyncStorage.multiRemove(doomed);
    }
  } catch { /* best-effort — the uid pointer is already cleared above */ }
  // The local session is gone: tell the UI now. The two network goodbyes
  // below must not hold the sign-out button (up to two request timeouts on a
  // bad link), so they run detached after the emit.
  emit();
  const epoch = sessionEpoch;
  void (async () => {
    // Unbind this device's push token from the account (contract C2) while
    // the access token is still valid, or a shared phone keeps notifying the
    // previous member. Best-effort; also re-arms registration for the next
    // sign-in. Dynamic import: session must not statically pull the OS layer.
    try {
      const { unregisterPush } = await import('./notifications');
      if (sessionEpoch === epoch) await unregisterPush();
    } catch { /* best-effort */ }
    // Then revoke the refresh token on the server (POST /auth/logout,
    // best-effort) and drop both tokens from SecureStore, or the next account
    // on a shared device inherits the previous session. Every step re-checks
    // the epoch: a sign-in that landed meanwhile owns the stored tokens and
    // this chain must not revoke or wipe them. Dynamic import avoids a
    // session<->apiClient require cycle.
    try {
      const { revokeSession, clearTokens } = await import('./apiClient');
      if (sessionEpoch !== epoch) return;
      await revokeSession();
      if (sessionEpoch !== epoch) return;
      await clearTokens();
    } catch { /* best-effort — local session is already cleared above */ }
  })();
}

export async function getProfile(): Promise<Profile | null> {
  const uid = await getUserId();
  if (!uid) return null;
  const { isBackendConfigured } = await import('./apiClient');
  if (!isBackendConfigured()) return getSingle<Profile>('profile', uid);
  // Backend mode: the in-memory copy. Nothing is fetched here: the auth gate
  // reads this before the consent overlay has cleared, and GET /me runs from
  // hydrateProfileFromServer once it has. Until then (and offline) the copy
  // can be empty, so an older build's local profile row is adopted once as
  // the seed (its name came from the server) and deleted, and failing that a
  // stub carrying the id is returned so the gate can read this account's
  // setup-done flag. An edit still waiting in the outbox is the member's
  // latest word either way.
  const held = getHydratedProfile(uid);
  if (held) return held;
  const outbox = (await getSingle<Partial<Profile>>(PROFILE_OUTBOX_TABLE, uid).catch(() => null)) ?? {};
  const legacy = await getSingle<Profile>('profile', uid).catch(() => null);
  if (legacy) {
    if (legacy.full_name?.trim()) {
      try { await AsyncStorage.setItem(`pyaas_setup_done:${uid}`, '1'); } catch { /* set again from GET /me */ }
    }
    await adoptLegacyAvatar(uid, legacy);
    await dropTable('profile', uid).catch(() => undefined);
    hydratedProfile = { uid, profile: { ...legacy, ...outbox, id: uid } };
    return hydratedProfile.profile;
  }
  const phone = await AsyncStorage.getItem(LOGIN_PHONE_KEY).catch(() => null);
  return { full_name: null, phone: phone ? `+91${phone}` : null, email: null, ...outbox, id: uid };
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const uid = await requireUserId();
  const { isBackendConfigured } = await import('./apiClient');
  if (isBackendConfigured()) {
    // Backend mode: the in-memory copy only; PATCH /me is profileApi's job.
    setHydratedProfile(uid, { ...(getHydratedProfile(uid) ?? { id: uid, full_name: null, phone: null }), ...patch });
    return;
  }
  const existing = (await getSingle<Profile>('profile', uid)) ?? {
    id: uid,
    full_name: null,
    phone: null,
  };
  await putSingle<Profile>('profile', uid, { ...existing, ...patch, id: uid });
  // Notify listeners (the root layout's complete-profile gate) AFTER the write, so
  // a returning user whose full_name we just hydrated isn't routed through
  // complete-profile off a stale (null) read from an earlier emit.
  emit();
}
