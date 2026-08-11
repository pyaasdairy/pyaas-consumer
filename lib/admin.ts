/**
 * Admin gating for the PYAAS consumer app. A tiny demo allowlist unlocks a
 * minimal Admin entry for the cooperative's owner / ops accounts. The full
 * operations surface (member district unions, batches, quality results, orders)
 * lives in the PYAAS web admin console; this app only exposes an honest link
 * plus a couple of read-only diagnostics.
 *
 * Local-first: the allowlist ships in the bundle so gating works fully offline.
 * When parag-api is live, swap isAdminUser for a role claim read from the
 * profile (e.g. GET /users/me -> role === 'admin') behind this same signature.
 */

/**
 * Demo admin allowlist. Emails are matched case-insensitively; phones are
 * matched by their last 10 digits so a leading +91 or spacing never blocks a
 * match. Keep this list short and honest (owner + ops only).
 */
export const ADMIN_ALLOWLIST = {
  emails: ['care@pyaasdairy.in', 'admin@pyaasdairy.in'],
  phones: ['9000000001'],
} as const;

const norm = (s?: string | null): string => (s ?? '').trim().toLowerCase();
const last10 = (s?: string | null): string => (s ?? '').replace(/\D/g, '').slice(-10);

/**
 * True when the given profile email or phone is on the admin allowlist.
 *
 * DEV ONLY. This allowlist ships readable in the JS bundle, and the offline OTP
 * fallback accepts ANY 10-digit number with a fixed code — so in a build without
 * a backend, anyone who read the bundle could sign in as 9000000001 and unlock
 * the console. Apple also treats an undisclosed hidden feature in a consumer
 * binary as Guideline 2.3.1. __DEV__ is compiled out of release bundles, so the
 * entry cannot appear in a store build; wire this to a server-issued role claim
 * (GET /users/me -> role === 'admin') before exposing admin in production.
 */
export function isAdminUser(email?: string | null, phone?: string | null): boolean {
  if (!__DEV__) return false;
  const e = norm(email);
  const p = last10(phone);
  const emailMatch = !!e && ADMIN_ALLOWLIST.emails.some((a) => norm(a) === e);
  const phoneMatch = p.length === 10 && ADMIN_ALLOWLIST.phones.some((a) => last10(a) === p);
  return emailMatch || phoneMatch;
}

/** The hosted PYAAS web admin console (placeholder until the real URL is live). */
export const ADMIN_WEB_URL = 'https://www.pyaasdairy.in/admin';
