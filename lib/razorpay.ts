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
export const RAZORPAY_KEY_ID =
  process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? 'rzp_live_T0LwnoiGRHGIGG';

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
  return { verified: true }; // demo (no backend): accept the client result
}

/** Whether the wallet credit is authoritative on the server (backend present)
 *  or must be applied locally for the offline demo. */
export function creditIsServerSide(): boolean {
  return isBackendConfigured();
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
