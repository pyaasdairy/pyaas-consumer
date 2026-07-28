import { getUserId, getProfile } from './session';
import { getRows, insertRow, newId } from './localStore';
import { api, isBackendConfigured } from './apiClient';

/**
 * Local-first partner lead capture for PYAAS. A visitor can submit a bulk-order,
 * franchise or vendor/distributor enquiry from the "Partner with us" screen; the
 * lead is stored on-device in the per-user `leads` table so the flow works fully
 * offline for the demo. Leads submitted while signed out are kept under an `anon`
 * bucket so nothing is lost before login.
 *
 * When the NestJS backend is live (EXPO_PUBLIC_API_URL set), the same call posts
 * the lead to the API instead. See lib/apiClient.ts for the seam.
 */

export type LeadKind = 'bulk_order' | 'franchise' | 'vendor' | 'restock';

export type Lead = {
  id: string;
  kind: LeadKind;
  name: string;
  phone: string;
  email: string | null;
  business_name: string | null;
  city: string | null;
  message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const TABLE = 'leads';

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
  const row: Lead = {
    id: newId('lead'),
    kind: params.kind,
    name: params.name.trim(),
    phone: params.phone.trim(),
    email: params.email?.trim() || null,
    business_name: params.businessName?.trim() || null,
    city: params.city?.trim() || null,
    message: params.message?.trim() || null,
    details: params.details ?? null,
    created_at: new Date().toISOString(),
  };

  if (isBackendConfigured()) {
    // TODO(api): POST /partner-leads with the row payload once parag-api is live.
    await api.post('/partner-leads', row);
    return;
  }

  const uid = (await getUserId()) ?? 'anon';
  await insertRow<Lead>(TABLE, uid, row);
}

/** Every lead captured for the current owner (or the anon bucket), newest first. */
export async function listLeads(): Promise<Lead[]> {
  const uid = (await getUserId()) ?? 'anon';
  const rows = await getRows<Lead>(TABLE, uid);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Restock / wishlist demand capture ────────────────────────────────────────
/**
 * Fired the moment a member hearts an OUT-OF-STOCK SKU: their profile data
 * (name + phone) lands on the shared backend right there, keyed to the SKU, so
 * the founder sees live restock demand (deduped server-side by user+product —
 * repeat taps bump a counter, never duplicate). It never throws — the heart
 * tap treats it as fire-and-forget — but it reports whether the lead was
 * stored ANYWHERE, so explicit CTAs ("Notify me") only confirm on truth:
 * backend first; if that call fails (offline, server down, timeout) the lead
 * falls back to the on-device leads table instead of being dropped.
 */
export async function captureRestockLead(product: { id: string; name: string; variant: string }): Promise<boolean> {
  try {
    const uid = (await getUserId()) ?? 'anon';
    const prof = await getProfile().catch(() => null);
    if (isBackendConfigured()) {
      try {
        await api.post('/wishlist/leads', {
          user_id: uid,
          name: prof?.full_name ?? null,
          phone: prof?.phone ?? null,
          product_id: product.id,
          product_name: product.name,
          variant: product.variant,
          source: 'wishlist',
        });
        return true;
      } catch { /* backend unreachable → keep the lead on-device below */ }
    }
    await insertRow<Lead>(TABLE, uid, {
      id: newId('lead'),
      kind: 'restock',
      name: prof?.full_name ?? '',
      phone: prof?.phone ?? '',
      email: null,
      business_name: null,
      city: null,
      message: `Restock request: ${product.name} · ${product.variant}`,
      details: { product_id: product.id },
      created_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false; // nothing stored — let explicit CTAs offer a retry
  }
}
