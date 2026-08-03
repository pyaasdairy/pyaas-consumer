/**
 * MSG91 OTP — real SMS one-time codes, no app backend needed.
 *
 * Uses MSG91's v5 OTP API (send / retry / verify) directly from the app:
 *   EXPO_PUBLIC_MSG91_AUTHKEY      the MSG91 authkey
 *   EXPO_PUBLIC_MSG91_TEMPLATE_ID  the approved DLT OTP template id
 *
 * When BOTH are set, the login screen sends and verifies codes through MSG91
 * and the offline demo code is disabled. When they are absent AND no parag-api
 * backend is configured, the app falls back to the on-device demo flow so a
 * development build still signs in.
 *
 * NOTE(security): the authkey ships in the app bundle, which MSG91 permits for
 * its OTP widget/token flows but is weaker than server-side sending. When
 * parag-api is live, move send/verify behind POST /auth/otp/* (that path
 * already takes priority in the login screen) and drop these env vars.
 *
 * NOTE(auto-read): for Android SMS auto-read, the DLT template must be the SMS
 * Retriever shape, starting with "<#>" and ending with the 11-char app hash
 * (lib/nativeConvenience.getSmsAppHash). Auto-read degrades to manual entry /
 * OS autofill when the template lacks the hash.
 */

const AUTHKEY = process.env.EXPO_PUBLIC_MSG91_AUTHKEY ?? '';
const TEMPLATE_ID = process.env.EXPO_PUBLIC_MSG91_TEMPLATE_ID ?? '';
const BASE = 'https://control.msg91.com/api/v5';
const TIMEOUT_MS = 15000;

export function isMsg91Configured(): boolean {
  return AUTHKEY.length > 0 && TEMPLATE_ID.length > 0;
}

function fullMobile(phone10: string): string {
  return `91${phone10.replace(/\D/g, '').slice(-10)}`;
}

async function call(path: string, method: 'GET' | 'POST'): Promise<{ type?: string; message?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { authkey: AUTHKEY, accept: 'application/json' },
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok && !body.message) throw new Error(`OTP service error (${res.status}).`);
    return body;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Network timeout. Please check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Send a 6-digit OTP SMS to the 10-digit Indian mobile. Throws with the MSG91
 *  reason ("Invalid mobile", rate limits, ...) on failure. */
export async function msg91SendOtp(phone10: string): Promise<void> {
  const r = await call(`/otp?template_id=${encodeURIComponent(TEMPLATE_ID)}&mobile=${fullMobile(phone10)}&otp_length=6&otp_expiry=10`, 'POST');
  if (r.type !== 'success') throw new Error(r.message || 'Could not send the code. Please try again.');
}

/** Resend the same OTP by SMS (30s server-side cooldown applies). */
export async function msg91RetryOtp(phone10: string): Promise<void> {
  const r = await call(`/otp/retry?mobile=${fullMobile(phone10)}&retrytype=text`, 'POST');
  if (r.type !== 'success') throw new Error(r.message || 'Could not resend the code. Please try again.');
}

/** Verify the code the member entered. Resolves on success, throws the MSG91
 *  reason ("OTP not match", "OTP expired", ...) otherwise. */
export async function msg91VerifyOtp(phone10: string, otp: string): Promise<void> {
  const r = await call(`/otp/verify?mobile=${fullMobile(phone10)}&otp=${encodeURIComponent(otp.replace(/\D/g, ''))}`, 'GET');
  const ok = r.type === 'success' || /already.?verified/i.test(r.message ?? '');
  if (!ok) throw new Error(r.message === 'OTP not match' ? 'That code is not right. Try again.' : (r.message || 'Could not verify the code.'));
}
