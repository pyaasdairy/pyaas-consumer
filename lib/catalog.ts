import { useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import { api, isBackendConfigured } from './apiClient';
import { PRODUCTS, type Category, type Product } from '../constants/products';
import { useCart } from '../store/cart';

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
  /** Remote pack shot for an addition (bundled SKUs keep their local asset). */
  imageUrl?: string;
};

/**
 * The REAL backend envelope of GET /consumer/catalog (backend catalog.go):
 *   overrides  — per-baseline-SKU overlay, keyed by sku id ({price,in_stock,hidden})
 *   additions  — store-added base products, each with its own variants[]/physical{}
 *   version    — a monotonically-increasing overlay version (ms)
 * Field casing matches the backend exactly: overrides + additions use snake
 * `in_stock`/`photo_url`, while variants/physical use camelCase.
 */
type OverrideView = { price?: number; in_stock?: boolean; hidden?: boolean };
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
      if (typeof ov.hidden === 'boolean') patch.hidden = ov.hidden;
      if (typeof ov.in_stock === 'boolean') patch.outOfStock = !ov.in_stock; // in_stock → outOfStock
      patches.push(patch);
    }
  }

  // 2) Store additions. A base with variants[] expands to one SKU per variant.
  if (Array.isArray(res.additions)) {
    for (const a of res.additions) {
      if (!a || typeof a.id !== 'string') continue;
      const baseOOS = a.in_stock === false;
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
            description: a.description,
            subscribable: a.subscribable,
            imageUrl: v.imageUrl ?? a.photo_url,
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
          price: a.price,
          description: a.description,
          subscribable: a.subscribable,
          imageUrl: a.photo_url,
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

/** Apply an override patch onto a bundled product (price / stock / tag / mrp). */
function mergePatch(base: Product, patch: CatalogPatch): Product {
  const next: Product = { ...base };
  if (typeof patch.price === 'number' && patch.price >= 0) next.price = patch.price;
  if (typeof patch.mrp === 'number' && patch.mrp >= 0) next.mrp = patch.mrp;
  if (typeof patch.outOfStock === 'boolean') next.outOfStock = patch.outOfStock;
  if (typeof patch.tag === 'string') next.tag = patch.tag;
  return next;
}

/** Coerce an addition patch into a Product, or null if it is invalid / grocery. */
function toAddition(patch: CatalogPatch): Product | null {
  if (!patch.category || !DAIRY_CATEGORIES.has(patch.category)) return null; // grocery / unknown → drop
  if (typeof patch.price !== 'number' || patch.price < 0) return null;
  if (!patch.name) return null;
  return {
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
    subscribable: patch.subscribable ?? patch.category === 'milk',
    outOfStock: patch.outOfStock,
  };
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
    if (p && typeof p.id === 'string' && !patchById.has(p.id)) patchById.set(p.id, p);
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

// Single-flight the fetch so overlapping focus/interval pulls don't stampede.
let inFlight: Promise<void> | null = null;

/** Re-pull the live overlay and re-merge. No-op (keeps bundled) with no backend;
 *  error-soft (keeps last-known) on any network/parse failure. */
export function refreshCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!isBackendConfigured()) { setMerged(PRODUCTS); return; }
    try {
      const res = await api.get<CatalogResponse>('/consumer/catalog');
      setMerged(applyOverlay(PRODUCTS, res));
    } catch {
      // offline / server blip — keep the last-known snapshot (bundled on cold start)
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
