import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api, isBackendConfigured } from './apiClient';
import { logDiag } from './diag';

/**
 * OS NOTIFICATIONS — the thin, fail-soft seam over expo-notifications.
 *
 * WHY IT IS WRAPPED LIKE THIS: the module is a NATIVE one. A JS bundle that
 * imports it statically crashes on any binary that predates the install (Expo
 * Go, an older TestFlight build, a stale emulator APK). Everything here
 * therefore goes through a lazy `require` inside try/catch: on a binary without
 * the module every call becomes a no-op and the app behaves exactly as it did
 * before notifications existed. Nothing in the UI may branch on the module
 * being present — it branches on PERMISSION, which is a product question.
 *
 * WHAT THIS DOES TODAY (no server needed):
 *   - asks for permission at a moment the member can understand (never at boot)
 *   - posts LOCAL notifications the app itself decides to send: an instant
 *     order moving through its states, a morning delivery landing, a wallet
 *     that fell under the floor
 *   - keeps the Android channels a delivery app needs, so "order updates" can
 *     be loud and "offers" quiet, per the system settings the member controls
 *
 * WHAT THE BACKEND STILL OWES (co-dev — see the handoff):
 *   - POST /consumer/push/register { token, platform, device } to store the
 *     token minted below, and an FCM/APNs sender for pushes while the app is
 *     CLOSED (local notifications only fire while the process is alive).
 *   - the same trigger vocabulary as `NotificationKind` so an in-app row and a
 *     push describe one event.
 */

type PermissionResponse = { status: string; granted?: boolean; canAskAgain?: boolean };

type NotificationsModule = {
  getPermissionsAsync: () => Promise<PermissionResponse>;
  requestPermissionsAsync: () => Promise<PermissionResponse>;
  scheduleNotificationAsync: (input: unknown) => Promise<string>;
  setNotificationHandler: (handler: unknown) => void;
  setNotificationChannelAsync?: (id: string, channel: unknown) => Promise<unknown>;
  getExpoPushTokenAsync?: (opts?: unknown) => Promise<{ data: string }>;
  setBadgeCountAsync?: (n: number) => Promise<boolean>;
  dismissAllNotificationsAsync?: () => Promise<void>;
  addNotificationResponseReceivedListener?: (
    listener: (response: NotificationResponse) => void,
  ) => { remove: () => void };
  AndroidImportance?: Record<string, number>;
};

/** The slice of expo-notifications' NotificationResponse a tap handler reads. */
export type NotificationResponse = {
  notification?: { request?: { content?: { data?: Record<string, unknown> | null } } };
};

let cached: NotificationsModule | null | undefined;

/** The native module, or null on a binary that doesn't carry it. */
function mod(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when this binary can post notifications at all. */
export function notificationsSupported(): boolean {
  return mod() != null;
}

// ── Channels (Android) ───────────────────────────────────────────────────────
// One channel per REASON, so a member who mutes offers still hears the rider
// at the door. Names are user-visible in Android settings.
export const CHANNELS = {
  orders: 'orders',
  delivery: 'delivery',
  wallet: 'wallet',
  offers: 'offers',
} as const;
export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

let channelsReady = false;

export async function ensureChannels(): Promise<void> {
  const m = mod();
  if (!m || Platform.OS !== 'android' || channelsReady || !m.setNotificationChannelAsync) return;
  channelsReady = true;
  const HIGH = m.AndroidImportance?.HIGH ?? 4;
  const DEFAULT = m.AndroidImportance?.DEFAULT ?? 3;
  const LOW = m.AndroidImportance?.LOW ?? 2;
  const pink = '#F36CB5';
  try {
    await Promise.all([
      m.setNotificationChannelAsync(CHANNELS.orders, {
        name: 'Order updates', importance: HIGH, lightColor: pink, vibrationPattern: [0, 120, 80, 120],
        description: 'Live updates while an instant order is on its way.',
      }),
      m.setNotificationChannelAsync(CHANNELS.delivery, {
        name: 'Morning deliveries', importance: DEFAULT, lightColor: pink,
        description: 'Your 5-7:30 AM delivery, packed, on the way and delivered.',
      }),
      m.setNotificationChannelAsync(CHANNELS.wallet, {
        name: 'Wallet and payments', importance: DEFAULT, lightColor: pink,
        description: 'Low balance, recharges and refunds.',
      }),
      m.setNotificationChannelAsync(CHANNELS.offers, {
        name: 'Offers', importance: LOW, lightColor: pink,
        description: 'Occasional offers. Turn this off and your deliveries are unaffected.',
      }),
    ]);
  } catch {
    /* channels are a nicety — never block on them */
  }
}

/**
 * Foreground presentation: show order updates even while the app is open, the
 * way a delivery app does. Safe to call more than once.
 */
export function installForegroundHandler(): void {
  const m = mod();
  if (!m) return;
  try {
    m.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    /* older module shape — harmless */
  }
}

// ── Permission ───────────────────────────────────────────────────────────────
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permissionState(): Promise<PermissionState> {
  const m = mod();
  if (!m) return 'unsupported';
  try {
    const res = await m.getPermissionsAsync();
    if (res.granted || res.status === 'granted') return 'granted';
    // ANDROID NUANCE: POST_NOTIFICATIONS has no "not asked yet" state in this
    // API — a member who has never seen the dialog reads back as `denied` with
    // `canAskAgain: true`. Treating that as a hard denial sent first-time
    // members to their system settings for a switch they had never been
    // offered (caught on the emulator, 18 Sep). Only an un-askable denial is a
    // real one; everything else can still be asked.
    if (res.status === 'denied' && res.canAskAgain === false) return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for permission. Call this ONLY from an explicit member action (the
 * notifications screen's "Turn on updates", or right after they place their
 * first order) — never on launch, which is the pattern App Review flags and
 * which members reflexively decline.
 */
export async function requestPermission(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    await ensureChannels();
    const res = await m.requestPermissionsAsync();
    const granted = !!res.granted || res.status === 'granted';
    if (granted) installForegroundHandler();
    return granted;
  } catch {
    return false;
  }
}

// ── Posting ──────────────────────────────────────────────────────────────────
export type LocalNotice = {
  title: string;
  body: string;
  /** Which Android channel / which kind of update this is. */
  channel?: ChannelId;
  /** Deep-link route the tap should open ("/order/abc"). */
  href?: string;
  /** Extra payload for the tap handler. */
  data?: Record<string, unknown>;
};

/**
 * Post a notification NOW (local, no server). Resolves false when the module is
 * absent or permission isn't granted — callers ignore the result: the in-app
 * notification centre row is written either way, so the member never loses an
 * update just because the OS layer is unavailable.
 */
export async function notifyNow(n: LocalNotice): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    if ((await permissionState()) !== 'granted') return false;
    await ensureChannels();
    await m.scheduleNotificationAsync({
      content: {
        title: n.title,
        body: n.body,
        data: { href: n.href ?? null, ...(n.data ?? {}) },
        ...(Platform.OS === 'android' ? { channelId: n.channel ?? CHANNELS.orders } : {}),
      },
      trigger: null, // immediately
    });
    return true;
  } catch {
    return false;
  }
}

/** App-icon badge (iOS). No-ops elsewhere. */
export async function setBadge(count: number): Promise<void> {
  const m = mod();
  if (!m?.setBadgeCountAsync) return;
  try { await m.setBadgeCountAsync(Math.max(0, Math.round(count))); } catch { /* best-effort */ }
}

// -- Notification taps --------------------------------------------------------

/** The in-app href packed into a notification's data, or null. Every local
 *  notice carries one (notifyNow puts it under data.href); a server push that
 *  packs the same key lands on the same screen. */
export function hrefFromResponse(r: NotificationResponse | null | undefined): string | null {
  const href = r?.notification?.request?.content?.data?.href;
  return typeof href === 'string' && href.startsWith('/') ? href : null;
}

let tapHandlerInstalled = false;

/**
 * Route notification taps. Installed ONCE at boot by the root layout; the
 * returned function removes the listener (and re-arms the latch) on unmount.
 * No-op on a binary without the module.
 */
export function installTapHandler(onHref: (href: string) => void): () => void {
  const m = mod();
  if (!m?.addNotificationResponseReceivedListener || tapHandlerInstalled) return () => {};
  tapHandlerInstalled = true;
  try {
    const sub = m.addNotificationResponseReceivedListener((r) => {
      const href = hrefFromResponse(r);
      if (href) onHref(href);
    });
    return () => {
      tapHandlerInstalled = false;
      try { sub.remove(); } catch { /* already gone */ }
    };
  } catch {
    tapHandlerInstalled = false;
    return () => {};
  }
}

// ── Push token registration (the backend's half) ─────────────────────────────
// Per SESSION, not per process: the latch is reset by unregisterPush() on
// sign-out, so a second account on the same handset registers its own token
// instead of inheriting the first one's silence.
let registered = false;
/** The token minted this session; what sign-out unbinds (contract C2). */
let mintedToken: string | null = null;
/** Concurrent callers (boot + sign-in) share one registration. */
let registering: Promise<string | null> | null = null;
let projectIdWarned = false;

/** EAS project id from app config. Expo push tokens cannot be minted without
 *  it; `eas init` writes it. Never invented here. */
function easProjectId(): string | null {
  try {
    const id = Constants.expoConfig?.extra?.eas?.projectId as unknown;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Mint this device's push token and hand it to the backend. Fire-and-forget:
 * a 404 (endpoint not deployed yet) is the EXPECTED answer today and must be
 * silent. Returns the token so the diagnostics screen can show it.
 *
 * Without an EAS projectId in app config the mint would throw on every
 * device; that case is logged once to diagnostics and returns null.
 */
export function registerForPush(): Promise<string | null> {
  if (registering) return registering;
  registering = doRegister().finally(() => {
    registering = null;
  });
  return registering;
}

async function doRegister(): Promise<string | null> {
  const m = mod();
  if (!m?.getExpoPushTokenAsync || registered) return null;
  try {
    if ((await permissionState()) !== 'granted') return null;
    const projectId = easProjectId();
    if (!projectId) {
      if (!projectIdWarned) {
        projectIdWarned = true;
        logDiag({ kind: 'event', message: 'Push: no EAS projectId in app config (eas init pending); no token minted.' });
      }
      return null;
    }
    const { data: token } = await m.getExpoPushTokenAsync({ projectId });
    if (!token) return null;
    registered = true;
    mintedToken = token;
    if (isBackendConfigured()) {
      try {
        await api.post('/push/register', {
          token,
          platform: Platform.OS,
          provider: 'expo',
        });
      } catch {
        /* endpoint not live yet — the token is still valid for a later retry */
      }
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Sign-out (contract C2): tell the backend this device no longer belongs to
 * the account, and re-arm registration so the next sign-in mints and
 * registers afresh. Call BEFORE the session tokens are cleared (the DELETE is
 * authenticated). A 404 (older backend) or a dead network is tolerated: the
 * backend moves a token to its newest owner on the next register anyway.
 */
export async function unregisterPush(): Promise<void> {
  const token = mintedToken;
  registered = false;
  mintedToken = null;
  if (!token || !isBackendConfigured()) return;
  try {
    await api.del('/push/register', { token });
  } catch {
    /* best-effort */
  }
}
