/**
 * Notifications & messaging - PLAN + PLACEHOLDER.
 *
 * Two channels, one provider where possible:
 *
 *  1) LOGIN OTP  → Supabase Phone Auth (signInWithOtp/verifyOtp, see app/(auth)/otp.tsx)
 *     backed by an SMS provider via a Supabase **SMS Hook** (Edge Function).
 *     Recommended provider: **MSG91** (India, DLT-compliant, ~₹0.15/OTP, free
 *     trial credits). It also sends transactional SMS + WhatsApp, so the SAME
 *     account covers order/pickup messages below.
 *
 *  2) ORDER / PICKUP UPDATES ("milk picked up", "out for delivery", "delivered")
 *     → transactional SMS (MSG91) AND/OR push.
 *     - SMS: triggered SERVER-SIDE by a Supabase DB webhook / Edge Function on
 *       `orders.status` change (or by the rider/ops app). Templates must be
 *       DLT-registered. The consumer app does NOT send these.
 *     - Push: expo-notifications (needs install + a dev/standalone build + APNs
 *       key). `registerForPush()` below is the client side; store the token in
 *       the `device_tokens` table (cols: user_id, token, platform) and have the
 *       server push on status change.
 *
 * Nothing here is wired yet - these are typed stubs so the app compiles and the
 * integration points are clear. See DEVELOPER_NOTES.md §"Notifications".
 */

const TODO = '[notifications-placeholder]';

export const NOTIFICATIONS_CONFIGURED = false;

/**
 * Register the device for push (placeholder). Real impl:
 *   import * as Notifications from 'expo-notifications';
 *   const { status } = await Notifications.requestPermissionsAsync();
 *   const token = (await Notifications.getExpoPushTokenAsync()).data;
 *   await supabase.from('device_tokens').upsert({ user_id, token, platform });
 * Requires installing expo-notifications + a rebuild.
 */
export async function registerForPush(): Promise<string | null> {
  console.warn(`${TODO} registerForPush() - install expo-notifications + store the token server-side`);
  return null;
}

/** Status → customer-facing message copy (used by the server-side SMS/push job). */
export function statusMessage(status: string): string {
  switch (status) {
    case 'out_for_delivery': return 'Your PYAAS milk is out for delivery.';
    case 'delivered': return 'Delivered! Enjoy your fresh PYAAS milk.';
    case 'assigned': return 'A rider has picked up your order.';
    default: return 'Your PYAAS order was updated.';
  }
}
