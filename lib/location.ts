import * as Location from 'expo-location';
import { supabase } from './supabase';

/**
 * LOCATION BACKDOOR - keeps the consumer app and rider app in sync on
 * coordinates without a paid maps key.
 *
 *  • rider → consumer: rider_update_location() mirrors onto riders.current_lat/lng
 *    (already live; the tracking screen reads it).
 *  • consumer → backend: device GPS + saved-address coords are written to
 *    addresses.lat/lng and carried onto orders, so the rider app always has a
 *    destination coordinate.
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

/** Persist coordinates onto a saved address (consumer → backend sync). */
export async function setAddressCoords(addressId: string, c: Coords): Promise<void> {
  await supabase.from('addresses').update({ lat: c.lat, lng: c.lng }).eq('id', addressId);
}

/**
 * Best-known coordinate for the signed-in user: live GPS if granted, else the
 * most recent saved-address coordinate, else the default region. Used by the
 * Farm Locator and anywhere the app needs "where is this customer".
 */
export async function getUserCoords(): Promise<Coords> {
  const device = await getDeviceCoords();
  if (device) return device;
  const { data } = await supabase
    .from('addresses')
    .select('lat, lng')
    .not('lat', 'is', null)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.lat != null && data?.lng != null) return { lat: data.lat, lng: data.lng };
  return DEFAULT_REGION;
}
