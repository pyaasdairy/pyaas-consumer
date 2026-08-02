import { create } from 'zustand';
import * as Location from 'expo-location';
import { getSingle, putSingle } from './localStore';
import { getUserId } from './session';
import type { Coords } from './location';

/**
 * The member's chosen DELIVERY LOCATION — the single source of truth the shop
 * (serviceability) checks against. It can come from four places:
 *   - 'gps'     : device GPS, once the member allows location
 *   - 'map'     : an exact point the member dropped a pin on (MapPicker)
 *   - 'manual'  : a city picked from the list below (used when GPS is denied)
 *   - 'address' : seeded from a saved delivery address (returning members)
 *
 * Location permission is OPTIONAL: if the member declines, they pick their spot
 * on the map or a city manually — the app never dead-ends on a denied permission.
 */

export type LocSource = 'gps' | 'map' | 'manual' | 'address';
// `exact` = the coordinate is a real, precise point (device GPS, a dropped map
// pin, or a geocoded searched address) — NOT a city centroid. The subscription
// exact-location gate (lib/location.hasExactLocation) trusts this flag.
export type UserLoc = { coords: Coords; city: string; source: LocSource; exact: boolean };

/** Curated serviceable cities (PARAG's UP footprint) for the manual picker. */
export const CITIES: { name: string; coords: Coords }[] = [
  { name: 'Lucknow', coords: { lat: 26.8467, lng: 80.9462 } },
  { name: 'Barabanki', coords: { lat: 26.9285, lng: 81.1879 } },
  { name: 'Kanpur', coords: { lat: 26.4499, lng: 80.3319 } },
  { name: 'Prayagraj', coords: { lat: 25.4358, lng: 81.8463 } },
  { name: 'Varanasi', coords: { lat: 25.3176, lng: 82.9739 } },
  { name: 'Gorakhpur', coords: { lat: 26.7606, lng: 83.3732 } },
  { name: 'Bareilly', coords: { lat: 28.367, lng: 79.4304 } },
  { name: 'Agra', coords: { lat: 27.1767, lng: 78.0081 } },
  { name: 'Meerut', coords: { lat: 28.9845, lng: 77.7064 } },
  { name: 'Noida', coords: { lat: 28.5355, lng: 77.391 } },
];

const TABLE = 'user_location';

/** Loose city-name equality (case/space/“, Uttar Pradesh” tolerant). */
export function sameCity(a?: string | null, b?: string | null): boolean {
  const n = (s?: string | null) => (s ?? '').trim().toLowerCase().split(',')[0].trim();
  const x = n(a);
  const y = n(b);
  return !!x && !!y && x === y;
}

async function persist(loc: UserLoc | null) {
  const uid = await getUserId();
  if (!uid) return;
  await putSingle(TABLE, uid, { loc });
}

/** Reverse-geocode a coordinate to a city name (OS geocoder, no key). Best-effort. */
export async function cityFromCoords(c: Coords): Promise<string | null> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    const r = res?.[0];
    return r?.city || (r as { subregion?: string } | undefined)?.subregion || r?.region || null;
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode a coordinate to { city, pincode } (OS geocoder, no key) so the
 * address form can AUTO-FILL both from a map tap — the member types only their
 * flat/area/landmark. Best-effort; either field may come back null.
 */
export async function geoAddress(c: Coords): Promise<{ city: string | null; pincode: string | null }> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    const r = res?.[0];
    const city = r?.city || (r as { subregion?: string } | undefined)?.subregion || r?.region || null;
    const pincode = r?.postalCode || null;
    return { city, pincode };
  } catch {
    return { city: null, pincode: null };
  }
}

type State = {
  loc: UserLoc | null;
  /** true once hydrate() has run (home waits for this before prompting). */
  ready: boolean;
  /** the member declined the OS location prompt → show the manual picker. */
  permissionDenied: boolean;
  locating: boolean;
  /** on-demand: true while the "change location" picker is open (vs first-launch). */
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  hydrate: () => Promise<void>;
  /** Ask for location permission (re-prompts every call) and set a GPS fix. */
  useMyLocation: () => Promise<boolean>;
  setCity: (name: string) => Promise<void>;
  /** `exact` = a precise geocoded point (a searched address) vs a city centroid. */
  setFromAddress: (city: string, coords: Coords, exact?: boolean) => Promise<void>;
  /** Set an EXACT delivery point from a dropped map pin (reverse-geocodes a label). */
  setFromPin: (coords: Coords) => Promise<void>;
};

export const useUserLocation = create<State>((set) => ({
  loc: null,
  ready: false,
  permissionDenied: false,
  locating: false,
  pickerOpen: false,
  setPickerOpen: (v) => set({ pickerOpen: v }),
  hydrate: async () => {
    const uid = await getUserId();
    let loc: UserLoc | null = null;
    if (uid) {
      const row = await getSingle<{ loc: UserLoc | null }>(TABLE, uid).catch(() => null);
      loc = row?.loc ?? null;
    }
    set({ loc, ready: true });
  },
  useMyLocation: async () => {
    set({ locating: true });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        set({ permissionDenied: true, locating: false });
        return false;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const city = (await cityFromCoords(coords)) ?? 'your location';
      const loc: UserLoc = { coords, city, source: 'gps', exact: true };
      set({ loc, permissionDenied: false, locating: false });
      await persist(loc);
      return true;
    } catch {
      set({ locating: false });
      return false;
    }
  },
  setCity: async (name) => {
    const c = CITIES.find((x) => x.name === name);
    if (!c) return;
    // A city centroid is NOT an exact door — exact:false.
    const loc: UserLoc = { coords: c.coords, city: c.name, source: 'manual', exact: false };
    set({ loc, permissionDenied: false });
    await persist(loc);
  },
  setFromAddress: async (city, coords, exact = false) => {
    const loc: UserLoc = { coords, city, source: 'address', exact };
    set({ loc });
    await persist(loc);
  },
  setFromPin: async (coords) => {
    const city = (await cityFromCoords(coords)) ?? 'your pinned location';
    const loc: UserLoc = { coords, city, source: 'map', exact: true };
    set({ loc, permissionDenied: false });
    await persist(loc);
  },
}));

/** Non-hook read for the data layer (serviceability resolvePoint). */
export function currentUserLoc(): UserLoc | null {
  return useUserLocation.getState().loc;
}
