import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * On-device fallback data store (AsyncStorage). Used when the PARAG NestJS
 * backend is not configured (EXPO_PUBLIC_API_URL empty), so the app runs and
 * demos fully offline. Each table is a JSON array keyed by owner (user id) so
 * data is naturally scoped per signed-in account, mirroring how the API scopes
 * every query by the JWT's user id. When the real backend is wired in, the data
 * layer prefers apiClient and these functions become the offline path only.
 */

function key(table: string, ownerId: string): string {
  return `parag:${table}:${ownerId}`;
}

/** Simple unique id for locally-created rows. */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getRows<T>(table: string, ownerId: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key(table, ownerId));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export async function setRows<T>(table: string, ownerId: string, rows: T[]): Promise<void> {
  await AsyncStorage.setItem(key(table, ownerId), JSON.stringify(rows));
}

export async function insertRow<T extends object>(table: string, ownerId: string, row: T): Promise<T> {
  const rows = await getRows<T>(table, ownerId);
  rows.push(row);
  await setRows(table, ownerId, rows);
  return row;
}

export async function updateRows<T>(
  table: string,
  ownerId: string,
  match: (row: T) => boolean,
  patch: Partial<T>,
): Promise<void> {
  const rows = await getRows<T>(table, ownerId);
  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    if (match(rows[i])) {
      rows[i] = { ...rows[i], ...patch };
      changed = true;
    }
  }
  if (changed) await setRows(table, ownerId, rows);
}

export async function deleteRows<T>(table: string, ownerId: string, match: (row: T) => boolean): Promise<void> {
  const rows = await getRows<T>(table, ownerId);
  const next = rows.filter((r) => !match(r));
  if (next.length !== rows.length) await setRows(table, ownerId, next);
}

/** Single-row tables (profile, wallet, delivery prefs). */
export async function getSingle<T>(table: string, ownerId: string): Promise<T | null> {
  const rows = await getRows<T>(table, ownerId);
  return rows[0] ?? null;
}

export async function putSingle<T extends object>(table: string, ownerId: string, row: T): Promise<void> {
  await setRows(table, ownerId, [row]);
}
