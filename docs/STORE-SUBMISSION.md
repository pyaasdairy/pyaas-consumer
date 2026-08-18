# Store submission reference — PYAAS consumer app

Derived from the codebase on 18 Aug 2026 (post-remediation). Every answer below
is grounded in what the app actually does; update this file whenever data
practices change, and keep the console forms identical to it.

## Identity

| | |
|---|---|
| App name | PYAAS |
| Android applicationId | `in.pyaasdairy.app` |
| iOS bundleIdentifier | `in.pyaasdairy.app` |
| Version | 1.0.0 (EAS remote version source; `autoIncrement` on production) |
| Play target API | 36 (Android 16) — meets the 31 Aug 2026 requirement |
| iOS deployment target | 16.4, built with Xcode 26 / iOS 26 SDK (required since 28 Apr 2026) |

## Google Play — Data Safety (truthful derived answers)

**Collected & shared:**
- **Phone number** — collected (account creation/OTP), stored on PYAAS servers,
  **shared with the SMS provider (MSG91, server-side)** to deliver the OTP.
  Required, not optional. Encrypted in transit (HTTPS only).
- **Name, email (optional), physical address, precise location (delivery pin)**
  — collected for app functionality (delivery). Not shared with third parties.
- **Purchase/order history & wallet ledger** — collected (app functionality).
  Payments are processed by Razorpay; **card/UPI details never touch PYAAS
  servers or the app** (Razorpay checkout handles them).
- **Order reviews / delivery instructions / optional door photo** — user
  content, app functionality. Door photo currently stays on the device.

**Not collected / not present:** Advertising ID (no ads SDK, no AD_ID
permission), analytics SDKs (none), tracking (none), background location
(disabled), contacts, microphone.

**Deletion:** in-app account deletion (Profile → Delete account) triggers the
server-side erasure cascade; wallet balance is forfeited (stated in the dialog
and Terms). A web deletion URL must also be declared in Play Console — host it
at the site's deletion form and keep it wired to the same erasure endpoint.

## Play Console — App access (reviewer instructions)

- Sign in with test number **9999900000**; the backend must have the review
  OTP window (`REVIEW_LOGIN`) enabled during review (backend flag — see
  saathi-backend). This account lifts the delivery geofence only; money,
  consent and OTP flows behave exactly as production.
- Without the test account: on first launch choose **"Skip for now"** or pick
  city **Lucknow** in the location sheet to browse and order.
- Out-of-zone browsing (Coming Soon storefront) is intended behavior for this
  single-township launch, not a broken state.

## Apple App Review notes (paste into App Store Connect review notes)

- PYAAS delivers physical dairy (milk subscriptions) in Lucknow, India.
- **PYAAS Plus is a delivery-service membership for physical goods** —
  priority delivery slots, free delivery, member milk prices. No digital
  content or features are sold. Per guidelines 3.1.3(e)/3.1.5(a), payment runs
  through Razorpay (wallet top-ups for physical goods), not IAP. It does not
  auto-renew.
- Sign in with the test account above (OTP review window), or use
  "Skip for now" / city "Lucknow" to reach the full flow from any location.
- Camera is used for pack-QR scanning and an optional door photo; photo
  library for profile picture / door photo — both reflected in the purpose
  strings.

## iOS App Privacy answers (match the bundled privacy manifest)

Collected, linked to identity, no tracking: Name, Phone number, Email,
Physical address, Precise location, Purchase history, Customer support,
Product interaction, Other user content. **Do NOT declare** Payment info
(Razorpay-only) or Photos (door photo/avatar never leave the device today) —
the bundled `PrivacyInfo.xcprivacy` was pruned to match.

## External blockers checklist (cannot be done from this repo)

1. **Play upload key**: local `pyaas-release.keystore` differs from the upload
   cert Play expects (`upload_cert.der`, SHA1 55:49:E8:4F…). Build the store
   AAB **via EAS** (`eas build -p android --profile production`) or reset the
   upload key in Play Console.
2. **EAS version counter**: `eas build:version:get -p android` must be ≥ 30
   before the first EAS production build (local v29 shipped from gradle).
3. **Google Places key**: restrict `EXPO_PUBLIC_GOOGLE_PLACES_KEY` in Google
   Cloud Console (Android package + SHA-1, iOS bundle id, Places API only);
   rotate if it was ever unrestricted.
4. **Consumer app key**: rotate `parag_consumer_dev_key_v1` to a production
   value on saathi-backend, then update EAS env.
5. **App links**: host `/.well-known/assetlinks.json` (package +
   **Play App Signing** SHA-256, not the upload key) and
   `/.well-known/apple-app-site-association` (team-id-prefixed appID,
   `/trace/*`) on pyaasdairy.com; enable the Associated Domains capability on
   the App ID.
6. **eas.json submit block**: fill real `appleId` / `ascAppId` /
   `appleTeamId`.
7. **Backend (saathi-backend repo)**: items B1–B10 of the audit — OTP dev-mode
   off in prod, real `RAZORPAY_KEY_SECRET`, subscription fee waiver parity,
   Plus pricing server-side, erasure cascade breadth, OTP rate-limits,
   review-login flag, `/consents` mirror, JWT phone claim, render.yaml pin.
8. **Hindi privacy policy**: the in-app consent surfaces are bilingual; the
   full legal privacy policy needs professional translation before a Hindi
   version is published.
9. **2+2 hero banner**: corrected creative (1672×941 PNG) still needed for the
   home slideshow; the old misleading banners stay removed.
