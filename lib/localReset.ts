import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, isBackendConfigured } from './apiClient';
import { getUserId } from './session';
import { setRows, newId } from './localStore';
import type { Address } from './api';
import type { Subscription } from './subscriptions';

/**
 * ONE-TIME VERSIONED LOCAL RESET — never a per-launch wipe.
 *
 * Old builds leave stale local rows (pre-mirror addresses/subscriptions,
 * retired flags) that confuse flows after an update. On the FIRST launch of a
 * build whose LOCAL_DATA_VERSION differs from the stored one, this clears the
 * app's local data EXCEPT the session (the member stays signed in), stamps the
 * new version, and immediately RE-HYDRATES addresses + subscriptions from the
 * backend — so server truth survives and nothing user-critical is lost. The
 * cart and soft flags reset once; the wallet is server-read anyway; the funnel
 * flags re-derive from their server fallbacks (ledger / trial / gold-sub).
 *
 * Bump LOCAL_DATA_VERSION whenever shipped local-data semantics change enough
 * that stale rows would mislead the flows.
 */
export const LOCAL_DATA_VERSION = '2026-08-04.1';
const VERSION_KEY = 'pyaas_local_data_version';

// The member's LOGIN survives the reset: uid + account map + JWT pair.
// (SecureStore items — device id — live outside AsyncStorage already.)
const PRESERVE = new Set<string>([
  'parag_current_uid',
  'parag:accounts',
  'parag_access_token',
  'parag_refresh_token',
  VERSION_KEY,
]);

/** Run at boot. Returns true when a reset actually happened (first launch of
 *  this version); false on every later launch — a fast no-op. Error-soft. */
export async function runOneTimeLocalReset(): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(VERSION_KEY);
    if (seen === LOCAL_DATA_VERSION) return false;
    const keys = await AsyncStorage.getAllKeys();
    const drop = keys.filter((k) => !PRESERVE.has(k));
    if (drop.length > 0) await AsyncStorage.multiRemove(drop);
    await AsyncStorage.setItem(VERSION_KEY, LOCAL_DATA_VERSION);
    // Server truth back into the local cache — best-effort, each independent.
    try { await hydrateAddresses(); } catch { /* re-captured on next flow */ }
    try { await hydrateSubscriptions(); } catch { /* backend worker unaffected */ }
    return true;
  } catch {
    return false; // never block boot on a storage blip
  }
}

/** Pull the member's saved addresses (the DB copy) into the local cache, so
 *  the address gate still passes right after the reset. */
async function hydrateAddresses(): Promise<void> {
  if (!isBackendConfigured()) return;
  const uid = await getUserId();
  if (!uid) return;
  const remote = await api.get<Record<string, unknown>[]>('/addresses');
  const rows: Address[] = (remote ?? []).map((w) => ({
    id: newId('addr'),
    user_id: uid,
    label: (w.label as string) || 'Home',
    line1: (w.line1 as string) || '',
    line2: (w.line2 as string) || null,
    city: (w.city as string) || '',
    pincode: (w.pincode as string) || '',
    is_default: !!w.is_default,
    created_at: (w.created_at as string) || new Date().toISOString(),
    // The pin — what the address gate and store routing check.
    ...(typeof w.lat === 'number' && typeof w.lng === 'number' && !(w.lat === 0 && w.lng === 0)
      ? { lat: w.lat, lng: w.lng }
      : {}),
    backend_id: (w.id as string) || null,
  }) as Address);
  await setRows<Address>('addresses', uid, rows);
}

/** Pull the member's server-owned subscriptions into the local cache with
 *  their backend ids, so the UI lists them and the on-device sweep keeps
 *  skipping them (the server worker owns their orders). */
async function hydrateSubscriptions(): Promise<void> {
  if (!isBackendConfigured()) return;
  const uid = await getUserId();
  if (!uid) return;
  const remote = await api.get<Record<string, unknown>[]>('/subscriptions');
  const rows: Subscription[] = (remote ?? []).map((w) => ({
    id: (w.id as string) || newId('sub'),
    product_id: (w.product_id as string) || '',
    variant: (w.variant as string) || null,
    qty: typeof w.qty === 'number' && w.qty >= 1 ? (w.qty as number) : 1,
    unit_price: typeof w.unit_price === 'number' ? (w.unit_price as number) : 0,
    frequency: ((w.frequency as string) || 'daily') as Subscription['frequency'],
    delivery_slot: (w.delivery_slot as string) || null,
    pay_from_wallet: true,
    status: ((w.status as string) || 'active') as Subscription['status'],
    start_date: (w.start_date as string) || new Date().toISOString().slice(0, 10),
    next_delivery_date: (w.start_date as string) || null,
    created_at: (w.created_at as string) || new Date().toISOString(),
    backend_id: (w.id as string) || null,
  }));
  await setRows<Subscription>('subscriptions', uid, rows);
}
