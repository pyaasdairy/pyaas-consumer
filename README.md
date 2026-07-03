# PYAAS — Consumer App (iOS first)

A premium, mobile-first consumer app for **PYAAS**, India's traceable dairy brand.
Customers browse products, build a cart, place an order, and get **connected with a
rider** for delivery. Built with **Expo + React Native** so you can test it on a
real iPhone with **no Mac and no Xcode**, using the free **Expo Go** app.

Everything here uses **free** services only:

| Need | Service | Cost |
|------|---------|------|
| Backend DB + Auth + API | Supabase (free tier) | Free |
| Auth | Supabase email + password | Free |
| Payments | Cash / UPI on delivery | Free (no gateway) |
| Maps / tracking | Custom in-app live strip (no Google Maps key) | Free |
| Testing on iPhone | Expo Go from the App Store | Free |
| Fonts, icons, animations | Open-source (Google Fonts, Ionicons, Reanimated) | Free |

> This is a **separate** project from the website (`pyaas-website`), with its own
> file structure and its own Supabase database. The two do not share a backend.

---

## 1. What's inside

```
pyaas-app/
  app/                       # expo-router screens (file-based routing)
    _layout.tsx              # providers, fonts, auth gate
    index.tsx                # brand splash + redirect
    (auth)/                  # welcome, sign-in, sign-up
    (tabs)/                  # Shop, Orders, Profile (bottom tabs)
    product/[id].tsx         # product detail + add to cart
    cart.tsx                 # cart + totals
    checkout.tsx             # address + payment + place order
    address.tsx              # add a delivery address (modal)
    order/[id].tsx           # LIVE order tracking + rider connection
  components/                # UI kit (Button, Field, ProductCard, etc.)
  constants/products.ts      # the product catalog (prices, images)
  lib/                       # supabase client, auth, api, theme, status
  store/cart.ts             # cart state (Zustand + AsyncStorage)
  assets/                    # product photos, logo (copied from the website)
  supabase/schema.sql        # the app's database (run this in Supabase)
  .env.example               # copy to .env and fill in
```

Brand colours, fonts (Playfair Display + Inter) and tone match the website.

---

## 2. One-time setup (about 10 minutes)

### Step A — Install Node tooling
You already have Node. From this folder, install dependencies:

```bash
cd pyaas-app
npm install --legacy-peer-deps
```

(`--legacy-peer-deps` avoids a harmless React peer-version warning from the
Google Fonts packages.)

### Step B — Create your free Supabase project (the backend)
1. Go to **https://supabase.com** → sign in → **New project**.
   - Pick a name (e.g. `pyaas-app`), a database password, and a region close to India (e.g. Mumbai/`ap-south-1`).
   - Wait ~2 minutes for it to provision.
2. In the project, open **SQL Editor → New query**, paste the **entire contents of
   [`supabase/schema.sql`](supabase/schema.sql)**, and click **Run**.
   - This creates all tables (profiles, addresses, orders, order_items,
     order_events, riders), the security rules, the triggers, and the rider
     backdoor functions. It also seeds one demo rider.
3. Turn **off email confirmation** so testing is instant:
   - **Authentication → Providers → Email** → turn **"Confirm email" OFF** → Save.
   - (You can turn it back on for production.)

### Step C — Connect the app to Supabase
1. In Supabase: **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long `eyJ...` string)
2. In this folder, copy the example env file and paste your values:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi....your-anon-key....
```

> The `anon` key is safe to ship in a mobile app — it only allows what the
> Row-Level-Security rules in `schema.sql` permit (a user sees only their own
> data). Never put the **service_role** key in the app.

---

## 3. Test it on your iPhone 17 Pro (Expo Go — no Mac needed)

1. On the iPhone, install **Expo Go** from the App Store.
2. Make sure your **iPhone and your PC are on the same Wi-Fi network**.
3. On the PC, in this folder, start the dev server:

   ```bash
   npx expo start
   ```

   A **QR code** appears in the terminal.
4. On the iPhone, open the **Camera** app and point it at the QR code, then tap
   the **"Open in Expo Go"** banner. The app loads live on your phone.
5. The first load takes ~30–60s (it downloads the JS bundle). After that, saving
   a file hot-reloads instantly.

### If the QR code won't connect (different networks / strict Wi-Fi)
Use a tunnel (works across any network):

```bash
npx expo start --tunnel
```

Then scan the new QR code. (First time, it may ask to install `@expo/ngrok` —
say yes; it's free.)

### Full walk-through to try
1. **Create an account** (name, mobile, email, password) → you land on **Shop**.
2. Tap a product → **Add** → open the **cart** (bag icon, top-right).
3. **Proceed to checkout** → **Add a delivery address** → choose **Cash on delivery**
   → **Place order**.
4. You're taken to the **live order tracking** screen.
5. Tap **"Simulate rider pickup (demo)"** — the order goes **out for delivery**, a
   **rider card** appears (name, vehicle, rating, a **Call** button), and the live
   tracking strip animates the rider toward your home. This proves the
   consumer↔rider connection end-to-end before the rider app exists.

---

## 4. How the rider connection works (the "backdoor")

The schema is already built so the future **Rider app (Android)** plugs straight in
with no changes to the consumer app:

- Every order has a `rider_id` that points at a row in the **`riders`** table.
- The consumer app reads the assigned rider (name, phone, vehicle, live lat/lng)
  and shows it on the tracking screen, refreshing every 5 seconds.
- The Rider app will call these ready-made, secured Postgres functions
  (in `supabase/schema.sql`):
  - `rider_claim_order(order_id)` — a logged-in rider claims an unassigned order.
  - `rider_update_status(order_id, status)` — `assigned → out_for_delivery → delivered`.
  - `rider_update_location(lat, lng)` — pushes the rider's live GPS.
- For now, `simulate_rider_assignment(order_id)` lets you (the customer) demo the
  whole flow. It only ever acts on **your own** order. When the real rider app is
  live, that demo button is moot (real riders claim orders instead).

To onboard a real rider later: create their auth user, then set that user's id on
their `riders.user_id` row. They'll then be authorised to claim and deliver orders.

> When you're ready, your next prompt ("convert this into the rider app" /
> "build the rider app") will reuse this exact backend.

---

## 5. Going from Expo Go to a real installable app (later, optional)

Expo Go is perfect for development and demos. To ship a standalone app to the App
Store / Play Store you'll use **EAS Build** (Expo's free cloud build — free tier
includes a limited number of builds/month):

```bash
npm install -g eas-cli
eas login
eas build --platform ios      # produces an installable build (needs an Apple Developer account, $99/yr — Apple's fee, not Expo's)
```

For Android (when we build the rider app and ship this one): `eas build --platform android`
produces a free `.apk` you can sideload with no paid account.

You do **not** need any of this to test on your iPhone now — Expo Go covers it.

---

## 6. Troubleshooting

| Symptom | Fix |
|--------|-----|
| "Backend not set up" messages | `.env` is empty or wrong. Fill both values, then stop and re-run `npx expo start`. Env vars are read at startup. |
| Sign-up "Email not confirmed" | Turn off **Confirm email** in Supabase (Step B.3), or check the inbox and confirm. |
| Stuck on the splash logo | Usually the Supabase URL/key are wrong, so the session check hangs. Double-check `.env`. |
| QR won't connect | Use `npx expo start --tunnel`. |
| Orders/addresses empty after creating | Make sure you ran the **whole** `schema.sql`; the RLS policies are required. |
| Changed `.env` but nothing changed | Stop the server (Ctrl-C) and run `npx expo start -c` (clears cache). |

---

## 7. Commands cheat-sheet

```bash
npm install --legacy-peer-deps   # install deps
npx expo start                   # dev server + QR for Expo Go
npx expo start --tunnel          # dev server over a tunnel (any network)
npx expo start -c                # start with a cleared cache
npx tsc --noEmit                 # type-check
npx expo export --platform ios   # produce a production JS bundle (sanity check)
```

Know your milk. Delivered.
