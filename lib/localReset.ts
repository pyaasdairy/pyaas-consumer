import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ONE-TIME VERSIONED LOCAL RESET — never a per-launch wipe.
 *
 * Old builds leave stale local rows (pre-mirror addresses/subscriptions,
 * retired flags) that confuse flows after an update. On the FIRST launch of a
 * build whose LOCAL_DATA_VERSION differs from the stored one, this clears the
 * app's local data EXCEPT the session (the member stays signed in) and stamps
 * the new version. Nothing is re-seeded: in backend mode addresses and
 * subscriptions are read from the server (lib/api.listAddresses,
 * lib/subscriptions.listSubscriptions), so no local table stands in for
 * them. The cart and soft flags reset once; the wallet is server-read anyway;
 * the funnel flags re-derive from their server fallbacks (ledger / trial /
 * gold-sub).
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

// ── STRICT ONCE-ONLY GUARDS (three independent layers) ──────────────────────
// 1. PERSISTED: the stored VERSION_KEY — once stamped, every future launch of
//    this version is a read-and-return no-op.
// 2. PER-PROCESS: `resetRan` — even if the boot effect re-mounts within one
//    app session, the second call returns immediately without touching storage.
// 3. CONCURRENCY: `resetInFlight` — simultaneous callers (e.g. a double-fired
//    effect) share the SAME single run; two wipes can never race.
// There is exactly ONE call site (the root layout's boot effect) — this
// function must never be called from anywhere else.
let resetRan = false;
let resetInFlight: Promise<boolean> | null = null;

/** Run at boot. Returns true when a reset actually happened (first launch of
 *  this version); false on every later call — a fast no-op. Error-soft. */
export function runOneTimeLocalReset(): Promise<boolean> {
  if (resetRan) return Promise.resolve(false); // layer 2: once per process
  if (resetInFlight) return resetInFlight; // layer 3: concurrent callers share one run
  resetInFlight = (async () => {
    // Backend mode no longer writes the device-global free-pack claims table
    // (raw mobile numbers in cleartext). Drop what older builds left, once per
    // LOCAL_DATA_VERSION; a key delete, and independent of the wipe below so
    // it runs without bumping the version (which would also reset the cart).
    try {
      const { purgeFreePackClaimRows } = await import('./freePack');
      await purgeFreePackClaimRows(LOCAL_DATA_VERSION);
    } catch { /* retried on the next launch */ }
    try {
      const seen = await AsyncStorage.getItem(VERSION_KEY);
      if (seen === LOCAL_DATA_VERSION) return false; // layer 1: already done, forever
      const keys = await AsyncStorage.getAllKeys();
      const drop = keys.filter((k) => !PRESERVE.has(k));
      if (drop.length > 0) await AsyncStorage.multiRemove(drop);
      // Stamp IMMEDIATELY after the wipe — from this moment the reset can
      // never run again.
      await AsyncStorage.setItem(VERSION_KEY, LOCAL_DATA_VERSION);
      return true;
    } catch {
      return false; // never block boot on a storage blip
    } finally {
      resetRan = true; // the process latch closes no matter what
      resetInFlight = null;
    }
  })();
  return resetInFlight;
}
