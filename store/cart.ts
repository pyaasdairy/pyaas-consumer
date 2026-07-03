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
    }),
    {
      name: 'pyaas_cart_v1',
      storage: createJSONStorage(() => AsyncStorage),
      // image is a require()'d module id; persist everything else and rehydrate fine.
      partialize: (s) => ({ lines: s.lines }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
