/**
 * Admin gating for the consumer app. Certain emails / phone numbers unlock an
 * Admin console instead of the shopper experience. The allowlist comes from env
 * (EXPO_PUBLIC_ADMIN_EMAILS / EXPO_PUBLIC_ADMIN_PHONES, comma-separated) with a
 * sensible default for the PYAAS owner account.
 */
const DEFAULT_ADMIN_EMAILS = ['hello@pyaasdairy.com', 'admin@pyaasdairy.test'];
const DEFAULT_ADMIN_PHONES = ['+911000000001'];

function list(envVal: string | undefined, fallback: string[]): string[] {
  const fromEnv = (envVal ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : fallback.map((s) => s.toLowerCase());
}

export function isAdminUser(email?: string | null, phone?: string | null): boolean {
  const emails = list(process.env.EXPO_PUBLIC_ADMIN_EMAILS, DEFAULT_ADMIN_EMAILS);
  const phones = list(process.env.EXPO_PUBLIC_ADMIN_PHONES, DEFAULT_ADMIN_PHONES);
  const e = (email ?? '').trim().toLowerCase();
  const p = (phone ?? '').trim();
  return (!!e && emails.includes(e)) || (!!p && phones.includes(p.toLowerCase()));
}

/** The hosted web admin console. */
export const ADMIN_WEB_URL = process.env.EXPO_PUBLIC_ADMIN_URL || 'https://pyaasdairy.com/admin';
