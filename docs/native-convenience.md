# Native "hyper-convenience" onboarding

Low-friction sign-up for the PYAAS consumer app: the user should type as little
as possible. Every feature here is a **seam** — it works today with pure JS (OS
autofill / keyboard suggestions) and lights up a last-mile "one-tap" experience
**only** when the matching native module is added in a dev/prod build. Nothing
here is required for the app to build or run; **all native bits degrade to a
graceful no-op** so the JS-only build is unaffected.

## What ships today (JS-only, zero native code)

| Field | Screen | Attributes | Effect now |
|---|---|---|---|
| Phone | `app/(auth)/otp.tsx` | `autoComplete="tel"` · `textContentType="telephoneNumber"` · `importantForAutofill="yes"` | OS offers saved numbers to autofill |
| OTP code | `app/(auth)/otp.tsx` | `autoComplete="sms-otp"` (Android) · `textContentType="oneTimeCode"` (iOS) · `importantForAutofill="yes"` | Keyboard / one-tap surfaces the incoming SMS code |
| Name | `sign-up.tsx`, `complete-profile.tsx` | `autoComplete="name"` · `textContentType="name"` | Autofill of the saved name |
| Email / password | `sign-in.tsx`, `sign-up.tsx` | `autoComplete="email"`/`"password"` + matching `textContentType` | Password-manager autofill |
| Street / city / pincode | `app/address.tsx` | `street-address` · `postal-address-locality` · `postal-code` (+ iOS `textContentType`) | OS address autofill |

The existing **dev OTP display** (`dev_otp` from the backend, or the demo code)
is untouched — testers still see the code on screen.

## The seams (native, opt-in)

### 1. `lib/nativeConvenience.ts` — phone hint + SMS retriever

- **`requestPhoneHint()`** — called on **focus** of the phone field. Meant to
  fire Google Play Services `getPhoneNumberHint` (one-tap SIM number). There is
  **no maintained first-party Expo/Play-Services module** for this today, so it
  looks for an optional native module `RNPhoneNumberHint.requestHint()` and
  returns `null` (no-op) when absent. Only prefills if the user hasn't typed.
- **`startSmsRetriever(onCode)`** — active on the code step. Meant to auto-read
  the incoming OTP via the **SMS Retriever API** (no `READ_SMS`, app-hashed).
  Wraps optional `react-native-otp-verify`; returns a noop cleanup when absent.
  On a matching SMS it autofills + verifies.
- **`getSmsAppHash()`** — returns the 11-char app hash the OTP SMS must be
  suffixed with for SMS Retriever to deliver it. Give this to the backend/SMS
  template team. Returns `null` until the native module is present.

Every function is wrapped in try/catch and platform/module guards — they never
throw.

### 2. `lib/places.ts` — predictive address (Google Places)

Env-gated by **`EXPO_PUBLIC_GOOGLE_PLACES_KEY`**:
- **empty** → `isPlacesEnabled()` is false, no dropdown, no network — plain
  manual typing (current behaviour).
- **set** → `placesAutocomplete()` suggests as the user types (debounced 250 ms,
  India-biased, session-tokened for billing); picking one calls
  `placeDetails()` to prefill line1/line2/city/pincode + coordinates.

The address screen (`app/address.tsx`) renders the suggestions dropdown under
the "Flat / House / Building" field. Uses `fetch` — no native code required, so
this seam works in the JS-only build too, the moment a key is provided. For a
hardened setup, proxy the two Google URLs through `parag-api` and point the seam
there.

## Turning on the native features in a dev build

1. **Install deps** (choose what you need):
   ```bash
   npm i react-native-otp-verify          # SMS Retriever (OTP auto-read)
   # phone hint: no maintained drop-in — add a thin local native module that
   # exposes RNPhoneNumberHint.requestHint(): Promise<string>, or a community pkg
   ```
2. **Enable the permission plugin**: set `EXPO_PUBLIC_NATIVE_CONVENIENCE=1` in
   `.env`. This makes `plugins/withNativeConvenience.js` inject the Android
   permissions at prebuild (it is a no-op otherwise).
3. **Prebuild + run**:
   ```bash
   npx expo prebuild --clean
   npx expo run:android
   ```
4. **Backend / SMS template**: for SMS Retriever the OTP message must end with
   the app hash from `getSmsAppHash()` and follow the `<#>` format Google
   requires. Coordinate with the parag-api OTP sender.

## Android permissions (behind the env flag)

Declared in `plugins/withNativeConvenience.js`, added **only** when
`EXPO_PUBLIC_NATIVE_CONVENIENCE=1`:

- `READ_PHONE_NUMBERS` — phone-number hint fallback on some OEMs.
- `RECEIVE_SMS` — SMS Retriever fallback on some OEMs.

Note: the SMS Retriever API itself needs **no** `READ_SMS` and does **not**
trigger Play's restricted-SMS-permissions review. Keep `RECEIVE_SMS` off unless
your chosen library genuinely requires it. The default JS-only build declares
**neither**.

## Files

- `lib/nativeConvenience.ts` — phone hint + SMS retriever seam
- `lib/places.ts` — Google Places autocomplete seam
- `plugins/withNativeConvenience.js` — env-gated Android permissions
- `app/(auth)/otp.tsx` — phone-hint-on-focus + OTP autofill + SMS retriever hook
- `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`, `app/complete-profile.tsx`
  — autofill attributes
- `app/address.tsx` — address autofill + Places dropdown
