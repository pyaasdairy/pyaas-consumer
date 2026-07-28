import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSingle, putSingle, newId } from './localStore';

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

let currentUid: string | null = null;
const listeners = new Set<() => void>();

export function onSessionChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  listeners.forEach((l) => l());
}

/** Load the persisted session on cold start. */
export async function loadSession(): Promise<Session> {
  currentUid = await AsyncStorage.getItem(UID_KEY);
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

/** Sign in with a phone number (demo/offline path). Creates the account + a
 *  profile row on first use, keyed stably so repeat logins return the same data. */
export async function signInWithPhone(phone: string): Promise<void> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const uid = `u_${digits}`;
  await AsyncStorage.setItem(UID_KEY, uid);
  currentUid = uid;
  const existing = await getSingle<Profile>('profile', uid);
  if (!existing) {
    await putSingle<Profile>('profile', uid, {
      id: uid,
      full_name: null,
      phone: `+91${digits}`,
      email: null,
    });
    // Seed a demo wallet balance so the prepaid order flow works offline.
    await putSingle<{ balance: number }>('wallet', uid, { balance: DEMO_WALLET_SEED });
  }
  emit();
}

// ── Email + password accounts (secondary to phone OTP) ──────────────────────
// Global registry (email -> account) so sign-in can find the account across the
// device. In this build passwords are matched locally; when parag-api is live,
// swap these for apiClient POST /auth/register + /auth/login (bcrypt server-side)
// and store the returned JWTs via lib/apiClient.
const ACCOUNTS_KEY = 'parag:accounts';
type Account = { uid: string; email: string; password: string; full_name: string | null; phone: string | null };

async function readAccounts(): Promise<Record<string, Account>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ACCOUNTS_KEY)) || '{}');
  } catch {
    return {};
  }
}

export async function signUpWithEmail(email: string, password: string, fullName: string, phone: string): Promise<void> {
  const em = email.trim().toLowerCase();
  const accounts = await readAccounts();
  if (accounts[em]) throw new Error('An account with this email already exists. Please sign in.');
  // Collision-free uid. The registry is keyed by the exact normalized email, so
  // sign-in resolves the uid via accounts[em].uid and never re-derives it (a
  // lossy email->slug would collapse a.b@x.com and a-b@x.com onto one account).
  const uid = newId('ue');
  accounts[em] = { uid, email: em, password, full_name: fullName.trim() || null, phone: phone.trim() || null };
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  await AsyncStorage.setItem(UID_KEY, uid);
  currentUid = uid;
  await putSingle<Profile>('profile', uid, {
    id: uid,
    full_name: fullName.trim() || null,
    phone: phone.trim() || null,
    email: em,
  });
  await putSingle<{ balance: number }>('wallet', uid, { balance: DEMO_WALLET_SEED });
  emit();
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const em = email.trim().toLowerCase();
  const accounts = await readAccounts();
  const acct = accounts[em];
  if (!acct) throw new Error('No account found for this email. Please create one.');
  if (acct.password !== password) throw new Error('Incorrect password. Please try again.');
  await AsyncStorage.setItem(UID_KEY, acct.uid);
  currentUid = acct.uid;
  emit();
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(UID_KEY);
  currentUid = null;
  emit();
}

export async function getProfile(): Promise<Profile | null> {
  const uid = await getUserId();
  if (!uid) return null;
  return getSingle<Profile>('profile', uid);
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const uid = await requireUserId();
  const existing = (await getSingle<Profile>('profile', uid)) ?? {
    id: uid,
    full_name: null,
    phone: null,
  };
  await putSingle<Profile>('profile', uid, { ...existing, ...patch, id: uid });
}
