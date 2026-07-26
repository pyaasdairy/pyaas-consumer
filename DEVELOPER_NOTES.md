# PARAG - Developer Notes (architecture)

How the data layer is wired and how each module maps onto a `parag-api` endpoint.
The app is **local-first**: it runs fully on-device today and swaps to the real
API by setting `EXPO_PUBLIC_API_URL`. (The codebase was derived from a sibling
PYAAS app and re-architected; feature scope here is shopping, subscriptions,
coupons and wallet only.)

---

## 1. The three-file seam

Every data-layer module goes through the same seam, so switching from offline to
the deployed backend is a per-function change with no screen edits.

- **`lib/apiClient.ts`** - the real backend seam. A thin REST client
  (`api.get/post/patch/del`) for `parag-api`. Stores JWT **access + refresh**
  tokens in `expo-secure-store`, attaches the access token to every request, and
  retries once after a silent `POST /auth/refresh` on a `401`.
  `isBackendConfigured()` is `true` only when `EXPO_PUBLIC_API_URL` is set.
- **`lib/localStore.ts`** - on-device fallback (AsyncStorage). Generic
  `getRows / setRows / insertRow / updateRows / deleteRows` plus
  `getSingle / putSingle`, all keyed `parag:<table>:<ownerId>`. Data is scoped per
  user id, mirroring how the API scopes every query by the JWT's `user_id`.
- **`lib/session.ts`** - auth session + profile. Today the phone-OTP flow runs
  against the local store: `signInWithPhone()` accepts any 10-digit number with
  demo OTP `DEMO_OTP = '123456'` and creates a stable `u_<digits>` account.
  `requireUserId()` is what every data-layer write calls to scope its rows.
  `lib/auth.tsx` wraps this in an `AuthProvider` / `useAuth()` context.

To go live, a module keeps its signature and swaps `localStore` calls for
`apiClient` calls against the endpoints below. `session.ts` swaps the demo login
for `POST /auth/otp/request` + `/auth/otp/verify` (returning the JWT pair) and
reads the profile from `GET /users/me`.

## 2. Data-layer modules → parag-api endpoints

| Module | Responsibility | parag-api endpoints |
|---|---|---|
| `lib/session.ts` | login, session, profile | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `GET /users/me` |
| `lib/api.ts` (addresses) | delivery addresses | `GET /addresses`, `POST /addresses`, `PATCH /addresses/:id`, `POST /addresses/:id/default`, `DELETE /addresses/:id` |
| `lib/api.ts` (orders) | place / list / track / cancel orders, rider demo | `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/simulate-rider` |
| `lib/coupons.ts` | coupon catalog + validation | `GET /coupons`, `POST /coupons/validate` |
| `lib/subscriptions.ts` | milk subscriptions + vacation pauses | `GET /subscriptions`, `POST /subscriptions`, `PATCH /subscriptions/:id`; `GET /vacations`, `POST /vacations`, `DELETE /vacations/:id` |
| `lib/walletApi.ts` | wallet balance, ledger, recharge, autopay | `GET /wallet`, `GET /wallet/transactions`, `POST /wallet/recharge` |
| `lib/profileApi.ts` | extended profile, avatar, delete account | `GET /users/me`, `PATCH /users/me`, `DELETE /users/me` + S3 avatar upload |
| `lib/deliveryPrefs.ts` | per-user delivery preferences | persisted via the user profile (`PATCH /users/me`); a per-order copy travels in the `POST /orders` payload |
| `lib/location.ts` | device GPS helper | no endpoint of its own - writes the chosen coordinate onto an address via `PATCH /addresses/:id` (`lat`/`lng`) |

The bundled catalog (`constants/products.ts`) is the offline stand-in for the
API's `GET /categories` and `GET /products`.

## 3. Notes per module

- **`api.ts`** - `placeOrder()` computes subtotal, delivery fee (free over ₹199)
  and coupon discount client-side; against the API these are re-derived and
  clamped server-side. `simulateRiderAssignment()` is a demo backdoor that stands
  in for the future rider app claiming an order (maps to
  `POST /orders/:id/simulate-rider`). The seeded demo rider matches the one in
  `apps/parag-api/schema.sql`.
- **`coupons.ts`** - validation runs against a small local catalog so checkout
  works offline; live, `applyCoupon()` posts to `POST /coupons/validate` and the
  server value is authoritative (the client discount is only a hint).
- **`subscriptions.ts`** - pure functions (`subscriptionDeliversOn`,
  `deliveriesForDay`) drive real per-day delivery counts. `reconcileWithBalance()`
  auto-pauses a subscription the wallet can no longer fund and resumes it when
  funded again; live, the API owns this reconciliation and nightly order
  generation.
- **`walletApi.ts`** - `rechargeWallet()` is a **placeholder credit**: it adds the
  amount plus its bonus tier and appends a ledger row with no real charge. Replace
  with a real payment gateway server-side (see `BACKEND_SETUP.md`). Autopay is a
  placeholder UPI mandate.
- **`profileApi.ts`** - offline, a picked photo's local URI is stored as the
  avatar; live, upload the bytes to S3 under `avatars/<uid>` and store the returned
  URL. `deleteMyAccount()` clears the user's local `parag:*` keys and signs out
  (maps to `DELETE /users/me`); an in-app delete path is required by the app
  stores.
- **`location.ts`** - asks for GPS permission and returns the best-known
  coordinate (live GPS, else the most recent saved-address coordinate, else the
  Lucknow default region). No paid maps SDK.

## 4. Auth flow summary

Signed-out entry is phone OTP (`app/(auth)/otp.tsx`). Today: any 10-digit number
+ `123456` signs in via `session.ts`. A phone-only account has no name/email
until the user completes their profile (`app/complete-profile.tsx`). Live: the
same screen calls `POST /auth/otp/request` then `/auth/otp/verify`, stores the JWT
pair in `expo-secure-store` (via `apiClient`), and loads `GET /users/me`.
