import { NativeModules } from 'react-native';
import { api, isBackendConfigured } from './apiClient';

/**
 * Razorpay wallet top-up (WebView Standard Checkout, no native module — keeps
 * the app Expo/OTA-friendly via react-native-webview).
 *
 * SECURITY MODEL (read before shipping real money):
 *  - The key_id below is PUBLIC; it ships inside every Razorpay checkout. That
 *    is fine to keep in the client.
 *  - The key_SECRET must live ONLY on the server. A trustworthy top-up needs the
 *    backend to (1) CREATE the order so the amount is bound server-side (a
 *    tampered client cannot pay Rs1 for a Rs299 top-up) and (2) VERIFY the
 *    signature HMAC_SHA256(order_id + '|' + payment_id, key_secret) before it
 *    credits the ledger. The client success handler is only a hint and is
 *    trivially spoofable, so it must NEVER credit real money on its own in prod.
 *  - This is a LIVE key => real charges. In dev, override it with a TEST key via
 *    EXPO_PUBLIC_RAZORPAY_KEY_ID so you never move real money while testing.
 */
// NO fallback key. A hardcoded live key here meant every build — including a
// developer's laptop and any misconfigured release — could move real money.
// Empty means "not configured": callers must refuse to open checkout rather
// than fall back to someone's production account.
export const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? '';

/** True when a real gateway key is present. Checkout must not open without it. */
export function isRazorpayConfigured(): boolean {
  return RAZORPAY_KEY_ID.length > 0;
}

/**
 * TEST top-up mode. When EXPO_PUBLIC_WALLET_TEST_TOPUP=true the "Add money"
 * screen credits the wallet DIRECTLY (no Razorpay), so testing works before the
 * payment gateway is wired. Backend-gated: only credits when the server runs in
 * dev mode (OTP_DEV_MODE). Flip this off + set real Razorpay keys for production.
 */
export const WALLET_TEST_TOPUP = process.env.EXPO_PUBLIC_WALLET_TEST_TOPUP === 'true';

/** TEST-ONLY: credit the wallet directly via the dev top-up endpoint. */
export async function testTopup(rupees: number): Promise<{ credited: boolean }> {
  const ref = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await api.post('/wallet/topup', { amount: rupees, method: 'test', ref });
  return { credited: true };
}

export type TopupOrder = { orderId?: string; keyId: string; amountPaise: number };

export type CheckoutResult = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

/** Ask the backend to create a Razorpay order (binds the amount). Falls back to
 *  an order-less checkout when no backend is configured — demo only, since an
 *  order-less payment cannot be server-verified. */
export async function createTopupOrder(amountPaise: number): Promise<TopupOrder> {
  if (isBackendConfigured()) {
    const r = await api.post<{ orderId: string; keyId?: string }>('/wallet/order', { amountPaise });
    return { orderId: r.orderId, keyId: r.keyId ?? RAZORPAY_KEY_ID, amountPaise };
  }
  return { keyId: RAZORPAY_KEY_ID, amountPaise };
}

/** Verify a completed payment server-side (authoritative) before crediting.
 *  With no backend we cannot verify, so the caller treats client success as a
 *  provisional demo credit (see the security note above). */
export async function verifyTopup(r: CheckoutResult): Promise<{ verified: boolean; balance?: number }> {
  if (isBackendConfigured()) {
    try {
      return await api.post<{ verified: boolean; balance?: number }>('/wallet/verify', r);
    } catch {
      return { verified: false };
    }
  }
  // No backend: the client success handler is trivially spoofable and there is
  // no signature to check, so we CANNOT assert this payment happened. Returning
  // true here credited real balance off an unverified client claim.
  return { verified: false };
}

/** Whether the wallet credit is authoritative on the server (backend present)
 *  or must be applied locally for the offline demo. */
export function creditIsServerSide(): boolean {
  return isBackendConfigured();
}

// ── Multi-method native checkout (react-native-razorpay) ─────────────────────
/**
 * PYAAS uses TWO Razorpay surfaces, tried in this order by the recharge screen:
 *
 *   1. NATIVE Standard Checkout (react-native-razorpay). Only available in a
 *      DEV/PROD BUILD that bundled the native module. Its sheet natively
 *      surfaces UPI-intent (deep-links straight into GPay / PhonePe / Paytm /
 *      CRED), cards, netbanking, wallets and QR — the best UX. Unlocked by:
 *        (a) `npm i react-native-razorpay` + `npx expo run:android` (dev build), and
 *        (b) a real EXPO_PUBLIC_RAZORPAY_KEY_ID.
 *   2. WebView Standard Checkout (checkoutHtml, below) — the OTA-friendly
 *      fallback that still shows the REAL Razorpay sheet without any native
 *      module (used today in Expo Go / before a rebuild).
 *   3. MOCK success — dev-only, when neither a native sheet nor a real gateway
 *      is wired. Resolves against the existing /wallet/order + /wallet/verify
 *      test path so the wallet-credit loop is fully exercisable offline.
 *
 * `openCheckout` owns paths (1) and (3): it drives the native sheet when the
 * module is present and otherwise resolves a mock success, so it is a complete
 * black-box a caller can `await` anywhere. The recharge screen inserts path (2)
 * (the WebView) between them for a real sheet without a native build.
 */
export type CheckoutPrefill = { name?: string; email?: string; contact?: string };

export type CheckoutParams = {
  /** Amount in paise (server-bound via /wallet/order — never trust the client). */
  amountPaise: number;
  /** Razorpay order id from POST /wallet/order (binds the amount server-side). */
  orderId?: string;
  description?: string;
  prefill?: CheckoutPrefill;
  /** Optional method hint ('upi' | 'card' | 'netbanking' | 'wallet') to pre-focus. */
  method?: string;
  /** Checkout sheet accent (defaults to PYAAS pink). */
  themeColor?: string;
};

/** Result of an openCheckout attempt. `cancelled` = user backed out (retryable,
 *  never a double-charge); `failed` = a real error to surface. */
export type CheckoutOutcome =
  | { status: 'success'; result: CheckoutResult; mock?: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

type RazorpayNative = {
  open(options: Record<string, unknown>): Promise<{
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }>;
};

let nativeCache: RazorpayNative | null | undefined;

/**
 * Load the react-native-razorpay JS wrapper IFF (a) the package is installed and
 * (b) its native module is linked (a dev build). In Expo Go / before a rebuild
 * `NativeModules.RazorpayCheckout` is undefined, so we return null and callers
 * fall back to the WebView / mock path. The require is optional (metro.config
 * `allowOptionalDependencies`) so the bundle builds fine when the package is
 * absent. Result is memoised.
 */
function loadNativeRazorpay(): RazorpayNative | null {
  if (nativeCache !== undefined) return nativeCache;
  nativeCache = null;
  // Gate on the native bridge first — merely importing the JS wrapper without a
  // linked native module would throw at .open() time, so this avoids that.
  if (!NativeModules || !(NativeModules as { RazorpayCheckout?: unknown }).RazorpayCheckout) {
    return nativeCache;
  }
  try {
    // Optional native dependency; only present after a dev build (see header).
    const mod = require('react-native-razorpay') as { default?: RazorpayNative } & RazorpayNative;
    const RC = mod?.default ?? mod;
    if (RC && typeof RC.open === 'function') nativeCache = RC;
  } catch {
    nativeCache = null;
  }
  return nativeCache;
}

/** True when the real NATIVE Razorpay sheet can open (dev build + module linked). */
export function isNativeCheckoutAvailable(): boolean {
  return !!loadNativeRazorpay();
}

/** Synthesise a mock payment reference for the offline / no-gateway dev path. */
function mockResult(orderId?: string): CheckoutResult {
  const id = `pay_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { razorpay_payment_id: id, razorpay_order_id: orderId, razorpay_signature: undefined };
}

/**
 * Open a Razorpay checkout and resolve the outcome. Uses the NATIVE sheet when
 * available (real multi-method UPI-intent / cards / netbanking / wallets / QR),
 * else resolves a MOCK success (dev fallback — verified against the existing
 * /wallet/verify test path by the caller). Never throws: a user cancel maps to
 * `{ status: 'cancelled' }` (retryable, no double-charge); a gateway error to
 * `{ status: 'failed' }`.
 */
export async function openCheckout(params: CheckoutParams): Promise<CheckoutOutcome> {
  const native = loadNativeRazorpay();
  if (!native) {
    // No native sheet in this runtime → mock success so the credit loop still
    // completes end-to-end in dev. Real money never moves here (there is no
    // gateway); the screen documents that a dev build + key unlock the sheet.
    return { status: 'success', result: mockResult(params.orderId), mock: true };
  }
  const options: Record<string, unknown> = {
    key: RAZORPAY_KEY_ID,
    amount: params.amountPaise,
    currency: 'INR',
    name: 'PYAAS',
    description: params.description ?? 'Wallet top-up',
    prefill: params.prefill ?? {},
    theme: { color: params.themeColor ?? '#F36CB5' },
    ...(params.orderId ? { order_id: params.orderId } : {}),
    ...(params.method ? { method: params.method } : {}),
  };
  try {
    const data = await native.open(options);
    return {
      status: 'success',
      result: {
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_order_id: data.razorpay_order_id,
        razorpay_signature: data.razorpay_signature,
      },
    };
  } catch (e: unknown) {
    // react-native-razorpay rejects with { code, description }. Codes 0
    // (payment cancelled) and 2 (network / TLS at the sheet) with a "cancel"
    // description are user-dismissals — retryable, no charge.
    const err = e as { code?: number; description?: string; message?: string } | undefined;
    const desc = err?.description || err?.message || 'Payment failed';
    if (err?.code === 0 || /cancel/i.test(String(desc))) return { status: 'cancelled' };
    return { status: 'failed', error: String(desc) };
  }
}

/** Build the self-contained Razorpay checkout page loaded inside a WebView. */
export function checkoutHtml(opts: {
  keyId: string;
  amountPaise: number;
  orderId?: string;
  name?: string;
  email?: string;
  contact?: string;
  themeColor?: string;
}): string {
  const { keyId, amountPaise, orderId, name = '', email = '', contact = '', themeColor = '#E8491D' } = opts;
  const options = {
    key: keyId,
    amount: amountPaise,
    currency: 'INR',
    name: 'PYAAS',
    description: 'Wallet top-up',
    ...(orderId ? { order_id: orderId } : {}),
    prefill: { name, email, contact },
    theme: { color: themeColor },
  };
  const json = JSON.stringify(options).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="margin:0;background:#FFF6EC;font-family:-apple-system,system-ui,sans-serif;">
<script>
  function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  var options = ${json};
  options.handler = function(r){ post({ type:'success', razorpay_payment_id:r.razorpay_payment_id, razorpay_order_id:r.razorpay_order_id, razorpay_signature:r.razorpay_signature }); };
  options.modal = { ondismiss: function(){ post({ type:'dismiss' }); } };
  try {
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(resp){ post({ type:'failed', error: (resp && resp.error) ? resp.error.description : 'Payment failed' }); });
    rzp.open();
  } catch(e){ post({ type:'failed', error: String(e) }); }
</script>
</body></html>`;
}
