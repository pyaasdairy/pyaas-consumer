import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '../constants/products';
import { MAX_QTY_PER_PRODUCT, MAX_ITEMS_PER_ORDER } from '../lib/pricing';

export type CartLine = {
  id: string;
  name: string;
  variant: string;
  price: number;
  image: Product['image'];
  qty: number;
  /** Set by revalidateStock() when the live catalog reports this SKU as no longer
   *  orderable (went out of stock, or was hidden/removed) — the UI flags it. */
  outOfStock?: boolean;
};

type CartState = {
  lines: CartLine[];
  hydrated: boolean;
  add: (p: Product, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
  /** Cross-check cart lines against the live merged catalog and flag any line
   *  that just went out of stock (or was hidden/removed). Called on Home focus. */
  revalidateStock: (products: Product[]) => void;
};

const totalUnits = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

/** Cap a line's qty by both the per-product and whole-order fair-use limits. */
function cappedQty(lines: CartLine[], id: string, wanted: number): number {
  const others = totalUnits(lines.filter((l) => l.id !== id));
  const roomInOrder = Math.max(0, MAX_ITEMS_PER_ORDER - others);
  return Math.max(0, Math.min(MAX_QTY_PER_PRODUCT, roomInOrder, wanted));
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      hydrated: false,
      add: (p, qty = 1) =>
        set((s) => {
          const idx = s.lines.findIndex((l) => l.id === p.id);
          if (idx >= 0) {
            const lines = [...s.lines];
            const next = cappedQty(s.lines, p.id, lines[idx].qty + qty);
            if (next > 0) lines[idx] = { ...lines[idx], qty: next };
            return { lines };
          }
          const next = cappedQty(s.lines, p.id, qty);
          if (next === 0) return { lines: s.lines };
          return {
            lines: [
              ...s.lines,
              { id: p.id, name: p.name, variant: p.variant, price: p.price, image: p.image, qty: next },
            ],
          };
        }),
      setQty: (id, qty) =>
        set((s) => ({
          lines: s.lines
            .map((l) => (l.id === id ? { ...l, qty: cappedQty(s.lines, id, qty) } : l))
            .filter((l) => l.qty > 0),
        })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
      clear: () => set({ lines: [] }),
      count: () => totalUnits(get().lines),
      subtotal: () => get().lines.reduce((s, l) => s + l.price * l.qty, 0),
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
      storage: createJSONStorage(() => AsyncStorage),
      // image is a require()'d module id; persist everything else and rehydrate fine.
      partialize: (s) => ({ lines: s.lines }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
