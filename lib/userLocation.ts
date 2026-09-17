import { create } from 'zustand';
import * as Location from 'expo-location';
import { getSingle, putSingle } from './localStore';
import { getUserId } from './session';
import type { Coords } from './location';
import { LAUNCH_AREA, isInLaunchArea } from '../constants/societies';

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
export type UserLoc = {
  coords: Coords;
  city: string;
  source: LocSource;
  exact: boolean;
  /**
   * The NATIVE locality the member actually calls home ("Sushant Golf City"),
   * as opposed to the metro they sit in ("Lucknow"). The header shows this
   * when we have it, because "Deliver to Lucknow" tells a Golf City resident
   * nothing about whether we mean their door. Optional: older persisted rows
   * and city picks have no area, and every consumer falls back to `city`.
   */
  area?: string | null;
};

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
/** Snap a reverse-geocoded name to the nearest KNOWN city when the coordinate
 *  sits within its metro radius. The OS geocoder loves returning the
 *  neighbourhood/tehsil ("Muzaffar Nagar" for a Ghusval, Lucknow pin) as the
 *  "city", which then mislabels the whole app. Inside ~45 km of a known city,
 *  that city's name wins; further out, the geocoder's answer stands. */
function snapToKnownCity(raw: string | null, c: Coords): string | null {
  for (const k of CITIES) {
    const dLat = (k.coords.lat - c.lat) * 111;
    const dLng = (k.coords.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
    if (Math.sqrt(dLat * dLat + dLng * dLng) <= 45) return k.name;
  }
  return raw;
}

export async function cityFromCoords(c: Coords): Promise<string | null> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    const r = res?.[0];
    return snapToKnownCity(r?.city || (r as { subregion?: string } | undefined)?.subregion || r?.region || null, c);
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
    const city = snapToKnownCity(r?.city || (r as { subregion?: string } | undefined)?.subregion || r?.region || null, c);
    const pincode = r?.postalCode || null;
    return { city, pincode };
  } catch {
    return { city: null, pincode: null };
  }
}

/**
 * Reverse-geocode a coordinate to a short human-readable place label
 * ("Nehru Marg, Gomti Nagar, Lucknow 226010") so screens can SHOW the member
 * exactly which spot they are confirming — never a silent, unexplained pin.
 * Best-effort; null when the OS geocoder has nothing.
 */
export async function placeLabelFromCoords(c: Coords): Promise<string | null> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    const r = res?.[0] as (typeof res)[0] & { subregion?: string } | undefined;
    if (!r) return null;
    const line = [r.name || r.street, r.district || r.subregion, r.city || r.region]
      .filter((p): p is string => !!p && p.trim().length > 0)
      .filter((p, i, arr) => arr.indexOf(p) === i) // drop duplicates ("Lucknow, Lucknow")
      .join(', ');
    const label = [line, r.postalCode].filter(Boolean).join(' ');
    return label.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The locality/neighbourhood name for a point — what a resident would answer if
 * asked where they live. Prefers the OS geocoder's district/subregion, drops
 * anything that merely repeats the city, and falls back to the launch
 * township's own label when the point sits inside it (the geocoder often
 * returns nothing useful for a young township).
 */
export async function areaFromCoords(c: Coords): Promise<string | null> {
  const inLaunch = isInLaunchArea(c);
  // INSIDE THE LAUNCH TOWNSHIP the township's own name wins outright. The OS
  // geocoder answers with a sub-locality there ("Sector B"), which is precise
  // but tells a member nothing about whether they are in our service area —
  // and "Golf City" is the name residents actually use for where they live
  // (founder call, 18 Sep). Outside it, the geocoder's locality is the best
  // answer we have.
  if (inLaunch) return LAUNCH_AREA.area;
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    const r = res?.[0] as ((typeof res)[0] & { subregion?: string }) | undefined;
    const city = snapToKnownCity(r?.city || r?.subregion || r?.region || null, c);
    const candidates = [r?.district, r?.subregion, r?.name, r?.street];
    for (const raw of candidates) {
      const v = (raw ?? '').trim();
      if (!v) continue;
      if (/^\d/.test(v)) continue;                              // "402, Block C" is a door, not an area
      if (city && v.toLowerCase() === city.toLowerCase()) continue; // just the city again
      return v;
    }
  } catch {
    /* geocoder unavailable — fall through */
  }
  return inLaunch ? LAUNCH_AREA.area : null;
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
  /** `exact` = a precise geocoded point (a searched address) vs a city centroid.
   *  `area` = the native locality when the caller already knows it (a society
   *  address); omitted, it is resolved from the pin. */
  setFromAddress: (city: string, coords: Coords, exact?: boolean, area?: string | null) => Promise<void>;
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
      const area = await areaFromCoords(coords);
      const loc: UserLoc = { coords, city, source: 'gps', exact: true, area };
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
    // A city pick has no locality — the member told us the metro, nothing more.
    const loc: UserLoc = { coords: c.coords, city: c.name, source: 'manual', exact: false, area: null };
    set({ loc, permissionDenied: false });
    await persist(loc);
  },
  setFromAddress: async (city, coords, exact = false, area) => {
    // A saved society address passes its own area ("Sushant Golf City"); any
    // other address resolves one from the pin.
    const resolved = area ?? (await areaFromCoords(coords));
    const loc: UserLoc = { coords, city, source: 'address', exact, area: resolved };
    set({ loc });
    await persist(loc);
  },
  setFromPin: async (coords) => {
    const city = (await cityFromCoords(coords)) ?? 'your pinned location';
    const area = await areaFromCoords(coords);
    const loc: UserLoc = { coords, city, source: 'map', exact: true, area };
    set({ loc, permissionDenied: false });
    await persist(loc);
  },
}));

/** Non-hook read for the data layer (serviceability resolvePoint). */
export function currentUserLoc(): UserLoc | null {
  return useUserLocation.getState().loc;
}

/**
 * What to print after "Deliver to": the native locality when we have one, the
 * city otherwise. One helper so the header, the cart and the order screens can
 * never disagree about where the member thinks the milk is going.
 */
export function deliveryPlaceLabel(loc: UserLoc | null | undefined): string | null {
  if (!loc) return null;
  const area = (loc.area ?? '').trim();
  if (area) return area;
  const city = (loc.city ?? '').trim();
  return city || null;
}
