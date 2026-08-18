import { useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, isBackendConfigured, resolveMediaUrl } from './apiClient';
import { PRODUCTS, getProduct, type Category, type Product } from '../constants/products';
import { useCart } from '../store/cart';

/**
 * BACKEND-AUTHORITATIVE catalog (phase 2). When
 * EXPO_PUBLIC_CATALOG_BACKEND_AUTHORITATIVE=true, a backend row that matches a
 * bundled SKU id overrides the bundled row's IDENTITY too (name / variant /
 * category / unit / description / subscribable / images / rating / compliance),
 * not just price+stock — the bundle becomes a pure offline fallback. Default OFF
 * keeps today's behaviour exactly (only price / mrp / stock / tag adopted).
 */
const BACKEND_AUTHORITATIVE = process.env.EXPO_PUBLIC_CATALOG_BACKEND_AUTHORITATIVE === 'true';

/**
 * CATALOG OVERLAY CLIENT
 * ----------------------
 * The bundled `constants/products.ts` PRODUCTS list is the offline source of
 * truth (ships in the app, always renders). The store manager, however, can
 * change a price, hide a SKU, or flip stock live from the PYAAS backend. This
 * module fetches that live overlay (`GET /consumer/catalog` — the app-key header
 * is already attached by apiClient) and MERGES it over the bundled list:
 *
 *   • price override   → patch.price replaces the bundled price
 *   • hidden           → the SKU is dropped from the catalog entirely
 *   • outOfStock       → the SKU stays visible but is marked not-orderable
 *   • additions        → new SKUs (ids the bundle doesn't have) are appended
 *
 * MILK / PYAAS ONLY: additions are accepted only for known dairy categories;
 * anything with an unknown (grocery) category is dropped, so a mis-seeded
 * grocery row can never render.
 *
 * The merged snapshot is held in a tiny external store so both the reactive
 * `useCatalog()` hook AND the imperative getters (`getMergedProducts()` /
 * `getMergedProduct()`, used e.g. for cart-stock revalidation) always agree.
 * The bundled list is the offline fallback: a failed/absent fetch keeps the
 * last-known snapshot (bundled on first load), so the feed never blanks out.
 */

/** How often the live overlay is re-pulled while a screen is mounted (live OOS). */
export const CATALOG_REFRESH_MS = 60_000;

/** A single catalog patch. `id` keys it to a bundled SKU (override) or, when the
 *  id is new, defines an addition (needs name + price + a dairy category). */
export type CatalogPatch = {
  id: string;
  price?: number;
  hidden?: boolean;
  outOfStock?: boolean;
  // Addition-only fields (ignored for overrides except where noted):
  baseId?: string;
  name?: string;
  variant?: string;
  category?: Category;
  unit?: string;
  tag?: string;
  description?: string;
  mrp?: number;
  subscribable?: boolean;
  /** Remote pack shot for an addition (bundled SKUs keep their local asset unless
   *  BACKEND_AUTHORITATIVE). Resolved to an absolute URL in overlayToPatches. */
  imageUrl?: string;
  /** Resolved absolute URL of the back-of-pack photo, when the backend has one. */
  backImageUrl?: string;
  // Extended social-proof + compliance fields carried by seeded products.
  rating?: number;
  ratingCount?: number;
  mostOrdered?: boolean;
  packCount?: number;
  compliance?: BackendCompliance;
};

/** The FSSAI / Legal Metrology / GST block as the backend sends it (camelCase),
 *  mapped onto the flat Product.* compliance fields in mergePatch / toAddition. */
type BackendCompliance = {
  hsn?: string;
  gstRate?: number;
  netQuantity?: string;
  veg?: boolean;
  ingredients?: string;
  nutrition?: string;
  allergens?: string;
  shelfLife?: string;
  storage?: string;
  countryOfOrigin?: string;
  fssaiLicense?: string;
  manufacturer?: string;
  manufacturerAddress?: string;
};

/**
 * The REAL backend envelope of GET /consumer/catalog (backend catalog.go):
 *   overrides  — per-baseline-SKU overlay, keyed by sku id ({price,in_stock,hidden})
 *   additions  — store-added base products, each with its own variants[]/physical{}
 *   version    — a monotonically-increasing overlay version (ms)
 * Field casing matches the backend exactly: overrides + additions use snake
 * `in_stock`/`photo_url`, while variants/physical use camelCase.
 */
type OverrideView = { price?: number; mrp?: number; in_stock?: boolean; hidden?: boolean };
type BackendVariant = {
  variantId?: string;
  label?: string;
  price?: number;
  imageUrl?: string;
  outOfStock?: boolean;
  volumeMl?: number;
  unit?: string;
  attributes?: Record<string, string>;
};
type AdditionView = {
  id: string;
  baseId?: string;
  name: string;
  category: string;
  variant?: string;
  description?: string;
  subscribable?: boolean;
  price: number;
  photo_url?: string;
  in_stock?: boolean;
  variants?: BackendVariant[];
  physical?: { volumeMl?: number; weightG?: number; dimensions?: string };
  // Extended fields (present for seeded baseline products; absent for a plain
  // store addition, where the app keeps its category-helper defaults).
  mrp?: number;
  unit?: string;
  tag?: string;
  rating?: number;
  ratingCount?: number;
  mostOrdered?: boolean;
  packCount?: number;
  back_photo_url?: string;
  compliance?: BackendCompliance;
};
export type CatalogResponse = {
  overrides?: Record<string, OverrideView>;
  additions?: AdditionView[];
  version?: number;
};

/**
 * Flatten the backend overlay envelope into the flat CatalogPatch[] applyOverlay
 * consumes. Overrides key onto a baseline SKU; additions become new SKUs, with a
 * multi-variant addition EXPANDED into one patch per variant (sharing `baseId` so
 * the app's variant grouping re-collapses them into a single card).
 */
export function overlayToPatches(res: CatalogResponse | null | undefined): CatalogPatch[] {
  if (!res) return [];
  const patches: CatalogPatch[] = [];

  // 1) Baseline-SKU overrides: {price, in_stock, hidden} keyed by sku id.
  if (res.overrides && typeof res.overrides === 'object') {
    for (const [id, ov] of Object.entries(res.overrides)) {
      if (!id || !ov) continue;
      const patch: CatalogPatch = { id };
      if (typeof ov.price === 'number') patch.price = ov.price;
      // ERP-mirrored MRP: an explicit 0 clears a stale bundled strikethrough
      // (mergePatch adopts mrp >= 0 and the card hides the strike at 0), so an
      // ERP price hike can never render under an out-of-date bundled MRP.
      if (typeof ov.mrp === 'number') patch.mrp = ov.mrp;
      if (typeof ov.hidden === 'boolean') patch.hidden = ov.hidden;
      if (typeof ov.in_stock === 'boolean') patch.outOfStock = !ov.in_stock; // in_stock → outOfStock
      patches.push(patch);
    }
  }

  // 2) Store additions. A base with variants[] expands to one SKU per variant.
  //    photo_url / back_photo_url are RELATIVE paths from the backend — resolve
  //    them to absolute URLs here so the whole app downstream sees ready `{ uri }`.
  if (Array.isArray(res.additions)) {
    for (const a of res.additions) {
      if (!a || typeof a.id !== 'string') continue;
      const baseOOS = a.in_stock === false;
      const frontUrl = resolveMediaUrl(a.photo_url);
      const backUrl = resolveMediaUrl(a.back_photo_url);
      if (Array.isArray(a.variants) && a.variants.length > 0) {
        for (const v of a.variants) {
          if (!v || typeof v.variantId !== 'string') continue;
          patches.push({
            id: v.variantId,
            baseId: a.id,
            name: a.name,
            category: a.category as Category,
            variant: v.label ?? a.variant,
            unit: v.unit ?? v.label,
            price: typeof v.price === 'number' ? v.price : a.price,
            mrp: a.mrp,
            tag: a.tag,
            description: a.description,
            subscribable: a.subscribable,
            imageUrl: resolveMediaUrl(v.imageUrl) ?? frontUrl,
            backImageUrl: backUrl,
            rating: a.rating,
            ratingCount: a.ratingCount,
            mostOrdered: a.mostOrdered,
            packCount: a.packCount,
            compliance: a.compliance,
            outOfStock: v.outOfStock ?? baseOOS,
          });
        }
      } else {
        patches.push({
          id: a.id,
          baseId: a.baseId || undefined,
          name: a.name,
          category: a.category as Category,
          variant: a.variant,
          unit: a.unit,
          price: a.price,
          mrp: a.mrp,
          tag: a.tag,
          description: a.description,
          subscribable: a.subscribable,
          imageUrl: frontUrl,
          backImageUrl: backUrl,
          rating: a.rating,
          ratingCount: a.ratingCount,
          mostOrdered: a.mostOrdered,
          packCount: a.packCount,
          compliance: a.compliance,
          outOfStock: baseOOS,
        });
      }
    }
  }

  return patches;
}

const DAIRY_CATEGORIES = new Set<Category>([
  'milk', 'dahi', 'paneer', 'ghee', 'butter', 'chaach',
  'flavoured_milk', 'mattha', 'lassi', 'khoya', 'super_tea', 'sweets',
]);

/** Copy the backend compliance block onto a Product's flat compliance fields
 *  (only the keys the backend actually supplied; the rest keep their defaults
 *  via complianceFor). Mutates `p` in place. */
function applyCompliance(p: Product, c: BackendCompliance | undefined): void {
  if (!c) return;
  if (typeof c.hsn === 'string') p.hsn = c.hsn;
  if (typeof c.gstRate === 'number') p.gstRate = c.gstRate;
  if (typeof c.netQuantity === 'string') p.netQuantity = c.netQuantity;
  if (typeof c.veg === 'boolean') p.veg = c.veg;
  if (typeof c.ingredients === 'string') p.ingredients = c.ingredients;
  if (typeof c.nutrition === 'string') p.nutrition = c.nutrition;
  if (typeof c.allergens === 'string') p.allergens = c.allergens;
  if (typeof c.shelfLife === 'string') p.shelfLife = c.shelfLife;
  if (typeof c.storage === 'string') p.storage = c.storage;
  if (typeof c.countryOfOrigin === 'string') p.countryOfOrigin = c.countryOfOrigin;
  if (typeof c.fssaiLicense === 'string') p.fssaiLicense = c.fssaiLicense;
  if (typeof c.manufacturer === 'string') p.manufacturer = c.manufacturer;
  if (typeof c.manufacturerAddress === 'string') p.manufacturerAddress = c.manufacturerAddress;
}

/**
 * Apply a patch onto a bundled product. ALWAYS adopts price / mrp / stock / tag
 * (the store-manager overlay). When BACKEND_AUTHORITATIVE, the backend row is
 * the source of truth, so its identity / media / social-proof / compliance are
 * adopted too — each field only when the backend actually supplied it, so a
 * bundled value is never blanked by an absent backend field. `baseId` is kept
 * from the bundle so variant grouping (and the funnel's id anchors) never move.
 */
function mergePatch(base: Product, patch: CatalogPatch): Product {
  const next: Product = { ...base };
  if (typeof patch.price === 'number' && patch.price >= 0) next.price = patch.price;
  if (typeof patch.mrp === 'number' && patch.mrp >= 0) next.mrp = patch.mrp;
  if (typeof patch.outOfStock === 'boolean') next.outOfStock = patch.outOfStock;
  if (typeof patch.tag === 'string') next.tag = patch.tag;
  if (!BACKEND_AUTHORITATIVE) return next;

  if (patch.name) next.name = patch.name;
  if (patch.variant) next.variant = patch.variant;
  if (patch.category && DAIRY_CATEGORIES.has(patch.category)) next.category = patch.category;
  if (typeof patch.unit === 'string' && patch.unit) next.unit = patch.unit;
  if (typeof patch.description === 'string' && patch.description) next.description = patch.description;
  if (typeof patch.subscribable === 'boolean') next.subscribable = patch.subscribable;
  if (typeof patch.rating === 'number') next.rating = patch.rating;
  if (typeof patch.ratingCount === 'number') next.ratingCount = patch.ratingCount;
  if (typeof patch.mostOrdered === 'boolean') next.mostOrdered = patch.mostOrdered;
  if (typeof patch.packCount === 'number') next.packCount = patch.packCount;
  if (patch.imageUrl) next.image = { uri: patch.imageUrl }; // else keep bundled asset
  if (patch.backImageUrl) next.backPhotoUrl = patch.backImageUrl;
  applyCompliance(next, patch.compliance);
  return next;
}

/** Coerce an addition patch into a Product, or null if it is invalid / grocery. */
function toAddition(patch: CatalogPatch): Product | null {
  if (!patch.category || !DAIRY_CATEGORIES.has(patch.category)) return null; // grocery / unknown → drop
  if (typeof patch.price !== 'number' || patch.price < 0) return null;
  if (!patch.name) return null;
  const p: Product = {
    id: patch.id,
    baseId: patch.baseId,
    name: patch.name,
    variant: patch.variant ?? '',
    category: patch.category,
    price: patch.price,
    mrp: patch.mrp,
    unit: patch.unit ?? '',
    tag: patch.tag ?? '',
    description: patch.description ?? '',
    image: patch.imageUrl ? { uri: patch.imageUrl } : undefined,
    backPhotoUrl: patch.backImageUrl,
    subscribable: patch.subscribable ?? patch.category === 'milk',
    outOfStock: patch.outOfStock,
    rating: patch.rating,
    ratingCount: patch.ratingCount,
    mostOrdered: patch.mostOrdered,
    packCount: patch.packCount,
  };
  applyCompliance(p, patch.compliance);
  return p;
}

/**
 * Pure merge: bundled list + overlay → merged list. Bundled order is preserved,
 * hidden SKUs are removed, overrides applied in place, additions appended in the
 * order the backend returned them. Returns the same `base` reference when there
 * is nothing to apply (so React can skip a re-render).
 */
export function applyOverlay(base: Product[], res: CatalogResponse | null | undefined): Product[] {
  const patches = overlayToPatches(res);
  if (patches.length === 0) return base;

  const patchById = new Map<string, CatalogPatch>();
  for (const p of patches) {
    if (!p || typeof p.id !== 'string') continue;
    const prev = patchById.get(p.id);
    // Same sku appearing twice (e.g. an override AND a served entry): MERGE
    // instead of discarding — earlier patch's fields win (overrides come first),
    // later patch fills the gaps (name/category/photo). A bare {price} override
    // must never erase the rich entry a non-bundled SKU depends on to render.
    patchById.set(p.id, prev ? { ...p, ...prev } : p);
  }

  const out: Product[] = [];
  const consumed = new Set<string>();

  // 1) Bundled SKUs, in order — override / hide as instructed.
  for (const bp of base) {
    const patch = patchById.get(bp.id);
    if (!patch) { out.push(bp); continue; }
    consumed.add(bp.id);
    if (patch.hidden) continue; // dropped
    out.push(mergePatch(bp, patch));
  }

  // 2) Additions — patches whose id is not a bundled SKU, first occurrence only.
  const seen = new Set<string>(consumed);
  for (const patch of patches) {
    if (!patch || typeof patch.id !== 'string' || seen.has(patch.id)) continue;
    seen.add(patch.id);
    if (patch.hidden) continue;
    const add = toAddition(patch);
    if (add) out.push(add);
  }

  return out;
}

// ── External store (module-level; hook + imperative getters share it) ─────────
// STOCK IS FULLY BACKEND-DRIVEN. Which SKUs are sellable comes ONLY from each
// product's in_stock in the DB (store-manager-controlled via the catalog console,
// surfaced through the catalog overlay → outOfStock). There is NO hardcoded launch
// gate — mark a SKU out of stock in the store console and it goes out of stock
// here; mark it in and it sells. The bundled PRODUCTS are just the offline
// first-paint fallback until the live catalog (with its in_stock) loads.
let merged: Product[] = PRODUCTS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setMerged(next: Product[]): void {
  if (next === merged) return;
  merged = next;
  emit();
  // Re-flag any cart line whose SKU just went out of stock / hidden. Runs on
  // every refresh (mount, 60s poll, focus) so the cart tracks live stock even on
  // screens that don't themselves mount useCatalog (e.g. the cart screen).
  try { useCart.getState().revalidateStock(next); } catch { /* store not ready */ }
}

/** Current merged catalog snapshot (bundled fallback until the first fetch). */
export function getMergedProducts(): Product[] {
  return merged;
}
/** A single merged product by id, or undefined if hidden / unknown. */
export function getMergedProduct(id: string): Product | undefined {
  return merged.find((p) => p.id === id);
}

/** DB-FIRST product resolver: the live merged (backend) product when present, else
 *  the bundled offline anchor. Use for any user-facing product display (a sub row,
 *  an order line, a compare card) so the store manager's live name / price / stock
 *  shows through and never a stale bundled value — while staying resolvable offline. */
export function resolveProduct(id: string): Product | undefined {
  return getMergedProduct(id) ?? getProduct(id);
}

// Single-flight the fetch so overlapping focus/interval pulls don't stampede.
let inFlight: Promise<void> | null = null;

// Persisted offline cache — the last GOOD backend response, so a backend-only
// SKU (or a store price change) survives an offline relaunch instead of snapping
// back to the bundled baseline. Hydrated once on boot BEFORE the first fetch.
const CATALOG_CACHE_KEY = 'pyaas.catalog.v1';
let liveLoaded = false;   // a live fetch has succeeded this session
let cacheApplied = false; // the persisted cache has been hydrated (once)

/** Hydrate the last persisted response on cold start. No-op once a live fetch
 *  has landed (never clobbers fresh data with a stale cache). */
export async function hydrateCatalogCache(): Promise<void> {
  if (cacheApplied || liveLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw || liveLoaded) return;
    const res = JSON.parse(raw) as CatalogResponse;
    cacheApplied = true;
    if (!liveLoaded) setMerged(applyOverlay(PRODUCTS, res));
  } catch {
    // no/invalid cache — stay on the bundled baseline until the live fetch lands
  }
}

/** Re-pull the live overlay and re-merge. No-op (keeps bundled) with no backend;
 *  error-soft (keeps last-known) on any network/parse failure. Persists the last
 *  good response for offline hydration. */
export function refreshCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!isBackendConfigured()) { setMerged(PRODUCTS); return; }
    try {
      const res = await api.get<CatalogResponse>('/catalog');
      liveLoaded = true;
      setMerged(applyOverlay(PRODUCTS, res));
      try { await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(res)); } catch { /* cache only */ }
    } catch {
      // offline / server blip — keep the last-known snapshot; fall back to the
      // persisted cache if we haven't merged anything live yet this session.
      if (!liveLoaded) void hydrateCatalogCache();
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Reactive merged catalog. Refetches on mount and every {CATALOG_REFRESH_MS}
 * (so a store-manager price/stock change surfaces live) and re-renders the
 * caller whenever the merged snapshot changes. Falls back to the bundled list
 * while offline.
 */
export function useCatalog(): Product[] {
  const products = useSyncExternalStore(subscribe, getMergedProducts, getMergedProducts);
  useEffect(() => {
    void hydrateCatalogCache(); // instant last-known render before the network answers
    void refreshCatalog();
    const t = setInterval(() => { void refreshCatalog(); }, CATALOG_REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  return products;
}

// ── Variant grouping (one storefront card per base, many size variants) ───────
/**
 * A base product and its ordered size variants (500 ml · 1 L · 5 L …). Each
 * `variant` is a full merged Product, so per-variant overrides (price / out of
 * stock / hidden) are ALREADY applied — hidden variants never appear, and a
 * variant flipped out of stock keeps its own flag. `base` is the representative
 * shown first (the first in-catalog variant of the group).
 */
export type GroupedProduct = { base: Product; variants: Product[] };

/** Grouping key: an explicit `baseId` when set, else the shared display name. */
function groupKey(p: Product): string {
  return p.baseId ?? p.name;
}

/**
 * Collapse a flat (already-merged) product list into base + variants groups.
 * First appearance defines a group's order and its `base`; variants keep their
 * in-list order (500 ml before 1 L before 5 L, as authored). Pure — safe to
 * memoise over the reactive catalog.
 */
export function groupProducts(list: Product[]): GroupedProduct[] {
  const groups: GroupedProduct[] = [];
  const byKey = new Map<string, GroupedProduct>();
  for (const p of list) {
    const key = groupKey(p);
    const g = byKey.get(key);
    if (g) { g.variants.push(p); continue; }
    const created: GroupedProduct = { base: p, variants: [p] };
    byKey.set(key, created);
    groups.push(created);
  }
  return groups;
}

/** Imperative grouped snapshot (overrides + additions applied), for flat-free callers. */
export function getGroupedProducts(): GroupedProduct[] {
  return groupProducts(getMergedProducts());
}

/** Reactive grouped catalog — the live 60s source, collapsed to one card per base. */
export function useGroupedCatalog(): GroupedProduct[] {
  const products = useCatalog();
  return useMemo(() => groupProducts(products), [products]);
}

/** The variant a card/detail should open on: the first in-stock one, else the first. */
export function defaultVariant(variants: Product[]): Product {
  return variants.find((v) => !v.outOfStock) ?? variants[0];
}

/** Short chip label for a variant selector — the pack size ("500 ml", "1 L"). */
export function variantLabel(p: Product): string {
  return p.unit || p.variant;
}

/**
 * Physical attributes row for the detail page. Reads the pack measure off
 * `netQuantity`/`unit` and labels it Volume (ml / L) or Weight (g / kg).
 * Returns [] when there is no measure to show (renders nothing, gracefully).
 */
export function physicalAttributes(p: Product): { label: string; value: string }[] {
  const value = (p.netQuantity ?? p.unit ?? '').trim();
  if (!value) return [];
  const lower = value.toLowerCase();
  const isWeight = /(^|\s|\d)(kg|g)\b/.test(lower);
  const isVolume = /(^|\s|\d)(ml|l|litre|liter)\b/.test(lower);
  const label = isWeight ? 'Weight' : isVolume ? 'Volume' : 'Net quantity';
  return [{ label, value }];
}
