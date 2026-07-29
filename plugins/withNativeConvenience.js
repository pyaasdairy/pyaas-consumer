/* eslint-disable @typescript-eslint/no-var-requires */
const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin for the native "hyper-convenience" onboarding seams.
 *
 * It adds the Android permissions that the phone-hint + SMS-retriever features
 * need — but ONLY when the build opts in via `EXPO_PUBLIC_NATIVE_CONVENIENCE=1`.
 * By default it is a NO-OP, so the current JS-only build ships with no extra
 * permissions and nothing to justify in the Play Console.
 *
 * ── Permissions this can add (kept behind the env flag on purpose) ───────────
 *   READ_PHONE_NUMBERS  — lets the Play-Services Phone Number Hint chooser show
 *                         the SIM's own number for one-tap entry. Not required
 *                         if you only use getPhoneNumberHint (it works without
 *                         this permission on most devices); declared here for
 *                         the fallback path some OEMs take.
 *   RECEIVE_SMS         — required by the SMS Retriever API's underlying
 *                         broadcast on some OEM builds. NOTE: the SMS Retriever
 *                         API itself does NOT need READ_SMS and does not trigger
 *                         Play's restricted-SMS-permissions review. Only enable
 *                         RECEIVE_SMS if your OTP-verify library actually needs
 *                         it; prefer the hashed-SMS Retriever flow (no perms).
 *
 * ── How to turn it on for a dev/prod build ───────────────────────────────────
 *   1. Set EXPO_PUBLIC_NATIVE_CONVENIENCE=1 in .env
 *   2. Add the native deps (react-native-otp-verify and/or a phone-hint module)
 *   3. npx expo prebuild --clean && npx expo run:android
 * See docs/native-convenience.md for the full checklist.
 */

// Toggle: only inject permissions when the app explicitly opts in.
const ENABLED = process.env.EXPO_PUBLIC_NATIVE_CONVENIENCE === '1';

// Permissions the convenience features may need. Commented inline above.
const CONVENIENCE_PERMISSIONS = [
  'android.permission.READ_PHONE_NUMBERS', // phone-number hint (one-tap SIM number)
  'android.permission.RECEIVE_SMS', // SMS Retriever fallback on some OEMs
];

module.exports = function withNativeConvenience(config) {
  if (!ENABLED) return config; // JS-only build: add nothing.

  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = AndroidConfig.Permissions.ensurePermissions(
      cfg.modResults,
      CONVENIENCE_PERMISSIONS,
    );
    return cfg;
  });
};
