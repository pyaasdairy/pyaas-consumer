/**
 * Address predictive-text seam (Google Places Autocomplete).
 *
 * Provider-agnostic, env-gated seam: when `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is
 * set, `placesAutocomplete()` queries Google Places and returns suggestions the
 * address screen renders in a dropdown. When the key is ABSENT it no-ops
 * (returns []), so the screen falls back to plain manual typing with zero
 * network calls and no crash. Nothing here is required for the app to build.
 *
 * The key is a PUBLIC EXPO_PUBLIC_* value (ships in the bundle) — restrict it in
 * Google Cloud Console to the Places API + your app's package/bundle id. For a
 * hardened setup, proxy these calls through parag-api instead and point this
 * seam at that endpoint (swap the two fetch URLs below).
 *
 * Docs: docs/native-convenience.md.
 */

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

/** True when a Places key is configured — screens can hide the dropdown otherwise. */
export function isPlacesEnabled(): boolean {
  return PLACES_KEY.length > 0;
}

export type PlaceSuggestion = {
  placeId: string;
  /** Primary line, e.g. "Lotus Apartments". */
  primary: string;
  /** Secondary line, e.g. "Gomti Nagar, Lucknow, UP". */
  secondary: string;
  /** Full one-line description. */
  description: string;
};

export type PlaceDetail = {
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Fetch address predictions for the typed query. Returns [] when disabled, the
 * query is too short, or on any error (caller shows the manual field only).
 * `signal` lets the caller cancel in-flight requests on keystroke.
 */
export async function placesAutocomplete(
  query: string,
  opts?: { signal?: AbortSignal; sessionToken?: string },
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!isPlacesEnabled() || q.length < 3) return [];
  try {
    const params = new URLSearchParams({
      input: q,
      key: PLACES_KEY,
      components: 'country:in', // bias to India — PYAAS delivery geography
      types: 'geocode',
    });
    if (opts?.sessionToken) params.set('sessiontoken', opts.sessionToken);
    const res = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`, { signal: opts?.signal });
    if (!res.ok) return [];
    const json: any = await res.json();
    if (json.status !== 'OK' || !Array.isArray(json.predictions)) return [];
    return json.predictions.map(
      (p: any): PlaceSuggestion => ({
        placeId: p.place_id,
        primary: p.structured_formatting?.main_text ?? p.description ?? '',
        secondary: p.structured_formatting?.secondary_text ?? '',
        description: p.description ?? '',
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Resolve a chosen suggestion to structured address parts (line, city, pincode,
 * coords) to prefill the form. Returns null when disabled or on any error.
 */
export async function placeDetails(
  placeId: string,
  opts?: { signal?: AbortSignal; sessionToken?: string },
): Promise<PlaceDetail | null> {
  if (!isPlacesEnabled() || !placeId) return null;
  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: PLACES_KEY,
      fields: 'address_component,geometry,name,formatted_address',
    });
    if (opts?.sessionToken) params.set('sessiontoken', opts.sessionToken);
    const res = await fetch(`${DETAILS_URL}?${params.toString()}`, { signal: opts?.signal });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.status !== 'OK' || !json.result) return null;
    return parseDetail(json.result);
  } catch {
    return null;
  }
}

function parseDetail(result: any): PlaceDetail {
  const comps: any[] = result.address_components ?? [];
  const get = (type: string) => comps.find((c) => c.types?.includes(type))?.long_name ?? '';
  const streetNo = get('street_number');
  const route = get('route');
  const sublocality =
    get('sublocality_level_1') || get('sublocality') || get('neighborhood');
  const city = get('locality') || get('administrative_area_level_2');
  const pincode = get('postal_code');
  const line1 = [streetNo, route].filter(Boolean).join(' ') || result.name || '';
  const loc = result.geometry?.location;
  return {
    line1,
    line2: sublocality,
    city,
    pincode,
    lat: typeof loc?.lat === 'number' ? loc.lat : null,
    lng: typeof loc?.lng === 'number' ? loc.lng : null,
  };
}

/** A random session token groups autocomplete+details calls for Google billing. */
export function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
