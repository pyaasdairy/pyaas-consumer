import { create } from 'zustand';
import { api, isBackendConfigured } from './apiClient';
import { getRows } from './localStore';
import { getUserId } from './session';
import { DEFAULT_REGION } from './location';
import { currentUserLoc, CITIES } from './userLocation';
import { isPlayTesterSession } from './testAccess';
import type { Address } from './api';

/**
 * Serviceability — is PYAAS live at the member's delivery point yet, and which
 * lanes (standard morning / ⚡ instant) does the serving store run there?
 *
 * The gate is deliberately FAIL-OPEN: a network blip, a cold-start timeout, or a
 * missing backend must NEVER lock a paying customer out of the shop. Only an
 * EXPLICIT `serviceable: false` from the backend shows the "Coming Soon" screen;
 * anything unknown falls through as serviceable so the normal home renders.
 *
 * Maps to `GET /consumer/serviceability` (the app-key header is attached by
 * apiClient). Runs against the saved default-address coordinate, else the live
 * device GPS, else the default region — whatever we can resolve on-device.
 */

export type Serviceability = {
  /** false ONLY when the backend explicitly says we don't deliver here yet. */
  serviceable: boolean;
  /** Standard morning (5–7:30 AM) lane available at this point. */
  standard: boolean;
  /** ⚡ Instant (~20 min) lane available at this point (false when shut for the night). */
  instant: boolean;
  /** Name of the store that would serve this point (nice-to-have, may be null). */
  storeName: string | null;
  /** Monsoon surcharge (₹) the serving store charges on INSTANT orders (0 = none). */
  monsoonRupees: number;
  /** Instant is shut right now (store hours / manual close) — show the resume note. */
  instantClosed: boolean;
  /** Human "resumes …" note (IST, backend-computed), e.g. "tomorrow at 7:00 AM". */
  instantResumesLabel: string | null;
  /** Natural "why we don't serve here yet" line for the Coming-Soon screen. */
  reason: string | null;
  /** Distance (km) to the nearest store — shown on the Coming-Soon screen. */
  distanceKm: number | null;
};

// Loosely-typed backend payload: we normalise a range of field names so a
// backend rename (available/morning/instant_available/store_name…) can't silently
// flip the gate closed. Everything defaults PERMISSIVE (fail-open).
type RawServiceability = {
  serviceable?: boolean; available?: boolean;
  standard?: boolean; morning?: boolean;
  instant?: boolean; instant_available?: boolean;
  storeName?: string | null; store_name?: string | null;
  monsoonEnabled?: boolean; monsoonRupees?: number;
  instantClosed?: boolean; instantResumesLabel?: string | null;
  reason?: string | null; distanceKm?: number | null;
};

function normalize(raw: RawServiceability | null | undefined): Serviceability {
  const r = raw ?? {};
  const serviceable = r.serviceable ?? r.available ?? true;
  return {
    serviceable,
    // If the point is serviceable at all, standard morning is the baseline lane
    // unless the backend explicitly turns it off.
    standard: r.standard ?? r.morning ?? serviceable,
    // Instant defaults PERMISSIVE when unspecified (fail-open), so a backend that
    // hasn't shipped the field yet doesn't wrongly hide the instant lane. Only an
    // explicit `false` disables it.
    instant: r.instant ?? r.instant_available ?? true,
    storeName: r.storeName ?? r.store_name ?? null,
    monsoonRupees: r.monsoonEnabled ? (r.monsoonRupees ?? 0) : 0,
    instantClosed: r.instantClosed ?? false,
    instantResumesLabel: r.instantResumesLabel ?? null,
    reason: r.reason ?? null,
    distanceKm: r.distanceKm ?? null,
  };
}

export type CheckPoint = {
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  /** True ONLY when the coords are the member's EXPLICITLY chosen location
   *  (set by resolvePoint from the location gate) — never for the saved-address
   *  or DEFAULT_REGION fallbacks. Gates the home-city centroid exemption. */
  cityPick?: boolean;
};

// ── Launch geofence: Sushant Golf City, Lucknow ──────────────────────────────
// PYAAS is live in ONE township to begin with. Anyone whose delivery point is
// outside it sees "Coming Soon", never the shop — a deliberate, deterministic
// gate that sits IN FRONT of the fail-open network logic below. It keys on
// geometry (a known coordinate), not the network, so it can't lock out a real
// in-zone customer on a blip the way a fail-closed network call would.
//
// Centre + radius are overridable per build (no code change to move/resize the
// zone). Radius is generous enough to cover Golf City / Sushant Golf City and
// its immediate approach roads.
const SERVICE_AREA = {
  lat: Number(process.env.EXPO_PUBLIC_SERVICE_AREA_LAT) || 26.7715,
  lng: Number(process.env.EXPO_PUBLIC_SERVICE_AREA_LNG) || 81.0176,
  radiusKm: Number(process.env.EXPO_PUBLIC_SERVICE_RADIUS_KM) || 6,
  label: process.env.EXPO_PUBLIC_SERVICE_AREA_LABEL || 'Sushant Golf City, Lucknow',
};

/** The serving dark store: Chandra Panorama, Sushant Golf City, Lucknow.
 *  Drawn as the trip origin on every tracking map (store icon → the member's
 *  door), before and after a rider reports positions. Coordinates are
 *  env-overridable so the exact rooftop can be corrected without a release. */
export const STORE_POINT = {
  lat: Number(process.env.EXPO_PUBLIC_STORE_LAT) || 26.7738,
  lng: Number(process.env.EXPO_PUBLIC_STORE_LNG) || 81.0089,
  label: process.env.EXPO_PUBLIC_STORE_LABEL || 'PYAAS Store · Chandra Panorama',
};

/** Great-circle distance (km) between two coordinates. */
function distanceKmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** The out-of-zone Serviceability result for a point beyond the launch area. */
function outOfZone(distanceKm: number): Serviceability {
  return {
    serviceable: false,
    standard: false,
    instant: false,
    storeName: `PYAAS ${SERVICE_AREA.label}`,
    monsoonRupees: 0,
    instantClosed: false,
    instantResumesLabel: null,
    reason: `PYAAS is delivering in ${SERVICE_AREA.label} to begin with. You're just outside our zone for now, but we're expanding fast.`,
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
}

/**
 * Ask the backend whether we deliver to a point. Fail-open on no-backend
 * (offline / local demo) so the shop always renders — EXCEPT the launch
 * geofence, which is enforced in every mode: outside the zone is never
 * serviceable, backend or not.
 */
export async function getServiceability(point: CheckPoint): Promise<Serviceability> {
  const fullyServiceable = (): Serviceability => ({ serviceable: true, standard: true, instant: true, storeName: `PYAAS ${SERVICE_AREA.label}`, monsoonRupees: 0, instantClosed: false, instantResumesLabel: null, reason: null, distanceKm: null });
  // GOOGLE PLAY REVIEWER (hardcoded test account): fully serviceable from
  // anywhere, before any fence or backend gate — the reviewer must reach every
  // feature with no location blocker. Everyone else takes the normal path.
  if (await isPlayTesterSession()) return fullyServiceable();
  // A coarse CITY pick of the city the service area itself sits in is
  // serviceable outright, LOCAL VERDICT, no backend consult. "Lucknow" from
  // the city list resolves to the metro centroid (~11 km from the fence
  // center) — street-level truth the member never gave; failing any fence
  // (ours or the backend's) on that centroid told members in the pilot city
  // "we're unserviceable here". The exemption applies ONLY to an EXPLICIT
  // pick (point.cityPick, set by resolvePoint solely for the member's chosen
  // location) — never to the DEFAULT_REGION fallback, which shares Lucknow's
  // coordinates; the know-nothing default must keep the fence. The exact
  // address still decides at order time. Farther centroids (Barabanki ~24 km,
  // Kanpur ~70 km) fail the fence as before.
  if (point.cityPick) {
    const HOME_CITY_KM = 15;
    const cityPick = CITIES.find(
      (c) => Math.abs(c.coords.lat - (point.lat ?? NaN)) < 1e-4 && Math.abs(c.coords.lng - (point.lng ?? NaN)) < 1e-4,
    );
    if (cityPick && distanceKmBetween(SERVICE_AREA.lat, SERVICE_AREA.lng, cityPick.coords.lat, cityPick.coords.lng) <= HOME_CITY_KM) {
      return fullyServiceable();
    }
  }
  // Launch geofence FIRST. A resolved point outside the service area is out of
  // zone, full stop — before any backend call or fail-open default.
  if (point.lat != null && point.lng != null) {
    const d = distanceKmBetween(SERVICE_AREA.lat, SERVICE_AREA.lng, point.lat, point.lng);
    if (d > SERVICE_AREA.radiusKm) return outOfZone(d);
  }
  if (!isBackendConfigured()) {
    return { serviceable: true, standard: true, instant: true, storeName: `PYAAS ${SERVICE_AREA.label}`, monsoonRupees: 0, instantClosed: false, instantResumesLabel: null, reason: null, distanceKm: null };
  }
  const q = new URLSearchParams();
  if (point.lat != null) q.set('lat', String(point.lat));
  if (point.lng != null) q.set('lng', String(point.lng));
  if (point.pincode) q.set('pincode', point.pincode);
  const qs = q.toString();
  const res = await api.get<RawServiceability>(`/serviceability${qs ? `?${qs}` : ''}`);
  return normalize(res);
}

/**
 * Join the launch waitlist for an out-of-zone point → `POST /consumer/waitlist`.
 * No-ops (resolves) with no backend so the "Notify me" success state still works
 * in the local demo.
 */
export async function joinWaitlist(input: { phone: string | null; lat: number | null; lng: number | null; pincode: string | null }): Promise<void> {
  if (!isBackendConfigured()) return;
  await api.post('/waitlist', {
    phone: input.phone ?? undefined,
    lat: input.lat ?? undefined,
    lng: input.lng ?? undefined,
    pincode: input.pincode ?? undefined,
  });
}

/** Resolve the best delivery point we know for the signed-in member. */
async function resolvePoint(): Promise<Required<CheckPoint> & { signature: string }> {
  let lat: number | null = null;
  let lng: number | null = null;
  let pincode: string | null = null;
  let cityPick = false;

  // 1) The member's explicitly chosen delivery location (a GPS fix or a city
  //    picked in the location gate on Home) is the source of truth. Only THIS
  //    source can flag a city-centroid pick — the fallbacks below reuse the
  //    same coordinates without the member ever having chosen them.
  const ul = currentUserLoc();
  if (ul) {
    lat = ul.coords.lat; lng = ul.coords.lng;
    cityPick = CITIES.some((c) => Math.abs(c.coords.lat - ul.coords.lat) < 1e-4 && Math.abs(c.coords.lng - ul.coords.lng) < 1e-4);
  }

  const uid = await getUserId();
  if (uid) {
    try {
      const rows = await getRows<Address & { lat?: number | null; lng?: number | null }>('addresses', uid);
      const def = rows.find((a) => a.is_default) ?? rows[0];
      // 2) Fall back to a saved delivery-address coordinate (returning member).
      //    Only attach that address's pincode when we ALSO adopt its coordinates —
      //    otherwise we'd send the chosen location's coords with an unrelated
      //    address's pincode and mis-resolve serviceability.
      if (def && (lat == null || lng == null) && def.lat != null && def.lng != null) {
        lat = def.lat; lng = def.lng; pincode = def.pincode || null;
      }
    } catch { /* fall through to default */ }
  }
  // 3) Last resort — the default region. GPS is requested ONLY via the location
  //    gate (explicit "Use my location"), never silently here, so the shop never
  //    nags for permission on every Home focus.
  if (lat == null || lng == null) { lat = DEFAULT_REGION.lat; lng = DEFAULT_REGION.lng; }

  return { lat, lng, pincode: pincode ?? '', cityPick, signature: `${lat},${lng},${pincode ?? ''},${cityPick ? 'c' : ''}` };
}

// ── Module snapshot ──────────────────────────────────────────────────────────
// A non-hook mirror of the last-known result so the data layer (placeOrder) can
// guard checkout without pulling in React. `serviceable: null` = unknown → the
// guard treats it as serviceable (fail-open).
type Snapshot = { serviceable: boolean | null; instant: boolean; monsoonRupees: number; instantClosed: boolean };
let snapshot: Snapshot = { serviceable: null, instant: true, monsoonRupees: 0, instantClosed: false };
export function getServiceabilitySnapshot(): Snapshot {
  return snapshot;
}

// ── Store ────────────────────────────────────────────────────────────────────
type ServiceabilityState = {
  loading: boolean;
  /** null until the first check resolves — the home shows its skeleton while null. */
  serviceable: boolean | null;
  standard: boolean;
  instant: boolean;
  storeName: string | null;
  monsoonRupees: number;
  instantClosed: boolean;
  instantResumesLabel: string | null;
  /** Natural "why we don't serve here yet" line + distance for the Coming-Soon screen. */
  reason: string | null;
  distanceKm: number | null;
  checkedAt: string | null;
  /** Coordinates/pincode the last check ran against (for the waitlist POST). */
  lat: number | null;
  lng: number | null;
  pincode: string | null;
  /** Re-run against the current default-address / device point. Cached: a repeat
   *  call for the same point is a no-op unless `force` is set. */
  check: (opts?: { force?: boolean }) => Promise<void>;
};

let lastSignature: string | null = null;
let inFlight: Promise<void> | null = null;
// LATEST-WINS: every run takes a ticket; only the newest run may write state.
// Without this, a forced check (new pin) racing a slow unforced one (old
// point's backend round-trip) could interleave — coords from one run, verdict
// from the other — which is exactly the stale-pair the home popup guards on.
let runSeq = 0;

/**
 * Sign-out reset: the module cache, snapshot and store all outlive the session
 * object, so without this the FIRST check after a different account signs in
 * short-circuits on the previous account's signature and inherits its verdict
 * (a tester's lifted fence leaking to a real member, or vice versa).
 */
export function resetServiceability(): void {
  lastSignature = null;
  inFlight = null;
  runSeq += 1; // orphan any in-flight run so it can't write post-reset
  snapshot = { serviceable: null, instant: true, monsoonRupees: 0, instantClosed: false };
  useServiceability.setState({
    loading: false,
    serviceable: null,
    standard: true,
    instant: true,
    storeName: null,
    monsoonRupees: 0,
    instantClosed: false,
    instantResumesLabel: null,
    reason: null,
    distanceKm: null,
    checkedAt: null,
    lat: null,
    lng: null,
    pincode: null,
  });
}

export const useServiceability = create<ServiceabilityState>((set, get) => ({
  loading: false,
  serviceable: null,
  standard: true,
  instant: true,
  storeName: null,
  monsoonRupees: 0,
  instantClosed: false,
  instantResumesLabel: null,
  reason: null,
  distanceKm: null,
  checkedAt: null,
  lat: null,
  lng: null,
  pincode: null,
  check: async (opts) => {
    const force = !!opts?.force;
    // Single-flight: overlapping checks (boot + focus) share one request.
    if (inFlight && !force) return inFlight;

    const myRun = ++runSeq;
    // Only the newest ticket may touch state — a superseded run's writes are
    // dropped wholesale, so coords and verdict always describe the SAME point.
    const fresh = () => myRun === runSeq;

    const run = (async () => {
      const point = await resolvePoint();
      if (!fresh()) return;
      // Cache: same point + already resolved → skip the round-trip unless forced.
      if (!force && lastSignature === point.signature && get().serviceable !== null) return;

      set({ loading: true, lat: point.lat, lng: point.lng, pincode: point.pincode || null });
      try {
        const s = await getServiceability(point);
        if (!fresh()) return;
        lastSignature = point.signature;
        snapshot = { serviceable: s.serviceable, instant: s.instant, monsoonRupees: s.monsoonRupees, instantClosed: s.instantClosed };
        set({
          loading: false,
          serviceable: s.serviceable,
          standard: s.standard,
          instant: s.instant,
          storeName: s.storeName,
          monsoonRupees: s.monsoonRupees,
          instantClosed: s.instantClosed,
          instantResumesLabel: s.instantResumesLabel,
          reason: s.reason,
          distanceKm: s.distanceKm,
          checkedAt: new Date().toISOString(),
        });
      } catch {
        if (!fresh()) return;
        // FAIL-OPEN: a blip must never gate a paying user out. Treat as fully
        // serviceable, and DON'T cache the signature so the next check retries.
        lastSignature = null;
        snapshot = { serviceable: true, instant: true, monsoonRupees: 0, instantClosed: false };
        set({
          loading: false,
          serviceable: true,
          standard: true,
          instant: true,
          monsoonRupees: 0,
          instantClosed: false,
          instantResumesLabel: null,
          reason: null,
          distanceKm: null,
          checkedAt: new Date().toISOString(),
        });
      }
    })();

    const tracked = run.finally(() => { if (inFlight === tracked) inFlight = null; });
    inFlight = tracked;
    return tracked;
  },
}));
