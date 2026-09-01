# PYAAS Plus — server-side membership (1.0.1 groundwork) · 26 Aug 2026

**Status: built, tested, committed — NOT pushed, NOT merged, NOT deployed.**
Backend work only; the app still ships the "joining opens soon" gate (build 8) until
this deploys and the app is wired (build 9 / 1.0.1, after Apple approves 1.0).

| | |
|---|---|
| Where | worktree `~/Documents/parag-saathi-be-plus`, branch `feature/plus-membership` |
| Base | `7f90667` = origin/release/26.07.03 (the Render-DEPLOYED branch — ships independently of the CRM branch) |
| Commit | `703dbc9` — 11 files, +1364/−15, all under `internal/modules/consumer/` |
| Tests | full suite `go test ./...` **13/13 packages green**; 14 new unit tests + Mongo E2E `TestMembershipIntegration` PASS |
| Main checkout | `~/Documents/parag-saathi-be` untouched (still on feature/crm-welcome-litre) |

## What it does

- **POST `/membership/join`** (alias `/membership/purchase`): ₹99 from the wallet via the
  existing exactly-once debit gate (ref `PLUS-<consumer_id>-<period-start-date>`), 30-day
  membership. Idempotent: double-tap / same-UTC-day replay returns the live row with
  `charged:false`; early renew EXTENDS from period end; crash-after-debit resumes without
  double charge. Insufficient balance → 422 `INSUFFICIENT_FUNDS` (maps to the app's
  recharge flow). Review account 9999900000 covered by its ₹500 floor (pinned by test).
- **GET `/membership`** (alias `/membership/me`) and **GET `/me` → `membership` +
  `membership_tier`** — reinstall/device-switch hydration in the call the app already makes.
- **POST `/membership/cancel`**: immediate (status=cancelled, period end stamped to now,
  no refund), idempotent — the app's cancel-means-cancel.
- **Member pricing is now in the server price authority** (the piece that makes ₹99 real):
  milk + super_tea × 0.90 rounded (exactly `lib/vip.ts memberLinePrice`), applied in
  `createOrder`, the subscription worker (insert/refresh/midnight-lock affordability), and
  store-adjust re-bills; fail-closed to regular price. **Delivery fee waived** for active
  members at any subtotal (`deliveryFeeFor`); monsoon surcharge intentionally not waived
  (matches the app). One membership row per shopper with an append-only transition log.

## Decisions a human must confirm before deploy

1. **Member-price source**: server computes milk-family × 0.9 over the live catalog price
   index (ERP-synced) — member price tracks ERP price changes automatically. Confirm vs.
   fixed member price points in Dolibarr.
2. Subscription orders re-derive member price at midnight lock — a lapsed membership
   silently returns lines to MRP next lock. Notification wanted?
3. Store-adjust: a member whose membership lapsed between placement and adjustment gets
   the ₹15 fee back (same-rules-as-creation). Also: adjusted SUBSCRIPTION orders now keep
   fee 0 (previously could gain a fee — likely a pre-existing bug, fixed in passing).
4. Charge-day boundary is **UTC** (mirrors the app's ref arithmetic) → flips 05:30 IST.
5. Join debit rides `service.debit` unchanged → ledger row shows `ref_type:"order"`,
   remark "PYAAS Plus membership". Flag if reporting needs a distinct ref_type.
6. Two reconciliation-visible residual windows (never overcharges): crash between gate
   insert and balance move under-collects; crash-then-retry across UTC midnight can
   strand the prior day's debit (`PLUS-…` refs with no matching period).
7. No env flag: routes are new (shipped apps never call them) and pricing can't activate
   until someone joins — structurally inert, full suite untouched.

## Ship path

1. Review the branch: `git -C ~/Documents/parag-saathi-be-plus log -p release/26.07.03..`
2. Answer the decisions above (founder where money-visible).
3. Push + merge `feature/plus-membership` → `release/26.07.03` (Render auto-deploys).
4. App side (build 9 / 1.0.1, AFTER Apple approves 1.0): point `lib/vip.ts
   purchaseMembership` at POST /membership/join (the TODO(api) path already matches),
   hydrate `isPlusActive` from GET /me in backend mode, remove the "opens soon" gate,
   map 422 INSUFFICIENT_FUNDS onto the existing recharge-resume flow, re-test, ship.
