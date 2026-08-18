import * as Location from 'expo-location';
import { getUserId } from './session';
import { getRows, updateRows, getSingle } from './localStore';
import type { Address } from './api';
import { api, isBackendConfigured } from './apiClient';

/**
 * Location helper. Reads device GPS (for the delivery address) and remembers the
 * chosen coordinate on the saved address so the future rider app always has a
 * destination. No paid maps key needed.
 */

// Fallback region (Lucknow) used before any GPS / address coordinate exists.
export const DEFAULT_REGION = { lat: 26.8467, lng: 80.9462 };

export type Coords = { lat: number; lng: number };

/** Ask for permission + read the current device GPS coordinate.
 *  MUST only be called from an explicit user action that was immediately
 *  preceded by the LocationDisclosure sheet (Play prominent-disclosure rule) —
 *  never automatically on screen open. */
export async function getDeviceCoords(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Read the device GPS ONLY if permission is already granted — never prompts.
 *  Safe for automatic conveniences (e.g. centering a map on open): a member
 *  who has not yet agreed to the location disclosure sees no OS dialog. */
export async function getDeviceCoordsIfGranted(): Promise<Coords | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Whether the member has an EXACT delivery point on file — a saved address with
 * coordinates, OR a delivery location they set precisely (map pin / device GPS).
 * A subscription must never start without one, so the rider always has a door to
 * reach. (A city picked from the list is NOT exact — it does not satisfy this.)
 */
export async function hasExactLocation(): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  const addrs = await getRows<Address & { lat?: number | null; lng?: number | null }>('addresses', uid);
  if (addrs.some((a) => a.lat != null && a.lng != null)) return true;
  // A chosen delivery location counts as exact when it's a precise point (device
  // GPS, a dropped map pin, or a geocoded SEARCHED address) — flagged `exact`.
  // A city centroid picked from the list is NOT exact.
  const row = await getSingle<{ loc: { exact?: boolean; coords?: Coords } | null }>('user_location', uid).catch(() => null);
  return row?.loc?.exact === true && !!row?.loc?.coords;
}

/** Persist coordinates onto a saved address (and its backend twin, so the DB
 *  copy carries the exact pin the store routing + subscription worker read). */
export async function setAddressCoords(addressId: string, c: Coords): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  await updateRows<Address>('addresses', uid, (r) => r.id === addressId, { lat: c.lat, lng: c.lng } as Partial<Address>);
  if (isBackendConfigured()) {
    const bid = (await getRows<Address>('addresses', uid)).find((r) => r.id === addressId)?.backend_id;
    if (bid) {
      // Awaited (error-soft): the pin must land server-side before a following
      // subscription mirror asks the backend for an address WITH coordinates.
      await api.patch(`/addresses/${bid}`, { lat: c.lat, lng: c.lng }).catch(() => undefined);
    }
  }
}

/**
 * Best-known coordinate for the signed-in user: live GPS if granted, else the
 * most recent saved-address coordinate, else the default region.
 */
export async function getUserCoords(): Promise<Coords> {
  // NEVER prompts. This feeds AUTOMATIC map centering (rider tracking mounts
  // it from an effect), and the OS permission dialog may only ever follow the
  // in-app LocationDisclosure plus an explicit user tap — the Play
  // prominent-disclosure rule this app was previously enforced against. A
  // granted permission is used; anything else falls to saved-address coords.
  const device = await getDeviceCoordsIfGranted();
  if (device) return device;
  const uid = await getUserId();
  if (uid) {
    const rows = await getRows<Address & { lat?: number | null; lng?: number | null }>('addresses', uid);
    const withCoords = rows
      .filter((a) => a.lat != null && a.lng != null)
      .sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1));
    const a = withCoords[0];
    if (a?.lat != null && a?.lng != null) return { lat: a.lat, lng: a.lng };
  }
  return DEFAULT_REGION;
}
