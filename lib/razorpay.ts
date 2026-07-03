/**
 * Razorpay - PLACEHOLDER integration.
 *
 * Razorpay is NOT set up yet. These functions simulate the shape of the real
 * SDK/API so the wallet, autopay and checkout UI can be built and tested now,
 * then swapped for the real flow with minimal changes.
 *
 * Real flow (see DEVELOPER_NOTES.md §4):
 *   client → Edge Function creates a Razorpay order → Razorpay Checkout sheet →
 *   webhook (server, service_role) verifies signature → wallet_credit().
 * Never trust the client for "payment succeeded" in production.
 */

export type RazorpayOrder = {
  id: string;
  amount: number; // in paise, like the real API
  currency: 'INR';
  status: 'created';
};

export type RazorpayResult = {
  success: boolean;
  paymentId: string;
  orderId: string;
  signature: string;
};

export type RazorpayMandate = {
  id: string;
  status: 'created' | 'active';
  maxAmount: number;
  upiId?: string;
};

const TODO = '[razorpay-placeholder]';

function fakeId(prefix: string): string {
  // Deterministic-ish fake id; replace with real Razorpay ids.
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Placeholder: create a payment order. Real impl calls an Edge Function. */
export async function createOrder(amountInr: number): Promise<RazorpayOrder> {
  console.warn(`${TODO} createOrder(₹${amountInr}) - wire to Edge Function + Razorpay Orders API`);
  return { id: fakeId('order'), amount: Math.round(amountInr * 100), currency: 'INR', status: 'created' };
}

/** Placeholder: open Checkout and resolve as paid. Real impl uses react-native-razorpay. */
export async function openCheckout(order: RazorpayOrder): Promise<RazorpayResult> {
  // Hard stop: never let an UNCONFIGURED gateway report "paid". Callers must gate
  // their UI on RAZORPAY_CONFIGURED (checkout shows only Wallet + COD until live).
  if (!RAZORPAY_CONFIGURED) {
    throw new Error('Online payments are not available yet. Please use Cash on delivery or your PYAAS Wallet.');
  }
  console.warn(`${TODO} openCheckout(${order.id}) - replace with Razorpay Checkout sheet`);
  return { success: true, paymentId: fakeId('pay'), orderId: order.id, signature: fakeId('sig') };
}

/** Placeholder: one-shot helper used by wallet recharge UI. */
export async function payAmount(amountInr: number): Promise<RazorpayResult> {
  const order = await createOrder(amountInr);
  return openCheckout(order);
}

/** Placeholder: create a UPI autopay mandate (PYAAS MONEY / Smart Recharge). */
export async function createMandate(params: { maxAmount: number; upiId?: string }): Promise<RazorpayMandate> {
  if (!RAZORPAY_CONFIGURED) {
    throw new Error('AutoPay needs the payments gateway, which is coming soon.');
  }
  console.warn(`${TODO} createMandate(₹${params.maxAmount}) - wire to Razorpay UPI AutoPay (Subscriptions/Mandates)`);
  return { id: fakeId('mandate'), status: 'created', maxAmount: params.maxAmount, upiId: params.upiId };
}

/** Placeholder: cancel/pause an existing mandate. */
export async function cancelMandate(mandateId: string): Promise<{ success: boolean }> {
  console.warn(`${TODO} cancelMandate(${mandateId})`);
  return { success: true };
}

export const RAZORPAY_CONFIGURED = false; // flip to true once keys + Edge Functions are live
