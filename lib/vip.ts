import { supabase } from './supabase';
import { VIP_TRIAL_DAYS } from './pricing';

export type VipMembership = {
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  trial_started_at: string | null;
  current_period_end: string | null;
  total_saved: number;
};

export async function getVip(): Promise<VipMembership | null> {
  const { data, error } = await supabase
    .from('vip_memberships')
    .select('status, trial_started_at, current_period_end, total_saved')
    .maybeSingle();
  if (error) return null;
  return (data as VipMembership) ?? null;
}

/** Start (or restart) the user's free VIP trial · creates a real vip_memberships
 *  row so the card activates, member pricing applies and savings begin to count.
 *  A client-side write under the user's own RLS (no server function needed). */
export async function startVipTrial(): Promise<VipMembership> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const now = new Date();
  const end = new Date(now.getTime() + VIP_TRIAL_DAYS * 86400000);
  const fields = { status: 'trial' as const, trial_started_at: now.toISOString(), current_period_end: end.toISOString() };
  const existing = await getVip();
  const q = existing
    ? supabase.from('vip_memberships').update(fields).eq('user_id', uid)
    : supabase.from('vip_memberships').insert({ user_id: uid, ...fields });
  const { data, error } = await q.select('status, trial_started_at, current_period_end, total_saved').single();
  if (error) throw error;
  return data as VipMembership;
}

export function vipActive(m: VipMembership | null): boolean {
  if (!m) return false;
  if (m.status === 'cancelled' || m.status === 'expired') return false;
  if (!m.current_period_end) return m.status === 'active';
  return new Date(m.current_period_end).getTime() > Date.now();
}

export function vipDaysLeft(m: VipMembership | null): number {
  if (!m?.current_period_end) return 0;
  const ms = new Date(m.current_period_end).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}
