import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

/**
 * Native "hyper-convenience" seams for the phone-OTP flow, backed by the native
 * module `RNPhoneNumberHint` (android/app/.../nativeconvenience/):
 *   1. Phone Number Hint  — a one-tap Play Services chooser that returns the SIM's
 *      own number so the user never types it (requestPhoneHint).
 *   2. SMS Retriever       — auto-reads the incoming OTP SMS (no READ_SMS
 *      permission) via the native module's "pyaasSmsOtp" event and hands the code
 *      back so we can autofill it.
 *
 * Every function degrades to a graceful no-op (never throws, resolves to null / a
 * cleanup fn) when the native module or Play Services is absent, so the app still
 * works — the JS autoComplete/textContentType attributes deliver OS autofill as
 * the always-on fallback.
 */

const Native: any = NativeModules?.RNPhoneNumberHint ?? null;

/** True when the native phone-hint / SMS-retriever module is present in this build. */
export function hasNativeConvenience(): boolean {
  return Platform.OS === 'android' && !!Native;
}

/**
 * Ask Android to show the Phone Number Hint chooser and return the picked number
 * (digits, best-effort last-10). Resolves to `null` when unavailable, declined, or
 * on any error — the caller should treat null as "user will type".
 *
 * Call this on FOCUS of the phone field (not on mount) so the sheet appears in
 * direct response to the user's intent to enter a number.
 */
export async function requestPhoneHint(): Promise<string | null> {
  if (Platform.OS !== 'android' || !Native?.requestHint) return null;
  try {
    const raw = await Native.requestHint();
    return normalizePhone(raw);
  } catch {
    return null;
  }
}

/** Extract the last 10 digits from a hint like "+91 98765 43210". */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits ? digits.slice(-10) : null;
}

export type SmsRetrieverStop = () => void;

/**
 * Start the Android SMS Retriever. When a matching OTP SMS arrives, `onCode` fires
 * with the extracted 6-digit code so the screen can autofill + submit. Returns a
 * cleanup function; call it on unmount / step change.
 *
 * No-op (returns a noop cleanup) when the native module is absent, on iOS, or on
 * any error — the OTP field's autoComplete="sms-otp" already surfaces the code via
 * the keyboard on supported devices.
 */
export function startSmsRetriever(onCode: (code: string) => void): SmsRetrieverStop {
  const noop: SmsRetrieverStop = () => {};
  if (Platform.OS !== 'android' || !Native?.startSmsRetriever) return noop;
  try {
    const emitter = new NativeEventEmitter(Native);
    const sub = emitter.addListener('pyaasSmsOtp', (evt: { message?: string }) => {
      const code = extractOtp(evt?.message);
      if (code) onCode(code);
    });
    // Fire the retriever; it resolves true/false but we don't need to await it.
    Promise.resolve(Native.startSmsRetriever()).catch(() => {});
    return () => {
      sub.remove();
      try { Native.stopSmsRetriever?.(); } catch { /* ignore */ }
    };
  } catch {
    return noop;
  }
}

/** Pull the first 4–8 digit run out of an SMS body (returns 6-digit codes as-is). */
function extractOtp(message: string | undefined): string | null {
  if (!message) return null;
  const m = message.match(/(\d{4,8})/);
  return m ? m[1] : null;
}

/**
 * The app-signature hash the OTP SMS must be suffixed with for SMS Retriever to
 * deliver it. Returns null when the native module is absent. Surface this to the
 * backend/SMS-template team when wiring auto-read.
 */
export async function getSmsAppHash(): Promise<string | null> {
  if (Platform.OS !== 'android' || !Native?.getAppHash) return null;
  try {
    return (await Native.getAppHash()) ?? null;
  } catch {
    return null;
  }
}
