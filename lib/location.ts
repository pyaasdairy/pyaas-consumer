import * as Location from 'expo-location';
import { getUserId } from './session';
import { getRows, updateRows } from './localStore';
import type { Address } from './api';

/**
 * Location helper. Reads device GPS (for the delivery address) and remembers the
 * chosen coordinate on the saved address so the future rider app always has a
 * destination. No paid maps key needed.
 */

// Fallback region (Lucknow) used before any GPS / address coordinate exists.
export const DEFAULT_REGION = { lat: 26.8467, lng: 80.9462 };

export type Coords = { lat: number; lng: number };

/** Ask for permission + read the current device GPS coordinate. */
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

/** Persist coordinates onto a saved address. */
export async function setAddressCoords(addressId: string, c: Coords): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  await updateRows<Address>('addresses', uid, (r) => r.id === addressId, { lat: c.lat, lng: c.lng } as Partial<Address>);
}

/**
 * Best-known coordinate for the signed-in user: live GPS if granted, else the
 * most recent saved-address coordinate, else the default region.
 */
export async function getUserCoords(): Promise<Coords> {
  const device = await getDeviceCoords();
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
