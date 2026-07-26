# PARAG / PYAAS ecosystem — co-developer note

_Last updated: 12 Jul 2026 · branch `main` (merged from `Feat/consumer-backend`)_

This note explains **what is running today**, how the pieces talk to each other,
and **how the apps/backends will be merged** into one quick-commerce platform.
Read this before touching anything that crosses an app boundary.

## The three moving parts

| Piece | Repo / path | Stack | Role |
|---|---|---|---|
| **PARAG consumer app** | `pyaasdairy/parag-consumer` (mirror of `Parag-consumer/parag-app-main` here) | Expo RN (SDK 56, expo-router, Hermes) | Shopping, wallet, subscriptions, order tracking, reviews |
| **PARAG Saathi app** | `pyaasdairy/parag-saathi-fe` | Expo RN | Rider: delivery queue, accept → pickup → deliver, proof |
| **Saathi backend** | `pyaasdairy/parag-saathi-be` (`apps/parag-go` here) | Go + MongoDB Atlas | Auth (OTP/JWT/roles) + milk-provenance chain (pours → BMC → batches → QR) |
| **Consumer connector (“bridge”)** | `apps/parag-bridge` here | Node (bare http) + MongoDB | Everything commerce: orders, delivery queue, AutoPay mandates, wishlist leads |

**Rule in force: nothing on the Saathi FE/BE gets changed.** The connector
adapts to their existing wire contracts; that is the whole point of it.

## How an order flows today (verified end to end)

```
consumer app ──POST /orders──▶ bridge :8090 ──▶ shared Atlas cluster
                                   │             (db `saathi`, collection
                                   │              `consumer_orders`)
Saathi app ──GET /api/v1/delivery/tasks──▶ same bridge, Saathi dialect
rider accept → pickup → deliver ──▶ status flows back to the consumer
consumer app polls /orders/:id ──▶ delivered → wallet settles (AutoPay if short)
                                 → review-after-delivery unlocks
```

- **Two wire dialects on one port.** Consumer routes live at `/` (snake_case,
  unwrapped JSON); Saathi routes live at `/api/v1` (`{data}` envelope,
  camelCase, matching `parag-saathi-be`'s contract exactly — see
  `src/core/api/` in the Saathi FE). `server.js` is the single source of truth
  for both projections (`toConsumerJson` / `toDelivery`).
- **Persistence is layered**: in-memory map (serving) → `bridge-data.json`
  snapshot (instant local durability) → **write-through to the shared Atlas
  cluster** (`mongo.js`, best-effort, never blocks a request). Boot hydrates
  from Mongo when reachable. Collections owned by the connector:
  `consumer_orders`, `consumer_mandates`, `consumer_wishlist_leads` — it never
  reads or writes Saathi's own collections.
- **Feature-flag invariant** (do not break this): with `EXPO_PUBLIC_API_URL`
  unset the consumer app runs 100% on-device (lib/localStore); with
  `MONGODB_URI` unset the bridge runs snapshot-only. Every backend feature
  degrades to the previous behaviour.

## Money

- **Wallet** = append-only local ledger (`lib/walletApi.ts`), prepaid, promo
  spent before cash, idempotent debits by ref. Backend orders debit **on
  delivery** (`delivery:<orderId>`), swept from both the Orders list and the
  tracking screen.
- **Razorpay** top-ups use the public `key_id` only; the `key_secret` must live
  server-side (order + signature verification) — never in the app.
- **Paytm UPI AutoPay** (`lib/autopay.ts` + bridge `/autopay/*`): real NPCI
  lifecycle — `PENDING_APPROVAL → ACTIVE (UMN) ⇄ PAUSED → REVOKED`,
  `AS_PRESENTED` recurrence, per-debit cap (₹15,000 NPCI ceiling), executions
  idempotent by ref with pre-debit notice + RRN. If a delivered order finds the
  wallet short and a mandate is ACTIVE, the shortfall is auto-covered
  (idempotent end to end). **Real-money seam:** set `PAYTM_MID` +
  `PAYTM_MERCHANT_KEY` in the bridge `.env` → create/execute route to Paytm PG
  and `/approve` becomes the PG webhook. Until then the bank leg is simulated;
  everything else is the real mechanism.

## Demand capture

Out-of-stock SKUs (currently the four PYAAS partner SKUs) are browsable but
excluded from every order path. Hearting one — or tapping **Notify me** on its
detail page — posts the member's name + phone + SKU to `/wishlist/leads`
(deduped by user+product, counter on repeat taps). Founder reads them at
`GET /wishlist/leads` or straight from `consumer_wishlist_leads`.

## Ports & env (local dev)

| Thing | Where |
|---|---|
| Bridge | `:8090` (`apps/parag-bridge`, `node --env-file=.env server.js`) |
| parag-go (auth/provenance) | `:8080` |
| Consumer Metro | `:8081` (its debug APK's port) |
| Saathi Metro | `:8082` (its debug APK's baked port — don't swap them) |
| Android emu → host | `10.0.2.2:<port>`; iOS sim → `localhost:<port>` |

Secrets live ONLY in gitignored `.env` files (`apps/parag-bridge/.env` holds
the Atlas URI). `.env.example` in each app documents every variable. Run the
secret-guard grep before any push (see git history for the pattern).

## The merge plan — how the apps become one platform

**Phase 1 (done).** Bridge as a standalone connector. Both apps keep their
existing contracts; consumer commerce data lives in its own collections on the
shared cluster. Zero risk to the working Saathi flow.

**Phase 2 (next).** Port the bridge's routes into `parag-saathi-be` (Go),
route-for-route, keeping the wire shapes **byte-compatible** (the projections
in `server.js` are the spec; `MONGO_MIGRATION_SPEC.md` in parag-go describes
its storage conventions). Suggested order: orders + delivery (read the same
`consumer_orders` collection first, then move writes), then wishlist leads,
then AutoPay mandates. After each route lands in Go, flip the apps' base URLs
— no app code changes needed because the contracts don't change. The bridge
stays as the reference implementation + local-dev fallback until parity.

**Phase 3.** One backend, real integrations: real rider assignment (today every
order auto-assigns to the single demo rider party; replace with parag-go role
queries over `role_assignments` where `role_code='DELIVERY_RIDER'`), Paytm PG
credentials for AutoPay, Razorpay order+signature verification server-side,
push (replace the consumer app's 10s tracking poll), and real OTP (MSG91 —
`DEMO_MODE=false`). Consumer auth then moves from the bridge stubs onto
parag-go's `/auth/otp/*` (the app already speaks that shape).

**What NOT to do:** don't fork the wire contracts (both apps must keep working
against either backend during the migration), don't write to Saathi's
collections from the connector, and don't put any secret in app code — the
apps only ever carry `EXPO_PUBLIC_*` values.
