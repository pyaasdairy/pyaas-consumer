import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserId } from '../lib/session';

/**
 * Favorites / wishlist — the household's standing list of SKUs. Persisted per
 * signed-in user in AsyncStorage, exposed reactively so the heart on every
 * ProductCard and the "Your favorites" shelf stay in sync. Fully offline.
 */
const keyFor = (uid: string) => `parag:favorites:${uid}`;

type FavState = {
  ids: string[];
  loaded: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
};

export const useFavorites = create<FavState>((set, get) => ({
  ids: [],
  loaded: false,
  refresh: async () => {
    try {
      const uid = await getUserId();
      if (!uid) return set({ ids: [], loaded: true });
      const raw = await AsyncStorage.getItem(keyFor(uid));
      set({ ids: raw ? (JSON.parse(raw) as string[]) : [], loaded: true });
    } catch {
      set({ ids: [], loaded: true });
    }
  },
  toggle: async (id) => {
    const uid = await getUserId();
    if (!uid) return;
    const cur = get().ids;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    set({ ids: next });
    try {
      await AsyncStorage.setItem(keyFor(uid), JSON.stringify(next));
    } catch {
      /* best effort */
    }
  },
}));
