/**
 * Admin gating for the PARAG consumer app. A tiny demo allowlist unlocks a
 * minimal Admin entry for the cooperative's owner / ops accounts. The full
 * operations surface (member district unions, batches, quality results, orders)
 * lives in the PARAG web admin console; this app only exposes an honest link
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
  emails: ['hello@paragdairy.app', 'admin@paragdairy.app'],
  phones: ['9000000001'],
} as const;

const norm = (s?: string | null): string => (s ?? '').trim().toLowerCase();
const last10 = (s?: string | null): string => (s ?? '').replace(/\D/g, '').slice(-10);

/** True when the given profile email or phone is on the demo admin allowlist. */
export function isAdminUser(email?: string | null, phone?: string | null): boolean {
  const e = norm(email);
  const p = last10(phone);
  const emailMatch = !!e && ADMIN_ALLOWLIST.emails.some((a) => norm(a) === e);
  const phoneMatch = p.length === 10 && ADMIN_ALLOWLIST.phones.some((a) => last10(a) === p);
  return emailMatch || phoneMatch;
}

/** The hosted PARAG web admin console (placeholder until the real URL is live). */
export const ADMIN_WEB_URL = 'https://www.paragdairy.com/admin';
