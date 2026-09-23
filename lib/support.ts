import { Linking } from 'react-native';
import { getUserId } from './session';
import { insertRow, newId } from './localStore';
import { isBackendConfigured } from './apiClient';
import type { ComplaintCategory } from './complaints';

/**
 * PYAAS consumer support contacts — single source of truth so the founder can
 * swap a number in ONE place and every screen (support, profile, contact-us,
 * FSSAI details, invoices, product compliance and the support chat's
 * "talk to a human" fallback) updates.
 *
 * CONFIDENCE:
 *  - CARE_PHONE: the registered support line from the published Terms and
 *    Privacy Policy (PYAAS DAIRY PRIVATE LIMITED, v1.0, 3 Aug 2026).
 *  - WHATSAPP_NUMBER: still UNSET — defaults to '' so its row hides.
 *  - helpline (1967): govt State Consumer Helpline escalation fallback.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The REGISTERED support line, confirmed by the operator: 9667260050.
// NOTE FOR THE OWNER: the published Terms & Conditions and Privacy Policy
// (v1.0, 3 Aug 2026) still print +91 99996 80081. The app now carries the
// confirmed number, so the PUBLIC DOCUMENTS are the stale ones and need
// reissuing. Play and Apple both check that developer contact details are
// accurate and consistent with the listing.
// This is rendered as a tappable row on support/profile/contact/FSSAI screens
// AND stamped onto every invoice, so it must be a line the company actually
// answers — the old default (1800 120 7929) was a live THIRD-PARTY toll-free
// number and sent customers to a stranger.
// HAS_CARE_PHONE still guards every consumer, so an env override to '' cleanly
// hides the call rows rather than rendering a dead number.
// Override per build with EXPO_PUBLIC_CARE_PHONE.
// ─────────────────────────────────────────────────────────────────────────────
export const CARE_PHONE: string = process.env.EXPO_PUBLIC_CARE_PHONE || '+91 96672 60050';
/** Dialable `tel:` variant — DERIVED from CARE_PHONE, never duplicated. The
 *  leading + must SURVIVE: stripping it pastes "919667260050" into the dialer,
 *  which is not a dialable Indian number; "+919667260050" dials anywhere. */
export const CARE_PHONE_TEL: string =
  (CARE_PHONE.trim().startsWith('+') ? '+' : '') + CARE_PHONE.replace(/\D/g, '');
/** False until a real care line is configured — hide call rows, never render a dead one. */
export const HAS_CARE_PHONE: boolean = CARE_PHONE_TEL.length > 0;

// ─────────────────────────────────────────────────────────────────────────────
// UNSET until the founder supplies the real PYAAS WhatsApp Business number.
// Same reasoning as CARE_PHONE: the old default (919123456780) is an allocated
// Indian mobile, so shipping it hands customers to whoever owns that handset.
// A SEPARATE seam from CARE_PHONE on purpose: wa.me links require FULL
// INTERNATIONAL format (country code + subscriber number, digits only, no '+'),
// and a domestic toll-free 1800 line can neither be parsed by wa.me nor host
// WhatsApp Business — so this must NEVER be derived from CARE_PHONE.
// Override per build with EXPO_PUBLIC_CARE_WHATSAPP (e.g. "919000000000").
// ─────────────────────────────────────────────────────────────────────────────
export const WHATSAPP_NUMBER: string = (process.env.EXPO_PUBLIC_CARE_WHATSAPP || '').replace(/\D/g, '');
/** False until a real WhatsApp Business number is configured — hide the row. */
export const HAS_WHATSAPP: boolean = WHATSAPP_NUMBER.length > 0;
/** Ready-to-open WhatsApp chat link, or '' when there is no number to open. */
export const WHATSAPP_URL: string = HAS_WHATSAPP ? `https://wa.me/${WHATSAPP_NUMBER}` : '';

// The registered support inbox and website from the published policies. NOTE the
// domain: pyaasdairy.COM. The app previously pointed at pyaasdairy.in, which is
// not the domain named in the Privacy Policy or the Terms.
export const CARE_EMAIL = 'support@pyaasdairy.com';

/** Named Grievance Officer under the DPDP Act, per Privacy Policy §21. */
export const GRIEVANCE_OFFICER = 'Amiya Sinha';
/** Dedicated grievance inbox — distinct from general support. */
export const GRIEVANCE_EMAIL = 'grievance@pyaasdairy.com';
export const SITE_URL = 'https://www.pyaasdairy.com';

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL PUBLIC LEGAL URLS. All three verified live (HTTP 200) on 16 Aug 2026.
//
// NOTE THE PRIVACY PATH: it is /privacy. The guessable /privacy-policy returns
// a 404, and a 404 in Play Console's privacy-policy field is an automatic
// rejection. These are the exact strings to paste into Play Console and App
// Store Connect, so keep them here rather than retyping them.
// ─────────────────────────────────────────────────────────────────────────────
export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
/** Play requires a web-accessible account-deletion request page (answer/13327111). */
export const DELETE_ACCOUNT_URL = `${SITE_URL}/delete-account`;

export const SUPPORT = {
  careNumber: CARE_PHONE,
  careTel: CARE_PHONE_TEL,
  // No "(toll-free)" claim: whatever EXPO_PUBLIC_CARE_PHONE holds may be a
  // landline or mobile, and we cannot promise the customer a free call.
  careNote: 'PYAAS Customer Care',
  altNumber: CARE_PHONE,
  altTel: CARE_PHONE_TEL,
  email: CARE_EMAIL,
  appEmail: CARE_EMAIL,
  site: SITE_URL,
  helpline: '1967',
} as const;

/** Dial the customer-care line. No-ops when no line is configured (see HAS_CARE_PHONE). */
export function callCare() {
  if (!HAS_CARE_PHONE) return Promise.resolve();
  return Linking.openURL(`tel:${SUPPORT.careTel}`).catch(() => {});
}

/** Dial an arbitrary support number (already digits-only). */
export function callNumber(tel: string) {
  if (!tel) return Promise.resolve();
  return Linking.openURL(`tel:${tel}`).catch(() => {});
}

/**
 * Open the user's mail app addressed to the support inbox.
 * Resolves TRUE only if a composer actually opened — callers use that to tell
 * the customer the truth ("it is in your drafts") instead of claiming we
 * received something we never did.
 */
export function emailCare(subject = 'PYAAS support', body = ''): Promise<boolean> {
  const q = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return Linking.openURL(`mailto:${SUPPORT.appEmail}?${q}`).then(() => true).catch(() => false);
}

// ── Support chat tickets ─────────────────────────────────────────────────────
// The in-app chat is a scripted bot. With a backend, a finished chat is filed
// on the COMPLAINTS REGISTER (POST /complaints through lib/complaints, so it
// appears under "My complaints" with a PYS reference and a status the team
// updates). Without one there is NO support backend: the ticket never leaves
// the handset, it is a record for the customer, not a message to the team,
// and screens must hand the user on to email/phone rather than say "our team
// will be in touch" off the back of that write.
export type SupportTicket = {
  id: string;
  topic: string;
  detail: string;
  transcript: { from: 'bot' | 'user'; text: string }[];
  rating?: number; // 1-5, the user's rating of the chat experience
  createdAt: string;
  /** The complaint reference (PYS-XXXXX) when the chat was filed on the register. */
  ref?: string;
  /** True once the register accepted it; false = saved on the phone, waiting to send. */
  registered?: boolean;
};

/** The closest complaint category for a support-chat topic (key or label). */
export function complaintCategoryForTopic(topic: string): ComplaintCategory {
  const t = topic.toLowerCase();
  if (t.includes('missing')) return 'missing';
  if (t.includes('quality') || t.includes('wrong') || t.includes('damaged')) return 'quality';
  if (t.includes('payment') || t.includes('wallet')) return 'payment';
  if (t.includes('timing') || t.includes('late')) return 'late';
  return 'other';
}

/** The register entry for a finished chat: topic, the member's own words, rating. */
export function supportTicketSummary(t: { topic: string; detail: string; rating?: number }): string {
  return [
    `Support chat: ${t.topic}`,
    t.detail.trim(),
    t.rating ? `Chat rating: ${t.rating}/5` : '',
  ].filter(Boolean).join('\n');
}

export async function saveSupportTicket(t: Omit<SupportTicket, 'id' | 'createdAt' | 'ref' | 'registered'>): Promise<SupportTicket | null> {
  const uid = await getUserId();
  if (!uid) return null;
  if (isBackendConfigured()) {
    // Backend mode: file it on the complaints register. A dead network leaves
    // it queued there and retried; a permanent rejection by the register
    // throws with the reason (fileComplaint), for the screen to show next to
    // the email escalation. Dynamic import: complaints imports emailCare from
    // this module.
    const { fileComplaint } = await import('./complaints');
    const c = await fileComplaint({ category: complaintCategoryForTopic(t.topic), detail: supportTicketSummary(t) });
    return { ...t, id: c.id, createdAt: c.created_at, ref: c.ref, registered: c.status !== 'queued' };
  }
  const row: SupportTicket = { ...t, id: newId('ticket'), createdAt: new Date().toISOString() };
  await insertRow('support_tickets', uid, row);
  return row;
}
