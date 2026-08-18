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
  Linking.openURL(url).catch(() => { /* no app for this scheme — stay in sheet */ });
  return false;
}
