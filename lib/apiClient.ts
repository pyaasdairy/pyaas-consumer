import * as SecureStore from 'expo-secure-store';
import { logDiag } from './diag';

/**
 * REST client for the PARAG NestJS API (apps/parag-api, deployed on AWS).
 *
 * This is the real backend seam. When EXPO_PUBLIC_API_URL points at a running
 * parag-api instance, the app talks to it: JWT access + refresh tokens are kept
 * in expo-secure-store, the access token rides on every request, and a 401 is
 * transparently retried once after a silent refresh.
 *
 * When EXPO_PUBLIC_API_URL is empty (Expo Go / simulator before the backend is
 * deployed), isBackendConfigured() returns false and the data layer falls back
 * to the on-device local store (lib/localStore.ts) so the whole app still runs
 * and demos end to end. See lib/session.ts.
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
// Consumer app-key — identifies this app to the backend so app-only endpoints
// (the traceability bridge) answer only the PARAG app. Ships in the bundle
// (EXPO_PUBLIC_*): it gates casual/other-client access, not a true secret.
// MUST equal the deployed backend's CONSUMER_APP_KEY (currently
// parag_consumer_dev_key_v1) or every serviceability/catalog read 403s and the
// app fail-opens. NOTE: EXPO_PUBLIC_* values are inlined into Metro's transform
// cache — changing only .env may not rebuild them; bust the cache when it changes.
const APP_KEY = process.env.EXPO_PUBLIC_CONSUMER_APP_KEY ?? '';
const ACCESS_KEY = 'parag_access_token';
const REFRESH_KEY = 'parag_refresh_token';
const REQUEST_TIMEOUT_MS = 15000; // RN fetch has no default timeout; a black-holed host would hang forever

export function isBackendConfigured(): boolean {
  return API_URL.length > 0;
}

/**
 * Resolve a backend media reference to an absolute URL an <Image> can load.
 * The catalog seed stores paths RELATIVE to the consumer API base (e.g.
 * "catalog/img/taaza.png") so the same seed works across environments; here we
 * join them onto API_URL. An already-absolute http(s) URL (e.g. a store-added
 * B2 shot) passes through untouched. Returns undefined when there is no base to
 * resolve against (offline / backend not configured) so callers fall back to
 * the bundled asset rather than requesting a broken URL.
 */
export function resolveMediaUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (!API_URL) return undefined;
  return `${API_URL}/${String(u).replace(/^\/+/, '')}`;
}

/** Error carrying the HTTP status so callers can tell a real 404 from a network blip. */
export class HttpError extends Error {
  status: number;
  path?: string;
  constructor(status: number, message: string, path?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.path = path;
  }
}

/**
 * PERMANENT auth-expiry contract: whenever the stored session becomes
 * unusable (refresh token rejected, or an authed call 401s with no tokens at
 * all — e.g. after a server-side key rotation), the client clears its tokens
 * and fires this callback EXACTLY ONCE. The root layout registers a handler
 * that signs the local session out, so the router gate lands the user on the
 * sign-in screen instead of leaving screens half-signed-in printing raw
 * "authentication required" errors.
 */
let onAuthExpired: (() => void) | null = null;
let authExpiredFired = false;

export function setOnAuthExpired(cb: () => void): void {
  onAuthExpired = cb;
}

function fireAuthExpired(reason: string): void {
  if (authExpiredFired) return;
  authExpiredFired = true;
  logDiag({ kind: 'auth', message: `Session expired, ${reason}. Signing out.` });
  onAuthExpired?.();
}

/** Diagnostics helper: token PRESENCE only (never values). */
export async function tokenPresence(): Promise<{ access: boolean; refresh: boolean }> {
  const [a, r] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { access: !!a, refresh: !!r };
}

/** fetch that aborts after REQUEST_TIMEOUT_MS instead of hanging indefinitely. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new HttpError(0, 'Network timeout. Please check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  authExpiredFired = false; // a fresh sign-in re-arms the expiry handler
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

// Single-flight the refresh: if two authed requests 401 at once, both must
// await ONE /auth/refresh — otherwise both replay the same (single-use) refresh
// token, the backend rotates it, the second replay 401s, and the loser's
// clearTokens() wipes the fresh session the winner just wrote → a valid user is
// force-signed-out. Coalescing means the loser observes the winner's new token.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return false;
  try {
    const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (res.status === 401 || res.status === 403) {
      // The refresh token itself is invalid/expired — e.g. it was signed by an
      // older backend deployment with a different JWT secret. Fail CLOSED:
      // clear the dead session so every screen stops hammering /auth/refresh
      // (the 401 storm) and the user is simply asked to sign in again.
      // Network errors deliberately do NOT clear tokens (offline ≠ signed out).
      await clearTokens();
      fireAuthExpired('refresh token rejected by server');
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.access_token && data?.refresh_token) {
      await setTokens(data.access_token, data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  if (!isBackendConfigured()) throw new Error('Backend not configured');
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(APP_KEY ? { 'X-Parag-App-Key': APP_KEY } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // Timeouts + connection failures — logged with the request that suffered
    // them so field issues are readable from Diagnostics.
    logDiag({
      kind: 'network',
      method,
      path,
      message: e instanceof Error ? e.message : 'Network request failed',
    });
    throw e;
  }
  let didSignOut = false;
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request<T>(method, path, body, false);
    // Refresh could not rescue the call. If we no longer hold ANY session
    // tokens (cleared above, or never present after a key rotation), the
    // stored login is dead — sign out. But if the refresh token is STILL there,
    // the refresh just failed transiently (network/timeout) and we are NOT
    // signed out — so don't tell the user their session expired.
    const { refresh } = await tokenPresence();
    if (!refresh) {
      fireAuthExpired('unauthorized and no usable session tokens');
      didSignOut = true;
    }
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const err = await res.json();
      message = err?.message ?? err?.error?.message ?? message;
      code = err?.code ?? err?.error?.code;
    } catch {
      /* keep default */
    }
    if (Array.isArray(message)) message = message.join(', ');
    logDiag({ kind: 'api-error', method, path, status: res.status, message: `${code ? code + ': ' : ''}${message}` });
    // Only re-word a 401 for endpoints that carry a session (where a refresh was
    // attempted above). On /auth/* there is no session to expire — the backend's
    // own message ("Invalid or expired code", "Too many attempts") is the real
    // reason and must reach the user; clobbering it would tell someone who merely
    // mistyped their OTP to "check your connection".
    if (res.status === 401 && !path.startsWith('/auth/')) {
      message = didSignOut
        ? 'Session expired, please sign in again.'
        : 'Could not verify your session. Check your connection and try again.';
    }
    throw new HttpError(res.status, message, path);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// getText fetches a raw text/HTML body (e.g. the traceability label the app
// prints to PDF). Carries the same auth + app-key headers as api.get.
export async function getText(path: string): Promise<string> {
  if (!isBackendConfigured()) throw new Error('Backend not configured');
  const token = await getAccessToken();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(APP_KEY ? { 'X-Parag-App-Key': APP_KEY } : {}),
    },
  });
  if (!res.ok) throw new HttpError(res.status, `Request failed (${res.status})`);
  return res.text();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
