# PYAAS v2 — Developer Notes (consumer app ⇄ rider app ⇄ shared Supabase)

This is the coordination doc for the v2 feature set (wallet, subscriptions,
coupons, referrals, VIP, autopay, farm locator, leads, delivery prefs). It
covers what changed in the DB, what the **rider app** must do, the
**location-sync backdoor**, and the **server-side** pieces (Razorpay, cron jobs,
storage) that cannot live in the client.

> Run `supabase/pyaas_v2_schema.sql` once in the shared project's SQL Editor.
> It is additive + idempotent and does **not** touch the existing
> `profiles / addresses / riders / orders / order_items / order_events` tables
> or the rider-app bridge triggers.

---

## 1. New tables (summary)

| Table | Purpose | Who writes |
|---|---|---|
| `wallets`, `wallet_transactions` | PYAAS Wallet balance + ledger | `wallet_credit/debit` fns only |
| `recharge_tiers` | "Add ₹200 → ₹50 free" bonus rules | dashboard (seeded) |
| `subscriptions`, `subscription_vacations` | daily/recurring milk + "set vacation" skips | user (RLS own) |
| `coupons`, `coupon_redemptions` | coupon catalog + per-user redemption | seeded / `redeem_coupon` |
| `referrals` | ₹100-per-signup referral ledger | `handle_new_user_extras` trigger |
| `vip_memberships` | ₹99/mo, 5-day auto trial, lifetime `total_saved` | trigger + VIP fns |
| `partner_leads` | bulk-order / franchise / vendor enquiries | user insert (RLS) |
| `farms`, `farmers` | Farm Locator (nearest farm + farmer card) | seeded / dashboard |
| `delivery_preferences` | global call-before / ring-bell / door image / voice | user (RLS own) |
| `autopay_mandates` | UPI recurring mandate (Razorpay placeholder) | user (RLS own) |
| `traceability_samples` | sample batch reports + test QR (USP) | seeded / dashboard |

New **columns** added: `profiles` (email, alternate_phone, family_member_count,
milk_preference, avatar_url, referral_code, referred_by, delivery_slot,
vip_status, vip_until); `orders` (coupon_code, coupon_discount, vip_discount,
wallet_used, subscription_id, delivery_prefs).

New **trigger**: `on_auth_user_created_extras` runs *alongside* the existing
`on_auth_user_created` — creates wallet + 5-day VIP trial + referral code, and
credits a referrer ₹100 when `signUp` metadata contains `referred_by`.

---

## 2. What the RIDER app must do (coordination checklist)

The rider app already claims orders and updates status/location. v2 adds **one**
new call and a couple of reads:

1. **Settle wallet-paid / subscription orders on delivery.**
   Right after `rider_update_status(order_id, 'delivered')`, call:
   ```sql
   select public.rider_settle_order_from_wallet(:order_id);
   ```
   - Idempotent (no double-charge): it no-ops if `orders.wallet_used > 0`.
   - Throws `Insufficient wallet balance` → rider app should show "collect cash"
     fallback and leave `payment_method`/COD handling as today.
   - Only call this for orders where the customer chose wallet/subscription
     payment. For `payment_method = 'cod'` the rider collects as usual; for
     `'prepaid'` it's already paid — **do not** settle from wallet.
2. **Read delivery preferences** so the captain sees instructions:
   - per-order override: `orders.delivery_prefs` (jsonb: `call_before`,
     `ring_bell`, `voice_instructions_url`, `door_image_url`, `notes`)
   - fallback to global: `delivery_preferences` for that `user_id`.
3. **Subscriptions are delivered as generated orders.** The rider app does **not**
   need to read `subscriptions` directly — a nightly job (below) turns due
   subscriptions into normal `orders` rows, which flow through the existing
   bridge trigger into rider deliveries exactly like one-off orders.
4. **VIP priority (optional, later):** when assigning/sorting deliveries, the
   rider app may prioritise customers where `profiles.vip_status in
   ('trial','active')`. Not required for correctness.

Nothing the rider app does today changes. The only behavioural addition is step 1.

---

## 3. Location-sync backdoor (consumer ⇄ rider)

Goal: the consumer app always has fresh map coordinates so the two apps stay in
sync without a paid maps key.

- **Rider → consumer (already built):** rider app calls
  `rider_update_location(lat, lng)` → mirrored onto `riders.current_lat/lng` →
  consumer's `getOrder()` `riders(*)` join shows it live (5s poll). Keep as-is.
- **Consumer → backend (v2):** the consumer app captures the delivery
  coordinate and writes it to `addresses.lat/lng` (columns already exist) when an
  address is added/edited, and passes it onto the order. **Action item (client,
  Phase 2):** request `expo-location` permission (Info.plist string already
  present), reverse-geocode for the address form, and store lat/lng.
- **Nearest farm** for the Farm Locator uses `nearest_farm(lat, lng)` against the
  user's default address coordinate (or live GPS).
- Enable **Realtime** on `riders` + `orders` in Database → Replication if you
  later want push instead of polling.

---

## 4. Server-side pieces (NOT in the client)

These need a Supabase **Edge Function** / external cron — placeholders noted so
nobody assumes the client does them:

1. **Razorpay payments & recharge** — see `lib/razorpay.ts`. The real flow:
   client creates an order via Edge Function → Razorpay Checkout → **webhook**
   (server, uses `service_role`) verifies signature and calls `wallet_credit`.
   ⚠️ The current `wallet_recharge(amount)` SQL fn is a **dev placeholder** that
   credits without real payment — **replace/disable it before production.**
2. **Autopay / PYAAS MONEY** — Razorpay UPI Mandate (`createMandate` placeholder).
   A scheduled charge calls the mandate, then `wallet_credit` on success.
3. **Subscription delivery generation** — nightly cron/Edge Function:
   for each `active` subscription whose `next_delivery_date <= today` AND not
   covered by a `subscription_vacations` range for that user/subscription →
   insert an `orders` row (+ `order_items`) with `subscription_id` set and
   `payment_method='wallet'`, then advance `next_delivery_date` by the frequency.
   The existing order→delivery bridge does the rest. Wallet is debited on
   delivery via `rider_settle_order_from_wallet` (§2.1).
4. **VIP expiry job** — daily: set `vip_status='expired'` where `vip_until < now()`
   and not renewed; flip trials to expired after 5 days.
5. **Storage buckets** (Dashboard → Storage): create `avatars`, `door-images`,
   `voice-notes` (private; RLS: owner-only via `auth.uid()` path prefix). The
   client uploads and stores the returned URL in `profiles.avatar_url` /
   `delivery_preferences.*`.

---

## 5. Pricing rules (client-computed; mirror server-side at settlement)

- **VIP**: ₹99/mo, 5-day free trial for every new install (no card). VIP price =
  configured per-product VIP price (see `lib/pricing.ts`). Track ₹ saved in
  `vip_memberships.total_saved`.
- **Bundles** (buy-more-save-more): e.g. Ghee ×4 → ₹799/jar instead of ₹1099
  (₹1200 off the 4-pack). Same ratio logic for other items (prices TBD). Defined
  in `lib/pricing.ts` so checkout and the rider settlement agree.
- **Recharge bonus**: `recharge_tiers` (₹200→₹50, ₹500→₹100, ₹1000→₹250,
  ₹10000→₹1000 cashback). Edit in the dashboard.
- **Referral**: ₹100 to referrer per successful signup (handled by trigger).

---

## 6. Auth: OTP-first (phone) + email fallback

The signed-out entry point is now **phone OTP** (`app/(auth)/otp.tsx`, Supabase
`signInWithOtp`/`verifyOtp`). Email sign-in/up remain as fallbacks. To make OTP
actually send, configure an SMS provider in Supabase.

### Recommended provider: MSG91 (India)
- Cheapest DLT-compliant gateway (~₹0.15/OTP vs Twilio ~₹0.45). Free trial credits.
- One account covers **login OTP + transactional SMS + WhatsApp** → also sends the
  order/pickup messages in §7.
- Wire to Supabase via an **SMS Hook** (Auth → Hooks → Send SMS Hook): a Supabase
  Edge Function verifies the request and calls MSG91's send-OTP/flow API. Register
  DLT templates first. (Alternatives: Fast2SMS, Message Central VerifyNow ~₹0.20.)
- Supabase also supports Twilio/Vonage/MessageBird/TextLocal natively if you'd
  rather not write the hook — but MSG91 is cheaper for India.

Apple/Google social sign-in still optional/later (the social buttons on the email
screen are placeholders). The `handle_new_user*` triggers populate
profile/wallet/VIP regardless of which method created the `auth.users` row — but
note a **phone-only** signup has no `full_name`/`email`; collect those later
(profile-edit) or in a post-OTP step.

## 7. Notifications (order & milk-pickup updates)

Channel options (see `lib/notifications.ts`):
1. **SMS via MSG91** (same account as OTP) — best reach in India. Trigger
   SERVER-SIDE on `orders.status` change via a Supabase DB webhook / Edge
   Function (or from the rider/ops app). Templates must be DLT-registered.
   Copy lives in `statusMessage()`.
2. **Push via expo-notifications** — install it (needs a rebuild + APNs key),
   call `registerForPush()`, store the Expo token in a `push_tokens` table, and
   push from the same status-change function.

The consumer app never sends these itself — it only registers the push token and
shows in-app state (the order tracking screen already polls every 5s). Recommended
MVP: SMS-only via MSG91 (no rebuild, no APNs), add push later.
