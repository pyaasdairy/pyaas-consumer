import { supabase } from './supabase';

export type LeadKind = 'bulk_order' | 'franchise' | 'vendor';

export async function submitLead(params: {
  kind: LeadKind;
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  city?: string;
  message?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const { error } = await supabase.from('partner_leads').insert({
    user_id: uid,
    kind: params.kind,
    name: params.name.trim(),
    phone: params.phone.trim(),
    email: params.email?.trim() || null,
    business_name: params.businessName?.trim() || null,
    city: params.city?.trim() || null,
    message: params.message?.trim() || null,
    details: params.details ?? null,
  });
  if (error) throw error;
}
