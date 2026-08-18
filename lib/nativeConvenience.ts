import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

/**
 * Native OTP auto-read seam, backed by the native module `RNPhoneNumberHint`
 * (android/app/.../nativeconvenience/):
 *   SMS Retriever — auto-reads the incoming OTP SMS (no READ_SMS permission) via
 *   the native module's "pyaasSmsOtp" event and hands the code back so we can
 *   autofill it. This reads a message addressed to this app, not the member's
 *   inbox, and needs no permission.
 *
 * REMOVED — the Phone Number Hint (requestPhoneHint). That Play Services chooser
 * returned the SIM's OWN NUMBER, and Google Play removed this app under the User
 * Data policy for uploading the phone number without a prominent disclosure. The
 * number is now typed by the member, or filled by ordinary OS autofill via the
 * field's autoComplete="tel" — neither of which is a SIM read by this app. Do not
 * reintroduce it.
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
