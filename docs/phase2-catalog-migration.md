# Phase 2 — Backend-Authoritative Catalog Migration

**Goal:** make the backend the source of truth for all consumer SKUs (products, names, prices, availability) instead of the hardcoded `constants/products.ts`, by **reusing the same `consumer_catalog` collection where the store manager's added products already land**. All product images (front + back) move to **Backblaze B2** (the presign→PUT→URL seam already exists in the backend and Saathi console).

**Branches:** consumer `feature/consumer-revamp-phase2` · backend `release/26.07.03` (both off the phase-1 tips; `26.07.02` untouched = what's deployed).

**Hard constraint:** must NOT break — sales funnel (2+2), Razorpay/wallet, subscriptions, vacations, cart/checkout, or the Saathi store console. Every step is flag-gated and reversible.

---

## 1. The mechanism we reuse

Store-manager products already persist to the **`consumer_catalog`** Mongo collection as `kind="addition"` docs, written by `POST /consumer/stores/{storeId}/skus` (Saathi `catalog_api.dart:332` → BE `addStoreSku` → `insertAddition`, `catalog.go:768-857`). An **addition is already a full self-describing product** (`SkuID, Name, Category, Variant, Price, PhotoURL, Subscribable, Variants[], Physical, InStock, Hidden`), and `GET /consumer/catalog` (`catalogView`, `catalog.go:685-713`) already projects additions into the `additions[]` array that the app consumes via `toAddition` (`lib/catalog.ts:92-111`).

So: **seed the 48 bundled SKUs into that same collection** and they ride the exact read/render path that already works.

## 2. Target design (smallest change, keep behavior)

1. **Seed all 48 SKUs** from `constants/products.ts` into `consumer_catalog` as a new **`kind="product"`** (global baseline; `store_id="_global"`), projected into `additions[]` on read — **no response-shape change**.
2. **Freeze every SKU id** (`gold-500ml`, `taaza-500ml`, `taaza-1l`, `shakti-*`, `chai-special-500ml`, `dahi-*`, `paneer-1kg`, `pyaas-*`, …). This is what keeps the funnel, subscriptions, and trial gating working (§5).
3. **Keep `constants/products.ts` in the app as the offline / first-paint fallback.** It stops being the source of truth but remains the cold-start render source and a local image fallback. Removing it would blank the storefront offline — do not remove.
4. **Images → Backblaze B2** as the authoritative source: each product carries `photo_url` (front) and, where one exists, `back_photo_url` (back). Bundled `assets/products/*` stay only as the offline fallback map.

## 3. Backend changes (`parag-saathi-be`, `release/26.07.03`) — additive, backwards-compatible

1. **Seed:** `//go:embed products.json` (generated from `constants/products.ts` so there's one source, no drift) → idempotent upsert-by-`sku_id` into `consumer_catalog` with `kind="product"`, run next to `ensureIndexes` (`repo.go:69`). `$setOnInsert` for identity; a `seed_version` bump can update price/copy later. Never overwrites a store override.
2. **Serve:** in `catalogView` (`catalog.go:685-713`) emit `kind="product"` docs into `additions[]` exactly like `kind="addition"` (shared `additionViewFromDoc`), honoring `hidden`. Gate behind env `CONSUMER_CATALOG_SEED_SERVE` (default off).
3. **Field parity:** add optional fields to `additionView` + `catalogDoc` that the FE `Product` has and the current view lacks — `mrp`, `tag`, `rating/ratingCount/mostOrdered/packCount`, `back_photo_url`, and the compliance block (`hsn/gstRate/netQuantity/veg/ingredients/nutrition/allergens/shelfLife/storage/countryOfOrigin/manufacturer/fssaiLicense`). Absent ⇒ FE keeps its category-helper fallbacks. Incremental.
4. **Images in B2:** store `photo_url` + `back_photo_url` on each seeded doc, pointing at B2 view URLs (§6). Reuse the existing presign/upload seam (`StorageApi`, prefix `catalog`) — no new infra.
5. **Store console (later, optional):** once seeded, `storeSkus` (`catalog.go:732-761`) can serve the seeded set as `baseline[]` instead of the 8-row `consumerBaseline`. Non-urgent; console tolerates any length.

**Explicitly out of scope for this migration** (separate later PRs — they touch order/subscription *write* paths the user flagged):
- Real `stock_count` + atomic decrement-on-order + auto out-of-stock.
- Server-side price/stock **validation** in `createOrder` (`orders.go:237-254` trusts client price today — leave it until every id is seeded).

## 4. Frontend changes (`pyaas-consumer`, `feature/consumer-revamp-phase2`) — minimal, flag-gated

Behind `EXPO_PUBLIC_CATALOG_BACKEND_AUTHORITATIVE` (off = today's behavior exactly):

1. **Dedup-by-id merge** in `applyOverlay` (`lib/catalog.ts:119`): when a backend addition's id matches a bundled SKU, treat it as an **override of that bundled row** (take backend name/price/stock/fields; fall back to bundled `image` only if backend has no `photo_url`). ~15 lines. Keeps every call site's contract; no duplicate tiles.
2. **Image resolution precedence** (inside `toAddition`/merge so `image` is resolved before render): `backend photo_url → IMG_BY_ID[id] (bundled fallback) → name-only tile`. Same for back: `back_photo_url → IMG_BACK_BY_ID[id] → none`.
   - `photo_url`/`back_photo_url` from the backend are **paths relative to the API base** (e.g. `catalog/img/taaza.png`), resolved to an absolute URL against `EXPO_PUBLIC_API_URL` before being handed to `<Image>`. A value already starting with `http` is used as-is (store-added B2 SKUs). The resolved URL hits the catalog image proxy (§6) which 302s to B2.
   - Add `IMG_BY_ID`/`IMG_BACK_BY_ID: Record<string, number>` in `products.ts` (re-key the existing `require()`s by SKU id).
   - Rework `backImageFor` (`products.ts:196-213`) off `require()`-identity onto id / `back_photo_url` (currently returns `null` for any `{uri}` → back pager silently vanishes for server SKUs).
3. **Persisted offline cache:** persist the last good `CatalogResponse` to AsyncStorage in `refreshCatalog` (`lib/catalog.ts:284-296`) and hydrate on boot before the first fetch, so backend-only SKUs survive an offline relaunch. ~30 lines (the one genuinely new module).
4. **Repoint 2 direct-bundle category lookups** to the merged store: `coupons.categoryOf` (`lib/coupons.ts:34`) and `invoice.gstFor` (`lib/invoice.ts:89-100`) read `PRODUCTS.find(...)` directly — use `getMergedProduct(id)?.category` with `PRODUCTS.find` as fallback. Two ~2-line edits.
5. **`applySellableGate`/`SELLABLE_IDS`** (`lib/catalog.ts:242-246`): leave as-is initially; delete later once the server marks non-launch SKUs `in_stock:false` (one-line change).

The 20+ other call sites go through `useCatalog`/`getMergedProducts`/`getProduct` → **zero change**.

## 5. Flow-by-flow "won't break" verification

- **2+2 sales funnel — SAFE (ids frozen).** Keys on `FREE_PACK_PRODUCT_ID='gold-500ml'`, `getProduct('gold-500ml')?.price` (`freePack.ts:52-54`), `/^gold-/` chip, BE `HasPrefix(id,"gold-")` (`trial.go:63`). We freeze `gold-*` ids and keep `constants/products.ts` as fallback, so `getProduct` always resolves.
- **Razorpay / wallet — SAFE.** Zero product coupling (amounts + refs only). Only touch point is `FREE_PACK_DAILY_PRICE` via freePack — covered above.
- **Subscriptions — SAFE.** Create snapshots `product_id/variant/unit_price` (`subscriptions.ts:141-154`); BE worker copies stored fields, no catalog re-read. Keep ids resolvable via retained bundle (client sweep `subscriptionSweep.ts:117` does `getProduct(id); if(!p) continue`).
- **Vacations — SAFE.** Keys on `subscription_id` only; no SKU reference.
- **Cart / checkout / order — SAFE.** Snapshot-based writes; `revalidateStock(merged)` re-syncs prices (desired). Do NOT enable server-side price/stock validation this migration. Repoint `coupons.categoryOf` (§4.4).
- **Product page / tiles / images — SAFE with §4.2.** Preserve `baseId/name` (variant grouping), `category` (GST/coupon/dairy gate), `subscribable` (milk CTA) exactly in the seed; hybrid image resolution; back pager degrades gracefully until `back_photo_url`/`IMG_BACK_BY_ID` lands.

## 6. Images → Backblaze B2 (front + back, all SKUs) — DONE

Images are backend-owned (B2), with the app bundle kept only as an offline fallback.

- **What existed:** 33 assets in `assets/products/` — a front shot per product + 4 backs (`taaza-back`, `dahi-back`, `ghee-back`, `chaach-back`). All 33 uploaded to B2 under the `catalog/` prefix (idempotent by SHA1).
- **Private bucket, NOT public.** They live in the existing **allPrivate** `pyaas-saathi-media` bucket (same one as KYC/field photos) under `catalog/`. The bucket type is unchanged — no public bucket was created.
- **Why not a public bucket or a baked signed URL:**
  - The consumer app renders a product photo as `<Image source={{uri}}>` — a plain GET with **no auth header** — so the URL must load unauthenticated.
  - A signed B2 URL baked into the seed would **expire** (download auth ≤ 7 days), so seeded data can't carry one.
- **The approach — a stable public proxy route** (`internal/modules/consumer/catalog_images.go`): `GET /consumer/catalog/img/{file}` is unauthenticated (it has to be) but **hard-scoped to the `catalog/` prefix** at two layers — the handler rejects any nested/rooted name, and the B2 download authorization it mints is itself issued for `catalog/` only. It 302-redirects to a fresh short-lived, prefix-scoped B2 download URL. So the public URL **never expires** (token minted per request) and the route can serve product art and **nothing else** (KYC/`profile/` files return 401 even with the token). Verified: catalog images return `200 image/png`; the same token → `401` on a `profile/` file.
- **The seed stores a STABLE path**, not a URL: `photo_url = "catalog/img/<file>"` (and `back_photo_url` where a back exists), computed in the loader from the asset filename (`catalogImagePath`). The FE resolves it against its API base (§4.2). Env-portable: the same seed works local + prod.
- **Fallback stays:** `IMG_BY_ID`/`IMG_BACK_BY_ID` keep the bundled art for offline/first-paint, so a B2 hiccup or offline launch never blanks a known SKU.

## 7. Effort & verdict

"No need to change much" is **directionally true** for the data path (one merge seam, snapshot-based flows), but two items are real work: **images** (B2 upload + id-keyed resolution) and the **offline cache**. Rough budget:
- Backend: ~1 day (seed + serve + optional-field parity). Backwards-compatible, no route changes.
- Consumer FE: ~1.5–2 days (dedup merge, image resolution + `backImageFor` rework, AsyncStorage cache, 2 repoints).
- Saathi console: ~0 (already round-trips through `/consumer/stores/{id}/skus`).
- Real stock + order validation: separate ~1–2 days, deferred.

## 8. Rollout (flag-gated, bundle stays as fallback throughout)

1. **BE:** seed 48 rows silently (`CONSUMER_CATALOG_SEED_SERVE=false`) — response byte-identical. *Test:* 48 `kind="product"` docs in Mongo, ids exact; app unchanged; console unchanged.
2. **BE:** flip `CONSUMER_CATALOG_SEED_SERVE=true` (staging first) — `GET /consumer/catalog` now returns the 48 as additions.
3. **FE:** ship dedup + image resolution + cache + repoints behind `EXPO_PUBLIC_CATALOG_BACKEND_AUTHORITATIVE` (off = today). *Test on staging:* one tile per line (no dupes), prices/stock from backend, `gold-500ml` funnel + claim works, images crisp (B2 or bundled), store-added B2 SKU renders, offline cold-start renders, coupons/GST scope right.
4. **Prod:** both flags on → smoke all six flows (§5): claim 2+2 → daily `gold-500ml` sub + trial; place order → snapshot + delivery; sweep delivers next morning; vacation add/remove; recharge → offer qualifies.
5. **Later PR:** retire `applySellableGate` (server marks non-launch `in_stock:false`).
6. **Later PR:** real `stock_count` + atomic decrement + server-side order validation — only after every id is seeded.

**Rollback at any step:** flip the env flag off. Every step is additive; nothing strands half-migrated.

---

### Key files
- **BE:** `internal/modules/consumer/catalog.go` (`:49-58` baseline, `:119-139` doc, `:685-713` view, `:768-857` addSku), `trial.go:63`, `orders.go:230-313`, `subscriptions.go:331-372,505-543`, `repo.go:69`.
- **FE:** `lib/catalog.ts` (`:92-111,:119,:242-296`), `constants/products.ts` (`:196-213` backImageFor, `:220+` PRODUCTS), `lib/freePack.ts:52-54`, `lib/coupons.ts:34`, `lib/invoice.ts:89-100`, `lib/subscriptionSweep.ts:117`.
- **Saathi:** `lib/api/catalog_api.dart:332` (unchanged this migration).
