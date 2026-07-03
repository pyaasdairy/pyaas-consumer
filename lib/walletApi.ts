import { supabase } from './supabase';
import * as razorpay from './razorpay';

export type WalletTxn = {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  category: string;
  description: string | null;
  created_at: string;
};

export type AutopayMandate = {
  id: string;
  status: 'pending' | 'active' | 'paused' | 'cancelled';
  upi_id: string | null;
  max_amount: number;
  next_charge_date: string | null;
};

export async function getTransactions(): Promise<WalletTxn[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, direction, amount, balance_after, category, description, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as WalletTxn[];
}

/**
 * Recharge (PLACEHOLDER PAYMENT). Runs the Razorpay placeholder, then credits
 * via the wallet_recharge() SQL fn which also applies the matching bonus tier.
 * Returns the new balance. Replace with the real Razorpay webhook in prod.
 */
export async function rechargeWallet(amount: number): Promise<number> {
  await razorpay.payAmount(amount); // placeholder checkout
  const { data, error } = await supabase.rpc('wallet_recharge', { p_amount: amount });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getAutopay(): Promise<AutopayMandate | null> {
  const { data, error } = await supabase
    .from('autopay_mandates')
    .select('id, status, upi_id, max_amount, next_charge_date')
    .in('status', ['pending', 'active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as AutopayMandate) ?? null;
}

/** Set up UPI autopay (Smart Recharge / PYAAS MONEY). Placeholder mandate. */
export async function setupAutopay(params: { maxAmount: number; upiId?: string }): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const mandate = await razorpay.createMandate({ maxAmount: params.maxAmount, upiId: params.upiId });
  const { error } = await supabase.from('autopay_mandates').insert({
    user_id: uid,
    provider: 'razorpay',
    mandate_id: mandate.id,
    upi_id: params.upiId ?? null,
    max_amount: params.maxAmount,
    status: 'active', // placeholder treats mandate as immediately active
  });
  if (error) throw error;
}

export async function cancelAutopay(id: string): Promise<void> {
  await razorpay.cancelMandate(id);
  await supabase.from('autopay_mandates').update({ status: 'cancelled' }).eq('id', id);
}
