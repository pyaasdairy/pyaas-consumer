import { getUserId, getProfile } from './session';
import { getRows, setRows, insertRow, newId } from './localStore';
import { api, isBackendConfigured, HttpError } from './apiClient';

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
        // NO name/phone. Hearting an out-of-stock SKU is a one-tap gesture whose
        // only affordance is a heart icon — shipping the member's name and mobile
        // off-device as a side effect of it is the exact defect that had this app
        // removed from Play (personal data transmitted with no disclosure and no
        // affirmative consent to that transmission).
        //
        // Nothing is lost: the request is authenticated, so the server already
        // knows who this is from the token and can join the profile itself. We
        // send the product and the id the server has anyway.
        await api.post('/wishlist/leads', {
          user_id: uid,
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
      // Capture-time snapshot of everything the replay drain needs to rebuild
      // the POST /wishlist/leads payload later — replay must never re-read
      // live state to reconstruct what was true at capture time.
      details: { product_id: product.id, product_name: product.name, variant: product.variant },
      created_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false; // nothing stored — let explicit CTAs offer a retry
  }
}

// ── Parked-lead replay (backend durability) ──────────────────────────────────
// captureRestockLead parks the lead on-device when the POST fails — but until
// now those fallback rows were NEVER replayed, so a heart tapped in a lift was
// demand the founder never saw. Copies walletApi.replayPendingPromos: iterate
// every parked restock row, re-POST it, and remove a row ONLY once the server
// accepted it (or authoritatively rejected it — see isAuthoritativeRejection);
// network/timeout/5xx keep the row parked for the next drain. Invoked from the
// same boot/foreground beat as replayPendingPromos (store/wallet.ts refresh).
// Safe to repeat: the server upserts per (user, product) — a double-post only
// bumps its `taps` counter, never duplicates a lead.

/** Rebuild the wishlist-lead payload from a parked row's CAPTURE-TIME fields.
 *  Newer rows carry product_name/variant in `details`; rows parked by builds
 *  before that embed them in the message ("Restock request: <name> · <variant>").
 *  Returns null when the row has no product_id — nothing postable. */
function payloadFromParkedLead(ownerUid: string, lead: Lead): Record<string, string> | null {
  const d = (lead.details ?? {}) as { product_id?: unknown; product_name?: unknown; variant?: unknown };
  const productId = typeof d.product_id === 'string' ? d.product_id.trim() : '';
  if (!productId) return null;
  let productName = typeof d.product_name === 'string' ? d.product_name : '';
  let variant = typeof d.variant === 'string' ? d.variant : '';
  const PREFIX = 'Restock request: ';
  if (!productName && lead.message?.startsWith(PREFIX)) {
    const rest = lead.message.slice(PREFIX.length);
    const sep = rest.lastIndexOf(' · ');
    if (sep >= 0) {
      productName = rest.slice(0, sep);
      variant = variant || rest.slice(sep + 3);
    } else {
      productName = rest;
    }
  }
  // user_id is the CAPTURE-TIME owner (the bucket the row was parked under) —
  // a lead hearted before sign-in stays attributed to 'anon', never silently
  // re-attributed to whoever is signed in at drain time. As at capture, no
  // name/phone ever leaves the device (Play-removal lesson).
  return { user_id: ownerUid, product_id: productId, product_name: productName, variant, source: 'wishlist' };
}

/** mirrorQueue's mirrorOutcomeFor convention: a 4xx is the server REJECTING
 *  this payload — retrying can never land it — except the transient statuses
 *  408 (timeout) and 429 (throttle). Two more deliberately stay parked here:
 *  - 401: the token refresh failed; the row replays after the next sign-in.
 *  - 404: POST /wishlist/leads EXISTS on the deployed backend
 *    (release/26.07.03 consumer/module.go), so a 404 can only be an
 *    infra/path anomaly — and the degrade contract forbids discarding local
 *    data on a 404. Keeping it parked is free; the server upsert makes an
 *    eventual duplicate replay harmless. */
function isAuthoritativeRejection(e: unknown): boolean {
  return (
    e instanceof HttpError &&
    e.status >= 400 &&
    e.status < 500 &&
    e.status !== 401 &&
    e.status !== 404 &&
    e.status !== 408 &&
    e.status !== 429
  );
}

// In-flight latch (the claimFreePack pattern): boot + foreground + a wallet
// refresh can all fire at once; concurrent callers share one drain.
let leadDrainInFlight: Promise<number> | null = null;

/**
 * Re-post locally parked restock leads to POST /wishlist/leads. Drains the
 * signed-in bucket AND the pre-sign-in 'anon' bucket (hearts tapped before
 * login park there and would otherwise never replay). Returns how many landed;
 * never throws. No-op offline / local mode / signed out / nothing parked.
 */
export function replayParkedRestockLeads(): Promise<number> {
  if (!leadDrainInFlight) {
    leadDrainInFlight = doReplayParkedRestockLeads()
      .catch(() => 0) // storage/unknown failure — rows stay parked, retried next drain
      .finally(() => { leadDrainInFlight = null; });
  }
  return leadDrainInFlight;
}

async function doReplayParkedRestockLeads(): Promise<number> {
  if (!isBackendConfigured()) return 0;
  const uid = await getUserId();
  if (!uid) return 0;
  let landed = 0;
  for (const owner of [uid, 'anon']) {
    const rows = await getRows<Lead>(TABLE, owner);
    if (!rows.some((r) => r.kind === 'restock')) continue;
    const remove = new Set<string>();
    for (const lead of rows) {
      if (lead.kind !== 'restock') continue; // partner-lead rows are not this drain's to touch
      const payload = payloadFromParkedLead(owner, lead);
      if (!payload) continue; // unpostable (no product_id) — keep, never delete data we didn't land
      try {
        await api.post('/wishlist/leads', payload);
        remove.add(lead.id);
        landed++;
      } catch (e) {
        if (isAuthoritativeRejection(e)) remove.add(lead.id); // server said never — dropping beats an eternal retry
        // anything else (offline, 0/timeout, 5xx, 401, 404) → still parked
      }
    }
    if (remove.size > 0) {
      // Re-read before writing (mirrorQueue's drain discipline): the network
      // loop above yields, and captureRestockLead may have parked a NEW row in
      // this bucket mid-drain — filtering the stale `rows` snapshot would
      // silently delete that never-posted lead. Filter the FRESH table instead:
      // rows added meanwhile survive, and only server-accepted (or
      // authoritatively rejected) ids are removed.
      const after = await getRows<Lead>(TABLE, owner);
      await setRows(TABLE, owner, after.filter((r) => !remove.has(r.id)));
    }
  }
  return landed;
}
