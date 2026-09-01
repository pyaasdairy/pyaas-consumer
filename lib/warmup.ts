/**
 * Backend warm-up ping.
 *
 * The production API sleeps on Render's free tier and cold-boots in ~30-60s;
 * whatever request happens to arrive first eats that entire boot (measured
 * 33s TTFB on /catalog against a cold instance, 0.3-1.8s warm). Firing a
 * fire-and-forget GET /healthz (server root, unauthenticated, no DB work) the
 * moment the app opens moves the boot to the seconds the member is already
 * spending on the splash / consent / typing their number — by the time a real
 * call goes out (OTP, wallet, catalog) the server is awake.
 *
 * Throttled so foreground flaps don't spam; failures are silent (every real
 * call carries its own timeout + fallback). This is a mitigation, not the fix:
 * the fix is moving Render to an always-on plan, after which this ping is a
 * single cheap request per session and can be deleted.
 */

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
// healthz lives at the SERVER ROOT, not under /api/v1/consumer.
const ORIGIN = API_URL.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
const WARM_MIN_INTERVAL_MS = 10 * 60 * 1000;

let lastWarm = 0;

/** Fire-and-forget wake-up call. Safe to call from anywhere, any number of times. */
export function warmBackend(): void {
  if (!ORIGIN || !/^https?:\/\//i.test(ORIGIN)) return;
  const now = Date.now();
  if (now - lastWarm < WARM_MIN_INTERVAL_MS) return;
  lastWarm = now;
  fetch(`${ORIGIN}/healthz`).catch(() => {
    /* wake-up only — the app never depends on this answering */
  });
}
