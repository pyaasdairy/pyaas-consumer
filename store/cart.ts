import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '../constants/products';
import { MAX_QTY_PER_PRODUCT, MAX_ITEMS_PER_ORDER } from '../lib/pricing';
import { getDeliveryMode } from '../lib/deliveryMode';

/**
 * TWO CARTS, ONE STORE — every line belongs to a delivery LANE:
 *   'instant' → the ⚡ ~20-min one-time cart
 *   'morning' → one-time ADD-ONS delivered next morning alongside (and
 *               separately from) the member's subscription items
 * The bag icon / ADD buttons stamp the ACTIVE mode's lane automatically, so
 * adding from the Instant world fills the instant cart and adding from the
 * Morning world fills the morning cart — they never mix. All limits
 * (per-product / per-order) apply PER LANE, since each lane checks out as its
 * own order.
 */
export type CartLane = 'instant' | 'morning';

export type CartLine = {
  id: string;
  /** Which cart this line lives in ('scheduled' mode maps to 'morning'). */
  lane: CartLane;
  name: string;
  variant: string;
  price: number;
  image: Product['image'];
  qty: number;
  /** Set by revalidateStock() when the live catalog reports this SKU as no longer
   *  orderable (went out of stock, or was hidden/removed) — the UI flags it. */
  outOfStock?: boolean;
};

/** The lane new adds land in for a given delivery mode. */
export function laneForMode(mode: string): CartLane {
  return mode === 'instant' ? 'instant' : 'morning';
}

/** The currently-active lane (from the shared delivery-mode store). */
export function activeLane(): CartLane {
  return laneForMode(getDeliveryMode());
}

type CartState = {
  lines: CartLine[];
  hydrated: boolean;
  /** Add to the ACTIVE lane's cart (or an explicit lane when given). */
  add: (p: Product, qty?: number, lane?: CartLane) => void;
  setQty: (id: string, qty: number, lane?: CartLane) => void;
  remove: (id: string, lane?: CartLane) => void;
  /** Clear ONE lane's cart (checkout completes a single lane). */
  clear: (lane?: CartLane) => void;
  /** Units in a lane's cart (defaults to the active lane). */
  count: (lane?: CartLane) => number;
  subtotal: (lane?: CartLane) => number;
  /** Cross-check cart lines against the live merged catalog and flag any line
   *  that just went out of stock (or was hidden/removed). Called on Home focus. */
  revalidateStock: (products: Product[]) => void;
};

const totalUnits = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

/** Cap a line's qty by the per-product and per-order limits WITHIN its lane. */
function cappedQty(laneLines: CartLine[], id: string, wanted: number): number {
  const others = totalUnits(laneLines.filter((l) => l.id !== id));
  const roomInOrder = Math.max(0, MAX_ITEMS_PER_ORDER - others);
  return Math.max(0, Math.min(MAX_QTY_PER_PRODUCT, roomInOrder, wanted));
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      hydrated: false,
      add: (p, qty = 1, lane) =>
        set((s) => {
          const ln = lane ?? activeLane();
          const laneLines = s.lines.filter((l) => l.lane === ln);
          const idx = s.lines.findIndex((l) => l.id === p.id && l.lane === ln);
          if (idx >= 0) {
            const lines = [...s.lines];
            const next = cappedQty(laneLines, p.id, lines[idx].qty + qty);
            if (next > 0) lines[idx] = { ...lines[idx], qty: next };
            return { lines };
          }
          const next = cappedQty(laneLines, p.id, qty);
          if (next === 0) return { lines: s.lines };
          return {
            lines: [
              ...s.lines,
              { id: p.id, lane: ln, name: p.name, variant: p.variant, price: p.price, image: p.image, qty: next },
            ],
          };
        }),
      setQty: (id, qty, lane) =>
        set((s) => {
          const ln = lane ?? activeLane();
          const laneLines = s.lines.filter((l) => l.lane === ln);
          return {
            lines: s.lines
              .map((l) => (l.id === id && l.lane === ln ? { ...l, qty: cappedQty(laneLines, id, qty) } : l))
              .filter((l) => l.qty > 0),
          };
        }),
      remove: (id, lane) =>
        set((s) => {
          const ln = lane ?? activeLane();
          return { lines: s.lines.filter((l) => !(l.id === id && l.lane === ln)) };
        }),
      clear: (lane) =>
        set((s) => {
          const ln = lane ?? activeLane();
          return { lines: s.lines.filter((l) => l.lane !== ln) };
        }),
      count: (lane) => {
        const ln = lane ?? activeLane();
        return totalUnits(get().lines.filter((l) => l.lane === ln));
      },
      subtotal: (lane) => {
        const ln = lane ?? activeLane();
        return get()
          .lines.filter((l) => l.lane === ln)
          .reduce((s, l) => s + l.price * l.qty, 0);
      },
      revalidateStock: (products) =>
        set((s) => {
          const byId = new Map(products.map((p) => [p.id, p]));
          let changed = false;
          const lines = s.lines.map((l) => {
            const p = byId.get(l.id);
            // Unavailable when the SKU is gone from the live catalog (hidden/
            // removed) or the catalog flags it out of stock.
            const oos = !p || !!p.outOfStock;
            // Re-sync price/name/variant from the live overlay so a store-manager
            // reprice is reflected in the bill — the line snapshots these at
            // add-time and would otherwise charge a stale price.
            const price = p ? p.price : l.price;
            const name = p ? p.name : l.name;
            const variant = p ? p.variant : l.variant;
            if (oos === !!l.outOfStock && price === l.price && name === l.name && variant === l.variant) return l;
            changed = true;
            return { ...l, outOfStock: oos, price, name, variant };
          });
          return changed ? { lines } : s;
        }),
    }),
    {
      name: 'parag_cart_v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // image is a require()'d module id; persist everything else and rehydrate fine.
      partialize: (s) => ({ lines: s.lines }),
      // v1 lines had no lane — they came from the instant-checkout cart.
      migrate: (persisted: any) => {
        if (persisted?.lines) {
          persisted.lines = persisted.lines.map((l: any) => ({ ...l, lane: l.lane ?? 'instant' }));
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
