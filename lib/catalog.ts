import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { api, isBackendConfigured } from './apiClient';
import { PRODUCTS, type Category, type Product } from '../constants/products';

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

export type CatalogResponse = { products?: CatalogPatch[] };

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
  const patches = res?.products;
  if (!Array.isArray(patches) || patches.length === 0) return base;

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
