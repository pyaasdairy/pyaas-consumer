# PYAAS — Backend setup & keys checklist

Everything you must configure (and every key/secret to obtain) to make **every
feature actually work** end-to-end. Ordered by priority. ✅ = already done in code;
🔑 = you need to obtain a key/secret; ⚙️ = a dashboard/console step.

> Client env vars live in `.env` (only `EXPO_PUBLIC_*` — safe to ship).
> All real secrets (service_role, gateway secrets, provider keys) live **server-side**
> in Supabase **Edge Function** secrets — never in the app.

---

## 0. Supabase project (core — already wired) ✅🔑
- 🔑 `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` → `.env` (done).
- 🔑 `service_role` key — **server-side only** (Edge Functions). Never in the app.
- ⚙️ Run the SQL, in order, in **SQL Editor**:
  1. `supabase/pyaas_v2_schema.sql` (wallet, subs, coupons, referrals, VIP, farms, …)
  2. `supabase/pyaas_v4_consumer.sql` (Know-Your-Milk passport, app_stats, order priority/proof)
  3. `supabase/pyaas_v4_plantypes.sql` (adds the `one_time` plan type)
  - (Ops/Saathi app owns `unified_schema.sql` / `pyaas_v3_quality.sql` / `pyaas_v4_farmer.sql`.)
- ⚙️ **Auth → Providers → Email → "Confirm email" OFF** (instant testing).

---

## 1. OTP login + SMS (MSG91) — login is OTP-first 🔑⚙️
Provider: **MSG91** (India, DLT-compliant, ~₹0.15/OTP, free trial credits; one
account also does the pickup SMS in §2). Alternatives: Fast2SMS, Message Central.

Obtain / set up:
- 🔑 **MSG91 Auth Key** (dashboard → API).
- ⚙️ **DLT registration** (TRAI): register your **Sender ID** (e.g. `PYAASD`) and
  the OTP + transactional **message templates** with your telecom DLT operator.
- ⚙️ Supabase **Auth → Providers → Phone → enable**, then **Auth → Hooks → "Send SMS
  Hook"** → point to an Edge Function `send-sms` that calls MSG91.
  - 🔑 Edge Function secrets: `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_OTP_TEMPLATE_ID`.
  - The hook receives `{ phone, otp }`, formats and sends via MSG91.
- Client code is ready: `app/(auth)/otp.tsx` (signInWithOtp/verifyOtp).

> Until this is done, OTP "Send code" will error — use the **Use email** fallback.

---

## 2. Order / milk-pickup notifications 🔑⚙️
Customer texts on status change ("rider picked up", "out for delivery", "delivered").
- **SMS (recommended, same MSG91 account):** ⚙️ a Supabase **Database Webhook** on
  `orders` (UPDATE of `status`) → Edge Function `notify-status` → MSG91 transactional
  SMS using a **DLT-registered template**. Copy is in `lib/notifications.ts`
  (`statusMessage()`). 🔑 reuse `MSG91_AUTH_KEY` + 🔑 `MSG91_TXN_TEMPLATE_ID`.
- **Push (optional, later):** install `expo-notifications` (needs a rebuild) →
  `registerForPush()` (`lib/notifications.ts`) → store token in a `push_tokens`
  table → push from the same `notify-status` function.
  - 🔑 **Apple Push (APNs) key** (.p8) + Key ID + Team ID, added to **EAS credentials**.

---

## 3. Payments — wallet recharge & prepaid orders (Razorpay) 🔑⚙️
Physical goods/wallet must use an external gateway (Apple forbids IAP for these).
- 🔑 **Razorpay Key ID** (publishable) → can go in `.env` as `EXPO_PUBLIC_RAZORPAY_KEY_ID`.
- 🔑 **Razorpay Key Secret** → **server-side only**.
- 🔑 **Razorpay Webhook Secret**.
- ⚙️ Edge Function `razorpay-create-order` (creates an order) and `razorpay-webhook`
  (verifies signature → calls `wallet_credit`). Replace the dev placeholder
  `wallet_recharge()` SQL fn before production. Client stubs: `lib/razorpay.ts`.
- ⚙️ Razorpay account: business KYC + activate live mode for production.

---

## 4. VIP membership purchase — Apple In-App Purchase 🔑⚙️
VIP is a *digital* entitlement, so it uses **Apple IAP** (not Razorpay).
- ⚙️ **App Store Connect → auto-renewing subscription** product, id
  `in.pyaasdairy.vip.monthly` (see `lib/iap.ts` `PRODUCT_IDS`).
- ⚙️ Install `react-native-iap` (or Expo StoreKit) → rebuild → server-side
  **receipt validation** before granting VIP. 🔑 App Store **shared secret**.
- The free 5-day trial needs no IAP (granted by the signup trigger).

---

## 5. Location 🔑(none)⚙️
- ✅ `expo-location` installed; `NSLocationWhenInUseUsageDescription` set.
- **No API key needed** — we use device GPS + map deep-links (no paid Maps SDK).
- Coordinates are written to `addresses.lat/lng` and read by the rider app.
- If you later add an in-app map, that SDK (Google/Mapbox) would need its own key.

---

## 6. QR scanner (Know your milk) ✅⚙️
- ✅ `expo-camera` installed; `NSCameraUsageDescription` set. Works on a device build.
- ⚙️ To open the *scanned* batch's passport (vs the latest), have the QR encode the
  `batch_code` and look it up in `traceability_samples` (currently opens latest).

---

## 7. Storage buckets (avatar / door photo / voice note) ⚙️
- ⚙️ **Storage → create buckets**: `avatars`, `door-images`, `voice-notes` (private).
- ⚙️ RLS policies: owner-only by `auth.uid()` path prefix.
- Client uploads then stores the URL in `profiles.avatar_url` / `delivery_preferences.*`.
- Needs `expo-image-picker` (+ rebuild) for capture.

---

## 8. Realtime (optional) ⚙️
- ⚙️ **Database → Replication** → enable Realtime on `orders` + `riders` for push
  updates instead of the current 5-second polling.

---

## 9. Builds & store 🔑⚙️
- 🔑 **Apple Developer Program** ($99/yr) — for device installs / TestFlight / App Store.
- ⚙️ **EAS** (`eas build`) for cloud builds; `eas credentials` for signing + APNs.
- Bundle id: `in.pyaasdairy.app` (set).

---

## Quick "what do I need to buy/obtain" summary
| Feature | Service | Key/secret | Free? |
|---|---|---|---|
| Backend/DB/Auth | Supabase | URL + anon (client), service_role (server) | Free tier |
| OTP login + SMS | MSG91 | Auth key, sender id, template ids | Trial credits, ~₹0.15/msg |
| Pickup notifications | MSG91 (SMS) / Expo+APNs (push) | same MSG91 / APNs .p8 | SMS paid; push free infra |
| Wallet/prepaid pay | Razorpay | key id (client), secret + webhook secret (server) | Free acct, % per txn |
| VIP membership | Apple IAP | App Store product + shared secret | 30% Apple cut |
| Location | expo-location | none | Free |
| QR scan | expo-camera | none | Free |
| Push | expo-notifications | APNs key | Free infra |
| Store/builds | Apple Developer + EAS | Apple membership | $99/yr |
