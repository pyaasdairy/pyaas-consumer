import { Platform, NativeModules } from 'react-native';

/**
 * Native "hyper-convenience" seams for the phone-OTP flow.
 *
 * These wrap Android-only Google Play Services conveniences that have NO
 * first-party Expo module:
 *   1. Phone Number Hint  — a one-tap chooser that returns the SIM's own number
 *      so the user never types it (Play Services `getPhoneNumberHint`).
 *   2. SMS Retriever       — auto-reads the incoming OTP SMS (app-hashed, no
 *      READ_SMS permission) and hands the code back so we can autofill it.
 *
 * IMPORTANT — this file is written to be SAFE IN A JS-ONLY BUILD.
 * Neither native module ships in the current Expo build, so every function here
 * degrades to a graceful no-op (never throws, resolves to null / a cleanup fn).
 * The JS `autoComplete` / `textContentType` attributes on the inputs already
 * deliver the 80% experience (OS autofill / keyboard OTP suggestion) with zero
 * native code. These seams light up the last-mile "one-tap" UX ONLY after the
 * native modules below are added to a dev/prod build.
 *
 * ── To enable in a dev build (see docs/native-convenience.md) ────────────────
 *   Phone hint  : a small native module exposing Play Services
 *                 Identity.getSignInClient(...).getPhoneNumberHintIntent(...),
 *                 OR a community package. There is no maintained drop-in today,
 *                 so `requestPhoneHint()` looks for an optional native module
 *                 named `RNPhoneNumberHint` and no-ops if absent.
 *   SMS retriever: `react-native-otp-verify` (wraps SMS Retriever API). Add the
 *                 dep, register the config-plugin stub in `plugins/`, and this
 *                 file will pick it up via `requireOtpVerify()`.
 *
 * None of the above is required for the app to build or run.
 */

/**
 * Safely require the optional OTP-retriever native module (react-native-otp-verify),
 * which is absent in Expo Go and before a dev build adds it.
 *
 * The require MUST use a STRING LITERAL (not a variable): Metro's production
 * transform rejects `require(variable)` outright ("Invalid call … require(name)"),
 * which fails the release bundle. A literal require inside try/catch, combined with
 * `allowOptionalDependencies: true` (metro.config.js), lets a MISSING module become
 * a caught runtime throw instead of a build failure — the same pattern lib/razorpay.ts
 * uses for react-native-razorpay.
 */
function requireOtpVerify<T = any>(): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-otp-verify') as T;
  } catch {
    return null;
  }
}

/** True on a build where any of the native convenience modules are present. */
export function hasNativeConvenience(): boolean {
  return (
    Platform.OS === 'android' &&
    (!!NativeModules?.RNPhoneNumberHint || !!requireOtpVerify())
  );
}

/**
 * Ask Android to show the Phone Number Hint chooser and return the picked
 * number (digits, best-effort last-10). Resolves to `null` when unavailable,
 * declined, or on any error — the caller should treat null as "user will type".
 *
 * Call this on FOCUS of the phone field (not on mount) so the sheet appears in
 * direct response to the user's intent to enter a number.
 */
export async function requestPhoneHint(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    // Preferred path: a dedicated native module (added in a dev build).
    const mod = NativeModules?.RNPhoneNumberHint as
      | { requestHint?: () => Promise<string> }
      | undefined;
    if (mod?.requestHint) {
      const raw = await mod.requestHint();
      return normalizePhone(raw);
    }
    // TODO(dev-build): no maintained Expo/Play-Services phone-hint module exists
    // today. When one is added (or a thin local native module), expose it as
    // `RNPhoneNumberHint.requestHint(): Promise<string>` and this branch fires.
    // Until then we no-op — the field's autoComplete="tel" still offers OS
    // autofill of saved numbers.
    return null;
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
 * Start the Android SMS Retriever. When a matching OTP SMS arrives, `onCode`
 * fires with the extracted 6-digit code so the screen can autofill + submit.
 * Returns a cleanup function; call it on unmount / step change.
 *
 * No-op (returns a noop cleanup) when the native module is absent, on iOS, or
 * on any error — the OTP field's autoComplete="sms-otp" already surfaces the
 * code via the keyboard on supported devices.
 */
export function startSmsRetriever(onCode: (code: string) => void): SmsRetrieverStop {
  const noop: SmsRetrieverStop = () => {};
  if (Platform.OS !== 'android') return noop;

  // react-native-otp-verify shape: { getHash, getOtp, startOtpListener?, addListener, removeListener }
  const otp = requireOtpVerify<any>();
  if (!otp) {
    // TODO(dev-build): add `react-native-otp-verify` (SMS Retriever API) + the
    // config-plugin stub in plugins/, then this lights up automatically.
    return noop;
  }

  try {
    const handler = (message: string | undefined) => {
      const code = extractOtp(message);
      if (code) onCode(code);
    };
    // Newer API: startOtpListener returns/accepts a listener. Older: getOtp + addListener.
    if (typeof otp.startOtpListener === 'function') {
      otp.startOtpListener(handler);
      return () => {
        try {
          otp.removeListener?.();
        } catch {
          /* ignore */
        }
      };
    }
    if (typeof otp.getOtp === 'function' && typeof otp.addListener === 'function') {
      otp.getOtp();
      otp.addListener(handler);
      return () => {
        try {
          otp.removeListener?.();
        } catch {
          /* ignore */
        }
      };
    }
    return noop;
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
 * deliver it. Returns null when the native module is absent. Surface this to
 * the backend/SMS template team when wiring auto-read in a dev build.
 */
export async function getSmsAppHash(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const otp = requireOtpVerify<any>();
  try {
    if (otp?.getHash) {
      const hashes: string[] = await otp.getHash();
      return hashes?.[0] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}
