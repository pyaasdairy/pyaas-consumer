# App Store Resubmission — 1.0.0 (build 9) — updated 26 Aug 2026

Apple rejected submission `9b5bb5ed-62fe-40b8-96bc-601098d4ff19` (19 Aug) under
**Guideline 2.1 — Information Needed**. Nothing is broken; they want a demo video,
demo credentials, and context before completing the review. This doc contains the
exact reply, the recording script, and the click path.

**State (24 Aug):** Reviewer login `9999900000` / OTP `123456` live-verified against
the production backend (returns ACTIVE profile + JWT). Encryption compliance baked in
(`ITSAppUsesNonExemptEncryption=false`).

> **⚠️ DO NOT SUBMIT BUILDS 5 OR 6 — they abort at launch.** Verified on a physical
> iPhone 17 Pro: `Wrong bytecode version. Expected 96 but got 98`. The Hermes V1
> opt-out (build 4's launch-freeze fix) swapped the VM to Hermes 0.16.0 but the
> Aug 21 prebuild left the bundle phase compiling V1 bytecode — and when the 0.16
> compiler errors, the Xcode phase silently keeps the previous (V1) bundle. Build 6
> was uploaded to ASC on 24 Aug before this was discovered; it is burned, never
> attach it. Builds 7+ carry the completed three-part opt-out (VM + compiler +
> babel transpile — see `plugins/withHermesV1Disabled.js`). Build 8 added the honest
> Plus "opens soon" gate; **build 9** (adds the latency fixes: instant shop render +
> backend warm-up ping) is the resubmission binary. The Android release artifact from 21 Aug (`PYAAS-TEST-0821-2009-15f19cb.apk`)
> has the same 98-bytecode bundle and needs the same verification before any Play use.

---

## 1 · Reply to paste into App Review (attach the screen recording to this reply)

> Hello, and thank you for the detailed guidance. All requested information follows.
> We have also updated the binary to build 9 (same version 1.0.0), which contains
> reliability fixes made since build 4.
>
> **1. Screen recording** — Attached. Captured on a physical iPhone 17 Pro running
> iOS 26.6. It begins at cold launch and shows: the first-run privacy disclosure,
> account registration/login via phone + OTP (using the demo reviewer account below),
> browsing the dairy catalog, the location permission prompt while setting a delivery
> address, placing a paid order from the prepaid wallet, starting a daily milk
> subscription, opening a Razorpay wallet-recharge checkout, the PYAAS Plus membership
> screen (₹99/month preview — joining is gated "opens soon" in this build), the camera
> permission prompt in the pack-scan (traceability) feature, the in-app FSSAI & Legal
> screen, and finally the complete in-app account deletion flow.
>
> **2. Devices tested** — Physical: iPhone 17 Pro (iOS 26.6). Simulators during
> development: iPhone 16/17 family on the iOS 26.5 SDK. (The Android build of the same
> product is separately in production on Google Play.)
>
> **3. Purpose and audience** — PYAAS ("Know Your Milk") is a milk-and-dairy ordering
> and subscription service operated by PYAAS Dairy Private Limited for households in
> Lucknow, Uttar Pradesh, India. Customers subscribe to daily morning milk delivery or
> place one-time orders of PARAG-brand dairy manufactured by Lucknow Producers
> Co-operative Milk Union Ltd. The app's differentiator is pack-level traceability:
> scanning the QR/batch code on a pack shows which cooperative union and plant produced
> it and the quality tests that batch passed. Payments run on a prepaid wallet. Value:
> dependable daily doorstep milk with transparent sourcing and quality information.
>
> **4. Access instructions / demo account** — Sign-in is phone + SMS OTP. A permanent
> reviewer account is provisioned:
> - Phone: **9999900000** · OTP: **123456** (always active; no real SMS is sent for
>   this number)
> - The account is pre-provisioned with an ACTIVE profile, a serviceable Lucknow
>   delivery address, and a wallet automatically kept at ₹500 so every paid flow
>   (orders, subscriptions, PYAAS Plus) can be exercised without a live card.
> - Delivery is normally geofenced to serviceable Lucknow pincodes; this reviewer
>   account bypasses the geofence so all features work from any location.
> Flow: install → accept the privacy disclosure → enter phone 9999900000 → enter OTP
> 123456 → full app access. No sample files are required.
>
> **5. External services** — Our own backend API (Go + MongoDB, hosted on Render) for
> authentication, catalog, orders, subscriptions and wallet; Razorpay (payment gateway)
> for wallet recharges; MSG91 (server-side SMS delivery of OTPs to real users); Google
> Places API (delivery-address search); Leaflet/OpenStreetMap for map display. No
> third-party analytics, advertising, tracking SDKs, or AI services. Consequently the
> app does not show an App Tracking Transparency prompt (no tracking occurs).
>
> **6. Regional differences** — None in features or content. The App Store availability
> is India and physical delivery is limited to serviceable pincodes in Lucknow, Uttar
> Pradesh; outside them the shop is browse-only. The demo reviewer account above
> bypasses this restriction so the app can be fully reviewed from anywhere.
>
> **7. Regulated industry / protected material** — The app sells physical food (dairy),
> regulated in India under FSSAI. Products are manufactured by Lucknow Producers
> Co-operative Milk Union Ltd (PARAG brand) under FSSAI licence **12722999000171**,
> printed on every pack. PYAAS Dairy Private Limited (CIN U46302UP2026PTC255483,
> GSTIN 09AARCP2552Q1ZI) is the seller of record; the PARAG marks are used in
> connection with the products under arrangement with the Union. The in-app "FSSAI &
> Legal" screen displays these details in line with FSSAI display norms for online
> food sellers. The app contains no protected third-party media content.
>
> **A note on subscriptions (re: Guideline 3.1.2)** — All "subscriptions" in the app
> are recurring deliveries of physical goods (daily milk), charged from the prepaid
> wallet (funded via Razorpay) and per Guideline 3.1.3(e)/3.1.5 not using App Store
> in-app purchase. PYAAS Plus (₹99/month) is a membership providing benefits on those
> physical deliveries; in this build joining is gated with an "opens soon" notice
> (membership records are moving fully server-side), so no Plus purchase can occur.
> Its screen shows title, price, term and cancel-anytime terms as a preview, with
> Terms of Use and Privacy Policy linked in-app.
>
> **User-generated content** — The app has no public or shared user-generated content
> (no feeds, reviews, chat or profiles visible to other users), so no reporting/
> blocking mechanisms apply.
>
> Account deletion is available in-app at Profile → Delete account and is shown in
> the recording. Thank you for the review.

---

## 2 · Screen recording script (record on the iPhone, one take, ~3–4 min)

Preparation: Settings → Focus → Do Not Disturb ON (no notification pop-ins). If the
app is installed, delete it first so the recording starts at first-run. Record either
with iOS screen recording (Control Center) **or** QuickTime on the Mac (cable):
QuickTime → File → New Movie Recording → arrow next to record button → camera:
"Kush's iPhone 17 pro" — records straight to a .mov on the Mac (preferred: no red
pill, file lands where you need it).

Scenes, in order:

1. Home screen → tap the PYAAS icon (cold launch, splash).
2. Privacy disclosure screen → Agree.
3. Enter phone **9999900000** → Continue → OTP **123456** → signed in.
4. Browse the shop: scroll catalog, open a product (e.g. Toned Milk), Add to cart.
5. Set/confirm delivery address so the **location permission prompt** appears → Allow.
6. Cart → place the order (pays from the ₹500 wallet) → order confirmation → Orders.
7. Start a daily subscription (2 min): pick product → schedule → confirm.
8. Wallet tab: balance + statement → tap ₹500 recharge → **Razorpay checkout sheet
   opens** → cancel out (the wallet-paid order in scene 6 already showed a completed
   purchase).
9. PYAAS Plus screen: linger 2–3 s so ₹99/month + cancel-anytime terms are legible;
   tap Join once to show the "joining opens soon" notice (honest, no dead-end).
10. Know your milk → Scan your pack → **camera permission prompt** → Allow (scan or
    type a batch code; the empty/lab-pending state is fine).
11. Profile → FSSAI & Legal screen (linger 2 s). Optionally Privacy Policy.
12. Profile → **Delete account** → read dialog → confirm **Delete** (the reviewer
    account self-heals server-side; wallet refloats to ₹500 on next login) → land on
    sign-in → log back in with 9999900000/123456 to prove account re-creation.
13. Stop recording.

If the file is over ~100 MB, compress before attaching:
`ffmpeg -i in.mov -vcodec h264 -crf 28 -preset fast out.mp4`

---

## 3 · App Store Connect click path (in the browser, after build 6 finishes processing)

Apple emails "build 6 has completed processing" (usually 5–30 min after upload).

1. appstoreconnect.apple.com → Apps → **PYAAS : Know Your Milk** → Distribution tab
   → version **1.0** (the rejected one). Do **NOT** click "Cancel Submission".
2. **Build section**: remove build 4 (red minus), then "Add Build" → select
   **1.0.0 (6)** → Done → **Save** (top right).
3. **App Review Information** (same page, lower down) — confirm it shows:
   Sign-in required ✓ · User name `9999900000` · Password `123456` · Notes = the
   items above · your contact phone + email. (Pre-filled via API if the automation
   ran; verify it looks right.)
4. Go to the **App Review / iOS Submission** page (where the rejection message is)
   → "Reply to App Review" → paste section 1 → attach the screen recording →
   Send.
5. Back on the submission page: **Resubmit to App Review** (activates once the
   version edits are saved). Click it.

Review usually returns within 24–48 h. If they want more, it arrives in the same
message thread.

---

## Facts inventory (verified today)

| Item | Value |
|---|---|
| App ID (ASC) | 6802787510 |
| Rejected submission | 9b5bb5ed-62fe-40b8-96bc-601098d4ff19, version 1.0, build 4 |
| New binary | 1.0.0 (9) — Hermes fix + Plus gate + latency fixes (instant shop render, healthz warm-up), HBC 96 verified |
| Demo login | 9999900000 / 123456 — live-verified 24 Aug against prod backend |
| Reviewer wallet | auto-topped to ₹500 on every login (backend `ensureReviewAccount`) |
| Purpose strings | photos / location / camera / motion — descriptive, in the IPA |
| Encryption | ITSAppUsesNonExemptEncryption=false (no compliance prompt) |
| Account deletion | Profile → Delete account (`app/(tabs)/profile.tsx`) |
| FSSAI | 12722999000171 (manufacturer; shown in-app, FSSAI & Legal screen) |
| ASC API key | `HP5A96R2TQ` in `~/.appstoreconnect/private_keys/`, issuer `4428e63d-babc-4488-856b-8e425c8ce7b4` |
