# Instant delivery + the free-pack funnel

How the PYAAS consumer app does Country-Delight-style checkout: a **Morning | ⚡Instant**
delivery model with a hard 20-minute promise, and a "2 free mornings of milk" welcome
funnel that is really a subscription engine. Every claim below is from the code — file
paths are relative to this repo unless prefixed `BE:` (which means
`parag-saathi-be/internal/modules/consumer`).

---

## 1. The Morning | ⚡Instant model

### One shared mode, app-wide

`lib/deliveryMode.ts` is the single source of truth — a module-level store (no zustand)
with `useSyncExternalStore` so the hook and the imperative getter always agree:

```ts
export type DeliveryMode = 'instant' | 'morning' | 'scheduled';   // default: 'morning'
export const INSTANT_ETA_MINUTES = 20;                            // the whole promise
export const MORNING_WINDOW = '05:00-07:30';                      // morning/scheduled wire window
```

- `'instant'` → one-off order, ~20 min from placing (lane `instant`)
- `'morning'` → the classic 5–7:30 AM slot (lane `morning`)
- `'scheduled'` → a picked date, delivered in **that day's** morning slot (still lane `morning`)

`instantEtaHHMM(from?)` = now + 20 min as local `"HH:MM"`; `hhmmTo12` renders it
(`"18:30"` → `"6:30 PM"`, null on garbage so callers can hide instead of showing junk).

### What each mode changes

**Home (`app/(tabs)/index.tsx`)** — the `DeliveryModeToggle` segmented control sits at
the very top of the feed. Morning carries the "5–7:30 AM" sub-label; Instant carries the
`⚡ 20 मिनट/20 min` mini-badge (note: badge `lineHeight: 13` at `fontSize: 8.5` is
deliberate — Devanagari matras in "मिनट" clip on Android under a tighter line box).
Toggling writes the shared store, so the product page follows. Mode `'scheduled'`
(set elsewhere) renders on home as Morning (`instant = mode === 'instant'`).

| Surface | Morning | Instant |
|---|---|---|
| Promise banner | "Order by 9 PM, at your door by 7 AM" | hidden |
| Calendar strip | `DeliveryStrip` (7-day) | swapped for an "Arrives in ~20 minutes · at your door by `hhmmTo12(instantEtaHHMM())` ?? 'the next slot'" ⚡ banner |
| Track strip | only **non-instant** active orders | only **truly-instant** orders |
| Product card CTA (`ProductCard` via `FlipCard` front on the Most-ordered shelf, favorites, grid) | `ADD` | `ORDER NOW` |

The Track strip's lane split is `isInstantOrder`:
`o.lane === 'instant' && (o.delivery_window ?? '').toLowerCase().startsWith('by ')` —
lane **and** window shape must both say instant, because legacy rows carried a lane
default and must stay in the Morning world (otherwise a scheduled order's tracker bleeds
into the Instant view and reads as "I never placed an instant order?!"). One active
order → deep-link to `/order/{id}`; several → `/(tabs)/orders`.

The Most-ordered shelf wraps each `ProductCard` in a `FlipCard` (staggered by index)
that auto-flips to `PackBack` (nutrition / ingredients / FSSAI); grid and list cards
stay static for perf.

**Product / checkout (`app/product/[id].tsx`)** — no cart; Proceed places the order.

- `deliverBy` is **seeded from the shared mode** (`useDeliveryMode()`), and picking a
  lane calls `setDeliveryMode(...)` back, so the home strip stays in sync.
- The lane picker (Instant `~20 min ⚡` · Morning slot `5–7:30 AM` · Pick a date, with a
  7-day chip calendar) only renders for **one-time** orders (`freq === 'one_time'`).
  Subscriptions always ride the morning route — instant is one-time-only, and
  `placeOrder` re-guards this (below).
- Landing date: instant → `todayISO()`; morning → `tomorrowISO()`; scheduled → the
  picked date (min tomorrow).
- Payment: subscriptions are **wallet-only**; a one-time instant order may be
  **Cash on Delivery** (`payMethod`); `effectiveMethod` forces `'wallet'` for
  subscriptions regardless of state.
- Wallet gate: only in **local mode** and only for non-COD (`!isBackendConfigured() &&
  bal < total`). With a backend the wallet is debited **on delivery**, so no upfront
  funds are needed to place.
- Optional GSTIN: validated against
  `/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/`; partial/malformed input is dropped,
  never printed on the proforma.
- Op ordering in backend mode: resolve address → `placeOrder` → then record the local
  subscription (non-fatal), so a bail-out never leaves an orphan subscription and a
  failed order surfaces instead of a false "confirmed".

### The wire (`lib/api.ts` → `placeOrder`)

```ts
const lane = params.lane === 'instant'
  && (params.orderType ?? 'instant') !== 'subscription' ? 'instant' : 'morning';
const delivery_window = lane === 'instant' ? `by ${instantEtaHHMM(placedAt)}` : MORNING_WINDOW;
// ...
priority:      lane === 'instant' ? 'high' : params.priority ?? 'normal',
delivery_window, lane,
delivery_date: lane === 'instant' ? null : params.deliveryDate ?? null,
etaAt:         lane === 'instant' ? placedAt + 20min (ISO) : null,
```

Backend mode: `POST /orders` with the whole order body plus `consumer_name`, `phone`,
`geo` (from the address, when it has coords) — the server **owns** the order and debits
on delivery, so no local debit. Local mode: insert into localStore and debit the wallet
immediately for wallet/prepaid.

### Backend contract (`BE:orders.go`)

- **Lane validation is morning-default**: `if lane != "instant" { lane = "morning" }` —
  an unknown value must never accidentally mint an instant ETA.
- Money is recomputed server-side (`total = subtotal + deliveryFeeFor(subtotal)`); the
  client `total` is **ignored**. Fee policy is identical on both sides: ₹15, free ≥ ₹199.
  Caps: qty ≤ 10 per product, ≤ 30 units per order.
- `GET /orders` is scoped to the token's shopper — the FE's `?user_id=` query is ignored.
- After insert, `createDeliveryForOrder` makes the last-mile task (best-effort — an
  order is never blocked if task creation fails).

---

## 2. The 20-minute promise, end to end

    Consumer taps Proceed (Instant lane)
      │ FE mints delivery_window = "by HH:MM" (placed + 20)
      │ FE mints etaAt = placed + 20 min          ← only used in local mode
      ▼
    POST /api/v1/consumer/orders          BE:orders.go createOrder
      │ lane validated (morning-default), money recomputed, status "placed"
      ▼
    createDeliveryForOrder                BE:delivery_svc.go
      │ nearest Parag Store (haversine), task EtaAt = order.PlacedAt + 20 min
      │   — anchored to PLACED-AT, not task-creation time, so a backfilled
      │     task keeps the customer's original promise
      ▼
    Store manager assigns nearest rider → accept → pickup → deliver
      (consumer order synced at each step; tracking screen polls every 10 s)

**Who mints what**

| Artifact | Minted by | Value |
|---|---|---|
| `delivery_window` `"by HH:MM"` | FE `placeOrder` | placed + 20 min, local clock |
| Order `etaAt` (local mode only) | FE `placeOrder` | placed + 20 min, ISO |
| Delivery-task `eta_at` | BE `createDeliveryForOrder` | `order.PlacedAt + 20 * time.Minute`, RFC3339 |

**ETA display fallbacks (`app/order/[id].tsx`)** — the tracking screen decides
instant-ness by `order.lane === 'instant' || delivery_window.startsWith('by ')` and
renders the big "Arriving by HH:MM · ⚡ INSTANT" hero from `instantEtaOf`:

1. server `etaAt` (either casing — `eta_at` tolerated on the wire), if it parses;
2. else `placed_at + 20 min`;
3. else (nothing parses) `null` → the hero is **hidden**, never "Arriving by Invalid Date".

Morning orders keep the window strip: `formatWindowEnd("05:00-07:30")` → "Arriving by
7:30 AM"; malformed/blank window → hidden. Both heroes hide once delivered/cancelled.
COD orders get "Cash on delivery · keep the amount ready" as the sub-line in both.

---

## 3. How the store manager assigns (nearest-first)

Order placed → `BE:delivery_svc.go createDeliveryForOrder` routes the task to the
**nearest active STORE org** (`nearestStore`, haversine over org geo; the drop point is
the order's `geo`, falling back to the store centre). The task lands with
`Status: "ASSIGNED"` but `RiderPartyID: ""` — i.e. queued at the store, **unassigned
until the store manager assigns a rider**. `Slot` mirrors `delivery_window`, `Lane`
mirrors the order lane, `DistanceKm` is store→drop.

All three store routes are **store-manager-only** (`BE:module.go`): Saathi operator JWT
+ `RequireRoles(domain.RoleStoreManager)`, and every service call re-checks
`assertStore` — the actor's active `STORE_MANAGER` role assignment must be *this* store
(`storeForActor`), else 403 "you do not manage this store".

- `GET /stores/{storeId}/orders` — the queue. Also runs `backfillMissingDeliveries`:
  any still-open order without a task gets one (idempotent — one delivery per order),
  so no order is ever invisible to the store.
- `GET /stores/{storeId}/riders?delivery_id=…` — the assign sheet. The instant lane
  reuses the **same rider pool** that runs the morning subscription round. Each rider's
  position = the freshest `last_known_geo` across their own tasks (their live GPS
  trail), falling back to the store centre for riders who haven't moved yet. A store
  with **no geo** is staged *at the drop point* (distance 0) rather than ranking idle
  riders from (0,0) — thousands of phantom km. Distance is rider→drop; the list is
  sorted **nearest-first, ties broken by lighter current workload** so instant orders
  spread across free riders. Each row carries `WithinTierKm` — the smallest
  15/30/60 km band (`riderTiersKm`), 0 = beyond 60 km.
- `POST /stores/{storeId}/orders/{deliveryId}/assign {rider_party_id}` — `assignRider`.
  The delivery must belong to this store; the rider must be on the store roster.
  **The km tiers only rank/suggest — they never block**: beyond 60 km the fallback is
  the whole store roster (the store owns the delivery). Guarded update: only from
  status `ASSIGNED` or `FAILED`.

Rider lifecycle (rider-only routes, `RequireRoles(RoleDeliveryRider)`):
`accept` → `pickup` (flips the consumer order to `out_for_delivery` + attaches the
rider card) → `location` pings (consumer sees the rider move) → `deliver` or `fail`.
`deliver` is THE money event: requires proof photo + geotag + `geofence_ok`, debits the
consumer wallet **before** flipping status (PREPAID only, ref `delivery:<orderID>` —
shared with the consumer app's settle sweep so neither can double-charge), idempotent by
`event_id`.

---

## 4. The free-pack funnel (`lib/freePack.ts` + `components/ClaimPackFlow.tsx`)

"FREE 500 ml daily pack for 2 days" — the marketing gimmick is really a subscription
funnel. Claiming does **three** things (`doClaimFreePack`):

1. **₹58 promo credit** — `FREE_PACK_VALUE = FREE_PACK_DAILY_PRICE × FREE_PACK_DAYS`
   (2 × ₹29; the daily price reads the live `taaza-500ml` catalog price, falling back
   to ₹29 if the SKU moves). Granted via `addPromoCredit` with
   `ref_id = free_pack_2day:<phone>` — **idempotent per phone**.
2. **Auto-starts a DAILY `taaza-500ml` subscription** from tomorrow. Days 1–2 ride the
   promo; from day 3 the wallet pays ₹29/day and it **continues until paused/cancelled**.
   An existing non-cancelled daily sub for the SKU is reused (never doubles the milk);
   a paused one is `reactivateSubscription`d with a fresh start date so "your
   subscription is LIVE" is never reported over a sub that would deliver nothing.
   Sub-creation failure is non-fatal — the promo credit stands.
3. **Test-mode only** (`EXPO_PUBLIC_WALLET_TEST_TOPUP === 'true'`): ₹200 wallet top-up
   (ref `free_pack_topup:<phone>`) so the day-3 charge demonstrably succeeds. In
   backend mode this uses `testTopup` (server, dev-gated); a backend-mode failure is
   left alone (a local row would be invisible money next to the server wallet).

**Op ordering is the safety property**: the promo credit lands (or is durably parked —
§6) *before* the claim row is written. A hard failure throws before the claim row, so a
failed claim **stays claimable** instead of burning the one-per-device gate with no
money behind it.

### Exactly-once: three anti-abuse layers

1. **Per phone** — `addPromoCredit` is idempotent on `free_pack_2day:<phone>`, and the
   device-global claims table rejects a second claim by the same (normalized, last-10-
   digit) phone.
2. **Per device** — the `free_pack_claims` table is stored device-global
   (`ownerId = 'device'`, shared across every account on the device);
   `MAX_CLAIMS_PER_DEVICE = 1`, keyed on a device id persisted in SecureStore. Switching
   numbers on the same phone mints nothing.
3. **Server (the hard gate)** — `POST /wallet/promo` inserts a unique
   `(consumer, ref, type)` ledger row FIRST (`BE:service.go promoCredit` /
   `insertWalletTxnGate`); a duplicate returns the current balance with **no second
   `$inc`**. Local storage can be reinstalled away; the server's ref-uniqueness stands.
   (`TODO(api)` in freePack.ts: a dedicated `POST /free-pack/claim` with a device
   fingerprint is the planned upgrade.)

Concurrency: `claimFreePack` holds a **module-level in-flight promise latch**
(`claimInFlight`) — a double-tap, or the flow mounted on several screens at once, shares
one claim; the single JS thread makes this a complete guard against the check-then-act
race over AsyncStorage. `ClaimPackFlow.confirm()` adds a synchronous `busyRef` guard on
top (setState-based disabling only lands after a re-render).

### The flow UI (`ClaimPackFlow`)

Steps: `intro → address → confirm → done`, with two off-ramps — `signin` (no signed-in
phone: the claim is per phone number; never show the delivery promise) and `ineligible`
(gate rejected: show the gate's `reason`, promise nothing). `'done'` is reached **only**
on a real successful claim. The address step (typed, or GPS via `getDeviceCoords`)
creates a default Home address through the normal `addAddress` seam — which is exactly
the address the sweep later needs. The done/confirm copy is the honest funnel explainer:
"from day 3 your subscription continues at ₹29/day from your wallet · pause anytime".

### Claim card vs boot modal vs "Maybe later"

Two triggers share the machinery:

- **Boot modal** (`ClaimPackGate`, mounted at launch): shows once per session while
  `shouldShowFreePack(phone)` — i.e. not permanently dismissed (`free_pack_seen`), not
  currently snoozed (`free_pack_snooze`), and still `freePackEligible`.
- **Home claim card** (pink gradient, `app/(tabs)/index.tsx`): shows while
  `freePackEligible(phone)` — **eligibility only, snooze-blind** — so the selling point
  stays visible on home even after "Maybe later" dismissed the popup.

**Maybe later / ✕ = snooze, not death**: `snoozeFreePack()` re-offers next session
(`SNOOZE_HOURS = 6`), up to `MAX_SNOOZES = 3` soft dismissals, after which `markSeen()`
stops the popup nagging permanently (the home card still shows while eligible). A
successful claim calls `markSeen()` internally, so a claimed pack never re-offers.

Because the boot modal can claim while the home tab stays focused (no focus change →
no focus-based recheck), `onFreePackChanged` listeners let the home card hide the moment
ANY path claims. `SubscriptionStatusCard` sits under the claim card: with the claim card
up it stays quiet unless a sub exists (`showEmpty={!claimEligible}`); its empty state
("No active subscription — claim your free pack") routes into the same flow via
`onClaim`. Active subs sort newest-first so the free-pack auto-subscription leads the
card.

---

## 5. Day-3 charges: the subscription sweep (`lib/subscriptionSweep.ts`)

Subscriptions on their own are only a cadence model — the client-side sweep is what
turns today's due subscriptions into **real orders** so milk ships and money moves.
Runs on app launch + every home focus (wired in `app/(tabs)/index.tsx`'s
`useFocusEffect`), behind its own module-level mutex, always error-soft.

    sweepDueSubscriptions()                    (at most one at a time)
      ├─ signed out → 0
      ├─ due = active subs where subscriptionDueOn(sub, TODAY, vacations)
      │        (TODAY only — no historical catch-up)
      ├─ drop subs with a marker  ref = sub_order:<subId>:<YYYY-MM-DD>
      │        (markers pruned after 30 days — they can never match again)
      ├─ no address → skip quietly (retry once the member adds one)
      ├─ for each pending sub:
      │    cost = unit_price × qty + deliveryFeeFor(subtotal)
      │    balance < cost → SKIP (never place milk that can't be paid for)
      │    placeOrder({ lane: 'morning', paymentMethod: 'wallet',
      │                 priority: 'normal', orderType: 'subscription' })
      │    marker AFTER the order lands  → failed placement = no marker = retried;
      │                                    placed order can never repeat for the day
      │    balance -= cost               → a multi-sub sweep never over-commits
      └─ any skip-for-short → reconcileWithBalance(balance)  → auto-pause

The **debit** rides the existing delivered-order path: `settleDeliveredOrders` →
`debitWallet(total, 'delivery', orderId)`, idempotent by `delivery:<orderId>` and
**rewards/promo-first** on both sides — so the ₹58 promo naturally covers the 2 free
days and day 3 onward charges cash. (Local mode debits immediately at `placeOrder`,
same promo-first ledger.) When the sweep places anything, home re-pulls the wallet and
the order strip so the new delivery shows immediately.

**Insufficient wallet pauses** (`lib/subscriptions.ts reconcileWithBalance`): an active
sub the balance can't fund is auto-paused, its id remembered in an AsyncStorage
"we-paused-this" set; once funded again it auto-resumes. **User-paused subscriptions
are never touched.** The paused state lights up the home low-balance nudge ("Top up so
tomorrow's delivery is not paused", threshold `LOW_BALANCE_THRESHOLD = 200` in
`lib/pricing.ts`).

---

## 6. Wallet promo plumbing (`lib/walletApi.ts` ↔ `BE: POST /wallet/promo`)

`addPromoCredit(amount, { ref_id, remark })` is **server-first** in backend mode: the
app displays the SERVER wallet, so a local-only promo row would be invisible money that
also trips the auto-pause. Behavior:

- **Server reachable** → `POST /wallet/promo { amount, ref, remark }`; the server
  credits the REWARDS bucket exactly-once by ref (unique ledger row inserted first;
  dup → current balance, no second credit). Amount clamped 1–5000; ref required;
  **dev-gated** (`OTPDevMode`) until a server-side campaign registry decides
  eligibility.
- **Offline / 5xx** → the credit is **durably parked** in the local `pending_promos`
  table (`recordPendingPromo`, idempotent by ref — NOT written to the local ledger).
  If even the parking write throws, the error propagates so the caller (the claim)
  knows the credit landed nowhere — and the claim row is never written.
- **Replay** → `replayPendingPromos()` runs on every wallet refresh
  (`store/wallet.ts refresh`); each parked row is re-POSTed and removed **only once the
  server accepts it**. The server's exactly-once-by-ref means replays can never
  double-credit.
- **Local mode** → a `reward`/`promo` row in the on-device append-only ledger,
  idempotent by `ref_id` (`hasEntryFor`).

Spending is **promo-first** everywhere: local `debitWallet` takes
`min(amount, promo)` from promo then cash; the server debit is rewards-first too.

---

## 7. Edge-case behavior

- **Cancelled order fails its task** (`BE:orders.go cancelOrder`): cancel is atomic on
  `status ∈ {placed, confirmed}`; it then flips the order's live delivery task to
  `FAILED` ("Order cancelled by the customer"), guarded `$nin [DELIVERED, FAILED]` —
  otherwise a rider could still deliver it, debit the wallet, and flip the order back
  to delivered. Belt-and-braces on the other side: `deliverDelivery` re-checks the
  parent order and **refuses** (409 `ORDER_CANCELLED`, task marked FAILED) if it was
  cancelled — a stale task must never debit money or resurrect a cancelled order.
- **Insufficient wallet** — three distinct behaviors:
  - *Sweep*: the order is **not placed**; `reconcileWithBalance` auto-pauses the sub;
    home shows the low-balance nudge. Auto-resume when topped up.
  - *Rider deliver*: the server debit fails closed; `INSUFFICIENT_FUNDS` surfaces to
    the rider app; the delivery does not complete.
  - *Consumer settle sweep* (`settleDeliveredOrders`): a shortfall on a delivered order
    tries the Paytm AutoPay mandate (`autoSettleTopUp`, idempotent end-to-end: execution
    keyed by `order:<id>`, credit keyed by execution id), then retries the debit; still
    short → the id stays unsettled and retries on the next load / top-up.
- **Offline promo replay**: see §6 — parked in `pending_promos`, replayed on every
  wallet refresh, exactly-once by ref server-side.
- **Failed claim never burns the gate**: promo-credit-then-claim-row ordering (§4).
- **Double-tap / multi-mount claim**: promise-latch mutex + `busyRef` (§4). Same
  pattern guards the sweep (`sweeping`) against launch+focus firing in one tick.
- **Order strip poll teardown**: the tracking screen polls every 10 s but stops the tick
  on blur/unmount so an in-flight poll never setStates on a dead screen.

---

## 8. Wire quirks

- **`etaAt` never comes back from the backend.** The FE sends `etaAt` on
  `POST /orders`, but `BE:orders.go`'s `order` struct has no ETA field — the server
  ETA lives on the **delivery task** (`eta_at`), which the consumer never fetches. So
  in backend mode the tracking hero always uses the `placed_at + 20 min` fallback.
  This is why `instantEtaOf` tolerates both `etaAt` and `eta_at` casings *and* has the
  fallback: the wire may grow the field later without an app update.
- **Instant-ness is double-keyed.** Both the home strip and the tracking screen refuse
  to trust `lane` alone (legacy rows carried lane defaults); the `'by HH:MM'`
  window shape is the second key. Home requires **both** (AND); tracking accepts
  **either** (OR) — home errs toward the Morning world, tracking errs toward showing
  the instant hero.
- **`order_type` / `delivery_date` / `buyer_gstin` / `eta` are FE-owned fields** — the
  backend `orderInput` doesn't parse them, so they round-trip only in local mode.
  Scheduled ("pick a date") ordering is a client-side concept on the wire today: the
  backend just sees lane `morning` + the `05:00-07:30` window.
- **Client `total` is ignored server-side** — money is recomputed from item lines
  (unit prices still client-supplied pending a server catalogue; a coupon discount is
  therefore not applied server-side yet: total = gross).
- **Two "morning window" strings exist.** The wire window is `MORNING_WINDOW =
  '05:00-07:30'` (deliveryMode.ts, stamped by `placeOrder`); `ClaimPackFlow` has its
  own display-only `DELIVERY_WINDOW = '06:00-07:00'` for the "first pack arrives"
  promise copy. They are not the same string — only the former ever hits the wire.
- **Stale "90 min" comments** — fixed (backend + toggle docstrings now read 20 min).
  the `⚡ 20 मिनट/20 min` badge) is 20 minutes everywhere.
- **`GET /orders?user_id=` is decoration** — the backend scopes to the token and
  ignores the query param.
- **Instant forces `priority: 'high'`** on the wire (FE-minted); the backend defaults
  a blank priority to `'normal'` but does not otherwise validate it.

---

## 9. Env / config

App env (all `EXPO_PUBLIC_*`, template in `.env.example`; restart Metro with `-c` after edits):

| Var | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL` | Go backend base URL. **Empty = local mode** (on-device localStore; wallet gate at checkout, immediate debits, simulate-rider buttons). Set = backend owns orders/wallet/deliveries. |
| `EXPO_PUBLIC_CONSUMER_APP_KEY` | App-key header gating the consumer bridge (ships in the bundle; not a true secret). |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | Razorpay **public** key_id for wallet top-ups (use a `rzp_test_` key in dev; secret lives server-side). |
| `EXPO_PUBLIC_WALLET_TEST_TOPUP` | `'true'` → "Add money" credits directly with no PSP **and** the free-pack claim adds its ₹200 test top-up. Requires backend `OTP_DEV_MODE`. Off in production. |
| `EXPO_PUBLIC_CARE_PHONE` / `EXPO_PUBLIC_CARE_WHATSAPP` | Customer-care lines (single source `lib/support.ts`; placeholders in code until the founder supplies real numbers). |

Backend flags/constants that shape this feature:

| Where | Value | Meaning |
|---|---|---|
| BE config `OTP_DEV_MODE` | bool | Gates `POST /wallet/promo`, `POST /wallet/topup`, `POST /orders/{id}/advance` (dev echo of OTPs too). **In prod these are 403** — the free-pack promo needs the planned campaign-registry replacement before flipping this off. |
| `BE:delivery.go riderTiersKm` | `{15, 30, 60}` km | Rank-only rider distance tiers on the assign sheet. |
| `BE:orders.go` | fee ₹15, free ≥ ₹199, qty ≤ 10, units ≤ 30 | Order money policy (mirrored in `lib/api.ts` / `lib/pricing.ts`). |

Code constants (single sources):

| Constant | File | Value |
|---|---|---|
| `INSTANT_ETA_MINUTES` | `lib/deliveryMode.ts` | 20 |
| `MORNING_WINDOW` | `lib/deliveryMode.ts` | `05:00-07:30` |
| `FREE_PACK_PRODUCT_ID` / `FREE_PACK_DAYS` / `FREE_PACK_VALUE` | `lib/freePack.ts` | `taaza-500ml` / 2 / ₹58 (2 × catalog price, fallback ₹29) |
| `MAX_CLAIMS_PER_DEVICE` / `MAX_SNOOZES` / `SNOOZE_HOURS` | `lib/freePack.ts` | 1 / 3 / 6 |
| `MARKER_KEEP_DAYS` | `lib/subscriptionSweep.ts` | 30 |
| `LOW_BALANCE_THRESHOLD` | `lib/pricing.ts` | ₹200 |
