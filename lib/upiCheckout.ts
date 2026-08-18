import { Linking } from 'react-native';

/**
 * WebView navigation gate for Razorpay checkout. When the member picks a UPI
 * app (PhonePe / GPay / Paytm) inside checkout, Razorpay navigates to a
 * `upi:` / `intent:` / app-scheme deep link. With `originWhitelist={['*']}`
 * the WebView would try to load that non-http URL INTERNALLY (it stalls /
 * shows blank), so the UPI app never opens. We hand every non-http(s) scheme
 * to the OS via Linking so the chosen app launches, and keep
 * http(s)/about/data/blob in the WebView (Razorpay's own pages + assets).
 *
 * Shared by app/recharge.tsx and app/payment.tsx so both checkout surfaces
 * behave identically — payment.tsx previously lacked this and stalled on UPI.
 */
export function handleCheckoutNavigation(req: { url?: string }): boolean {
  const url = req?.url ?? '';
  if (!url || /^(https?:|about:|data:|blob:)/i.test(url)) return true;
  if (/^intent:/i.test(url)) {
    // RN's Linking builds Intent(ACTION_VIEW, Uri.parse(url)) and never uses
    // Intent.parseUri, so an Android `intent://…#Intent;…;end` link resolves
    // no activity and the UPI app silently never opens. Rebuild the plain
    // scheme URL from the intent wrapper (falling back to the embedded
    // browser_fallback_url) so the chosen app actually launches.
    const m = /^intent:\/\/?([^#]*)#Intent;([^]*?);?end/i.exec(url);
    if (m) {
      const body = m[1];
      const meta = m[2];
      const scheme = /(?:^|;)scheme=([^;]+)/.exec(meta)?.[1];
      const fallback = /(?:^|;)S\.browser_fallback_url=([^;]+)/.exec(meta)?.[1];
      const openFallback = () => {
        if (fallback) Linking.openURL(decodeURIComponent(fallback)).catch(() => { /* stay in sheet */ });
      };
      if (scheme) Linking.openURL(`${scheme}://${body}`).catch(openFallback);
      else openFallback();
    }
    return false; // never let the WebView try to load intent: itself
  }
  Linking.openURL(url).catch(() => { /* no app for this scheme — stay in sheet */ });
  return false;
}
