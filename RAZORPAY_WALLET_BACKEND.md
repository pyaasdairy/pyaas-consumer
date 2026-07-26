# Razorpay wallet top-up — backend contract (apps/parag-api)

The app opens Razorpay Standard Checkout in a WebView (`lib/razorpay.ts`,
`app/payment.tsx`) and credits the wallet **only after a payment succeeds**.
For real money this MUST be server-verified. Two endpoints are required in
`apps/parag-api`. The client already calls them when `EXPO_PUBLIC_API_URL` is set;
with no backend it falls back to a provisional local credit (demo only).

Secrets (server-only, never in the app): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`.

## 1. `POST /wallet/order`  (auth required)
Body: `{ "amountPaise": 29900 }`
- Recompute/validate the amount server-side (never trust the client for money).
- Create a Razorpay order:
  `POST https://api.razorpay.com/v1/orders` with HTTP Basic auth
  (`key_id`:`key_secret`), body
  `{ amount, currency: "INR", receipt: "wallet_<uid>_<ts>", notes: { userId } }`.
- Return only `{ "orderId": "order_...", "keyId": "rzp_live_..." }`.

## 2. `POST /wallet/verify`  (auth required)
Body: `{ razorpay_payment_id, razorpay_order_id, razorpay_signature }`
- Recompute `HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET)`
  and compare to `razorpay_signature` with a **constant-time** compare.
- Confirm `order.notes.userId === caller` and the order amount matches.
- Only on match, INSERT one append-only `wallet_ledger` credit row with
  `razorpay_payment_id` **UNIQUE** (idempotency), inside a DB transaction.
- Return `{ "verified": true, "balance": <newBalancePaise> }` (or `verified:false`).

## 3. Webhook (belt-and-suspenders)
Register a `payment.captured` webhook, verify it against `RAZORPAY_WEBHOOK_SECRET`
over the raw body, and credit the same way. The UNIQUE `razorpay_payment_id`
guarantees the webhook and `/wallet/verify` cannot double-credit.

## Notes
- The client success handler is a hint only and is spoofable — the server verify
  is the source of truth.
- UPI-intent (GPay/PhonePe app-switch buttons) does not auto-work inside a
  WebView; steer users to UPI-collect/card, or intercept `upi:`/`intent:` URLs in
  the WebView's `onShouldStartLoadWithRequest` and `Linking.openURL` them.
