# PYAAS — Native iOS Consumer App · Handoff & Build Brief

> **Read this first.** This document is the authoritative context for an agent
> that will build **both** the PYAAS **consumer iOS app** (this folder,
> `PyaasNative/`) **and** the **rider app**, which **share one Supabase
> backend**. It explains what is built, what remains, the shared-backend
> contract, and the exact server-side toggles still needed. Pair it with
> `README.md` (build/run) and `DECISIONS.md` (non-obvious calls).

Last updated: 2026-06-15.

---

## 0. TL;DR — current state

- **`PyaasNative/`** is a **native SwiftUI (iOS 17+) consumer app**, generated
  with XcodeGen. It **builds clean (0 errors, 0 warnings)** and its **15 unit
  tests pass**. Verified running in the iPhone 17 simulator.
- It is a **rewrite of the Expo app** in the repo root (`app/`, `components/`,
  `lib/`). The Expo app still exists; the native app is the new direction. They
  point at the **same Supabase project**.
- Brand: the **official `assets/pyaas-logo.png`** wordmark is used everywhere
  (bundled as a tintable template, `pyaas-wordmark`). No drawn drop mark.
- Flows: **Scan → Passport (flagship)**, **Shop → Cart → Checkout**, **Track
  (live map)**, **Account (email-OTP login) + Owner console (admin)**.

---

## 1. Repositories & where things live

| Thing | Location |
|---|---|
| Consumer **Expo** app (legacy, still here) | repo root: `app/`, `components/`, `lib/`, `store/` |
| Consumer **native iOS** app (this build) | **`PyaasNative/`** |
| Shared DB migrations / RPCs | `supabase/*.sql` (v2 → v6) + `supabase/functions/` |
| Coordination notes (consumer ⇄ rider ⇄ DB) | `DEVELOPER_NOTES.md`, `BACKEND_SETUP.md` |
| Rider app | **separate repo (Android)** — bring it in alongside `PyaasNative/` |

> **GitHub URLs:** fill these in for the combined agent — they were not present
> in the local checkout (this folder is not a git repo):
> - Consumer: `https://github.com/<owner>/<pyaas-consumer-repo>`
> - Rider: `https://github.com/<owner>/<pyaas-rider-repo>`
>
> Note: the `pyaas-saathi` monorepo (NestJS API on Render + a *different*
> Supabase `rsdrrlpmiefvxzsdcptn`) is a **separate ecosystem** — do **not**
> confuse it with the shared consumer/rider Supabase below.

---

## 2. The shared backend (both apps use this)

**Supabase project (shared, consumer + rider + Saathi ops):**

- URL: `https://mpzvykwayknrohzihakq.supabase.co` · ref `mpzvykwayknrohzihakq`
- **anon key**: public, gated by RLS — already in `PyaasNative/Config/Pyaas.xcconfig`.
  Safe to ship. **Never** put the `service_role` key or DB password in any client.
- RLS is **on**. Anon reads return `[]` until signed in (correct, not a bug).

**Tables (consumer-relevant):** `profiles`, `addresses`, `orders`,
`order_items`, `order_events`, `app_users` (riders — current), `riders`
(legacy), `wallets`, `wallet_transactions`, `subscriptions`,
`subscription_vacations`, `coupons`, `coupon_redemptions`, `referrals`,
`vip_memberships`, `partner_leads`, `farms`, `farmers`, `delivery_preferences`,
`autopay_mandates`, `traceability_samples`, `app_stats`.

**RPCs the iOS app calls today:**
- `get_milk_passport(p_token text)` → verified milk passport for a scanned QR
  token (anon-safe). Returns `{ verified, fat_pct, snf_pct, checks_passed,
  collected_at, packaged_at, delivered_at, cluster, centre, report{…} }`.
- `my_milk_passport()` → the signed-in customer's latest delivered batch
  (array; `[]` for anon).

**Other RPCs available (used by Expo app / rider):**
`rider_settle_order_from_wallet(order_id)`, `wallet_recharge(...)`,
`rider_upload_trace(...)`, `compute_milk_rate(...)`, `get_farm_story(...)`,
`tip_farmer(...)`, `follow_farm/unfollow_farm(...)`.

**Bridge triggers (the contract that keeps both apps in sync):**
- consumer `orders` insert → creates the rider-side delivery;
- rider claim / status update → writes back `orders.status` (single source of
  truth for both apps);
- rider GPS → mirrored to `app_users.current_lat/current_lng` (the iOS Track map
  reads this);
- `on_auth_user_created_extras` → wallet + 5-day VIP trial + referral code on
  signup (runs alongside the existing signup trigger).

> **Order status is the single source of truth across both apps.** Do not
> duplicate it; read/write it through the existing triggers.

---

## 3. What the iOS consumer app already does (built & verified)

**Architecture** — SwiftUI, iOS 17+, MV with `@Observable` `AppModel`, one
`SupabaseClient` **actor** over `async/await URLSession`. Money is integer
**paise** (`Money`); dates ISO-8601 UTC. Strict-concurrency (targeted). Design
tokens only (no literals): `Sources/DesignSystem/*`.

| Area | Status |
|---|---|
| Design system (color light/dark, type w/ serif, spacing/radius/shadow, motion, haptics, **official logo**) | ✅ |
| Component library (buttons, cards, chips, skeleton shimmer, empty/error states, section headers, downsampling `RemoteImage`, quality badge, quantity stepper, product card, share sheet) | ✅ |
| **Passport** (cinematic hero, parallax, farm-to-bottle timeline, quality badges + "what this means", composition, contributing farms, share-card image) | ✅ flagship |
| **Scan** (AVFoundation QR camera, custom reticle, torch, permission states, resolve → passport) | ✅ |
| **Home** (greeting, scan card, featured passport, recent scans, trust strip) | ✅ |
| **Shop** (category grid, product detail, sticky cart, **cart**, **checkout** with slot/payment, order-placed moment) | ✅ |
| **Track** (MapKit canvas, draggable bottom sheet, order status state machine, rider card, live ETA; sample rider advances) | ✅ |
| **Account** (email-OTP login, profile, membership, links, **Owner console**) | ✅ |
| **Email OTP auth** (Supabase GoTrue `type:"email"`) | ✅ client-side |
| **Admin gate** (2 allowlisted emails → Owner console with real order KPIs) | ✅ client-side |
| Localization **en + hi**, dark mode, Dynamic Type, VoiceOver, haptics | ✅ |
| Unit tests (money / parse / cart / billing / passport / order state) | ✅ 15 passing |

---

## 4. ⚙️ Server-side work still required (do these in Supabase)

These cannot live in the client. **In priority order:**

1. **Enable email OTP.** Supabase → **Authentication → Providers → Email** →
   enable **"Confirm email"** / email OTP (6-digit). Set the OTP email template.
   Until this is on, `requestEmailOTP` returns a humane error and login can't
   complete. *(This is the "turn on Supabase confirm email OTP" item.)*

2. **Admin RLS for the 2 owner emails.** The app gates the Owner console UI by
   `ADMIN_EMAILS` (xcconfig), but the **database** must also allow those emails
   to read every order, or the console shows an empty-state notice. Add a policy:
   ```sql
   -- All orders readable by the two owner emails.
   create policy "admins read all orders" on public.orders
     for select to authenticated
     using ( (auth.jwt() ->> 'email') in
             ('hello@pyaasdairy.com','admin@pyaasdairy.com') );
   ```
   Replace with the two real owner emails (must match `ADMIN_EMAILS`). Consider a
   `profiles.is_admin` column + a helper for a cleaner long-term gate.

3. **Payments — real Razorpay + webhook.** The iOS checkout uses a `StubGateway`
   behind the `PaymentGateway` protocol. Wire Razorpay Checkout + a
   server-verified webhook (Edge Function) before crediting/confirming orders.
   Physical goods stay on Razorpay (not Apple IAP); only digital VIP may use IAP.

4. **Storage buckets.** Create `pyaas-public` (farm photos, proof photos — the
   passport/track read these) and a private bucket for avatars/door/voice. The
   passport hero shows `farm_photo_url`; the tracking screen shows
   `orders.proof_photo_url`.

5. **Scheduled jobs.** Subscription → nightly order generation; VIP trial/expiry
   transitions; (these already have SQL scaffolding — wire as cron / pg_cron).

6. **Realtime (optional).** Enable Realtime replication on `orders` + `app_users`
   for push tracking (the app polls today).

---

## 5. iOS client work still open (smaller, app-side)

- **Catalog source:** products are a curated local list (`Catalog`,
  `Sources/Data/Models/Product.swift`) with real prices/images. Move to a
  `products` table + service if the team wants DB-driven pricing.
- **Wire the "Coming soon" Account links** (Subscriptions, Addresses, Wallet,
  Passports, Support, Legal) to the existing tables/RPCs from the Expo app.
- **Checkout → real order insert:** today the order-placed moment is local. Hook
  it to an `orders` insert (RLS-own) so it flows through the bridge to the rider.
- **Push notifications (APNs)** for status changes (rider out / delivered).
- **App icon:** a placeholder `AppIcon` set exists; drop in the final 1024² icon.
- **Owner console depth:** currently order KPIs + recent orders. Extend with
  app_stats, per-status filters, and an order-detail/actions view as needed.

---

## 6. How the two apps relate (for the combined agent)

```
            ┌────────────────────────┐
            │   Shared Supabase       │
 Consumer   │  mpzvykwayknrohzihakq   │   Rider (Android)
  iOS  ───▶ │  orders / app_users /   │ ◀───  app
 (this)     │  traceability_samples … │
            │  + bridge triggers      │
            └────────────────────────┘
   reads: my orders, assigned rider     writes: claim, status, GPS, trace
   (RLS own); scanned passport (anon)    upload; settle wallet on delivery
```

- **Don't fork the schema.** Both apps run the same `supabase/*.sql` chain. New
  needs → an additive, idempotent migration + an RLS policy.
- **The consumer never writes operational truth.** It inserts its own `orders`
  and reads the rider's public fields; the rider writes status/GPS; triggers
  reconcile. Keep that boundary.
- **PII-minimal passport** stays first-name + village + farm photo + story only.
- **Money is integer paise** on the wire in both apps; format in the UI.
- **Auth is one system** (Supabase GoTrue). Consumer = email OTP; reuse the same
  project for the rider — don't invent a second auth.

---

## 7. Build / run / configure (summary — full in `README.md`)

```bash
cd PyaasNative
brew install xcodegen        # if needed
xcodegen generate            # creates Pyaas.xcodeproj
open Pyaas.xcodeproj          # ⌘R on an iOS 17+ simulator
# or headless:
xcodebuild -project Pyaas.xcodeproj -scheme Pyaas \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

**One place to configure:** `PyaasNative/Config/Pyaas.xcconfig`
- `SUPABASE_HOST`, `SUPABASE_ANON_KEY` (shared project, already set)
- `ADMIN_EMAILS` — the two owner emails that unlock the Owner console.

---

## 8. Definition-of-done already met

Builds 0 warnings · lint-clean structure · full Dynamic Type + VoiceOver + dark
mode · 60/120fps hero · real copy, localized en + hi · scan → passport is the
flagship · no force-unwraps, no prints/TODOs · 15 unit tests green.
