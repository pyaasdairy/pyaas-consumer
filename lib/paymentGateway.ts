import { supabase } from './supabase';

/**
 * THE PAYMENT BACKDOOR · single switch to go live.
 *
 * Drop a real gateway key into EXPO_PUBLIC_RAZORPAY_KEY_ID (a rzp_test_… or
 * rzp_live_… key) and every payment surface automatically opens the real
 * Razorpay checkout instead of crediting in test mode. Nothing else changes:
 * the success path already lands on `creditWallet`, which is exactly where a
 * verified gateway callback belongs.
 *
 * Until a key is present the app runs in honest TEST MODE: the Pay action
 * credits the REAL Supabase wallet via the wallet_recharge RPC, so balance,
 * autopay, transactions and member pricing all behave for real. The only thing
 * deferred is the bank settlement itself.
 */
export const GATEWAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '';
export const LIVE_PAYMENTS = GATEWAY_KEY.length > 0;
export const PAYMENT_MODE: 'live' | 'test' = LIVE_PAYMENTS ? 'live' : 'test';

/** Credit the signed-in user's wallet by `amount` rupees. In live mode this is
 *  only invoked after a gateway success; in test mode it is the payment. */
export async function creditWallet(amount: number): Promise<void> {
  const { error } = await supabase.rpc('wallet_recharge', { p_amount: amount });
  if (error) throw error;
}
