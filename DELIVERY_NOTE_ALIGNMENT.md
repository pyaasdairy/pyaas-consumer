# Consumer app ↔ Saathi Delivery Note — alignment map

Maps `Saathi_Delivery_Note.pdf` (v0.1, 9 Jul 2026) to the PARAG **consumer** app.
The note describes one platform (Pyaas Consumer + Pyaas Saathi + backend); the
**Saathi ops/rider/store + nightly-manifest backend is built separately**. This
file records what is aligned **in the consumer client** vs what depends on that
backend.

Legend: ✅ aligned in-app · 🟡 partial / copy-aligned · ⛔ needs Saathi backend.

## Model posture (§1–4)
- ✅ **Not quick-commerce.** Daily-morning, subscription-first framing throughout;
  no "10-minute" wording. Delivery-promise + cutoff banners on home & product.
- ✅ **Prepaid wallet, debit-on-delivery framing.** Product detail says "Charged
  after delivery"; order status now reads "Delivered. Your wallet was charged on
  delivery." Free-money sign-in seed removed; money only enters via Razorpay or
  the one legit free-pack credit.
- 🟡 **Nightly cutoff.** Copy aligned to the note's ~21:00 cutoff / ~7 AM window
  ("Order by 9 PM, at your door by 7 AM") on home, product banner, date picker,
  subscription preview. ⛔ The actual freeze/immutability enforcement is a
  backend job.

## Subscriptions & the demand model (§7, Appendix B)
- ✅ **due() with pauses & skips.** `subscriptionDueOn(sub, iso, vacations)` in
  `lib/subscriptions.ts`: cadence-match ∧ within [start,end] ∧ not in any pause
  range ∧ not skipped (a skip is a one-day vacation).
- ✅ **Rolling calendar preview** (do-not-materialise-the-future): new
  `upcomingDeliveries(subs, vacations, from, days)` evaluated on the fly; surfaced
  as "Upcoming deliveries" on the subscriptions screen.
- ✅ Cadences daily / alternate / weekly / one-time; pause (range, via vacations)
  and skip. Modifications editable until cutoff.
- 🟡 **CUSTOM (every-N-days) + WEEKLY-weekday-subset** exist in the type but the
  creation UI offers Daily/Alternate/One-time only, and CUSTOM currently falls
  back to daily. Extend `createSubscription` UI + `subscriptionDeliversOn` for
  full Appendix-B cadence coverage.
- ⛔ Server-side materialisation into `DELIVERY_ORDER`s at cutoff, per-store.

## Wallet & money (§12, §16, Appendix D)
- ✅ Append-only ledger with running balance (`lib/walletApi.ts`), cash vs promo
  buckets, refunds/rewards, low-balance flag, PDF statement.
- ✅ **Top-up via Razorpay** (WebView Standard Checkout, `lib/razorpay.ts`),
  credited only after payment; idempotent on `razorpay_payment_id`.
- ✅ Auto-recharge UI (`app/autopay.tsx`) — threshold + amount (UPI Autopay
  framing). Low-balance nudges on wallet, home, subscriptions.
- ⛔ **Exactly-once debit ON the DELIVERY_EVENT** (`event_id`-keyed), UPI Autopay
  mandate execution, gateway webhook verification, negative-balance floor policy.
  Backend contract written in `RAZORPAY_WALLET_BACKEND.md`; today the app debits
  at order placement (one-time) / on delivery (subscriptions) locally.

## Live tracking & delivery states (§11, §13, §14)
- 🟡 Order-status copy aligned to the note's consumer states (Scheduled → Out for
  delivery → On the way → Delivered) with an in-app tracking screen + stepper.
- ⛔ **Real-time rider dot + ETA** over WebSocket/MQTT, scoped fan-out to the
  consumer's own stop, geofence "At your door", honest last-known+timestamp.
  Needs the realtime subsystem + rider app.

## Serviceability & catalogue (§6, §7)
- ⛔ **Store-scoped catalogue/price** (`STORE_PRICE`), address → exactly one
  **serving store** via service polygons (PostGIS), "not yet serviceable"
  waitlist, society/cluster multi-drop. The app ships one global catalogue today;
  this is backend + ops-data work.

## Identifiers, reliability, compliance (§15, §16, §17, Appendix A)
- ✅ Closed-loop wallet (no cash-out/P2P), tokenised checkout, location used only
  for the user's own delivery address (permission-gated), PII not shared.
- ⛔ `client_op_id` idempotency on writes, `DO/MF/RT/IND` identifier formats,
  offline "delivered (syncing)", end-of-day reconciliation — backend.

## Suggested next consumer-app steps (client-only, no backend)
1. Full Appendix-B cadences in the New-subscription UI (weekly weekday picker,
   custom every-N) + fix `subscriptionDeliversOn` CUSTOM.
2. A live tracking screen scaffold with the 5 states (Scheduled / Out for
   delivery / Live / At your door / Delivered) reading a status field, ready to
   bind to the realtime feed.
3. Move the one-time debit to the delivery event once the backend emits it.
