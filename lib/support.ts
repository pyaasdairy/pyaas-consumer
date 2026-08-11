import { Linking } from 'react-native';
import { getUserId } from './session';
import { insertRow, newId } from './localStore';

/**
 * PYAAS consumer support contacts — single source of truth so the founder can
 * swap a number in ONE place and every screen (support, profile, contact-us,
 * FSSAI details, invoices, product compliance and the support chat's
 * "talk to a human" fallback) updates.
 *
 * CONFIDENCE:
 *  - CARE_PHONE / WHATSAPP_NUMBER: UNSET until the founder supplies real lines.
 *    They default to '' on purpose — see the note on CARE_PHONE below.
 *  - helpline (1967): govt State Consumer Helpline escalation fallback.
 */

// ─────────────────────────────────────────────────────────────────────────────
// UNSET until the founder supplies the real PYAAS customer-care number.
// It defaults to EMPTY, not to a sample number: this value is rendered as a
// tappable row on support/profile/contact/FSSAI screens AND stamped onto every
// invoice, so any stand-in digits ship as a real promise and dial a stranger
// (the old default, 1800 120 7929, is a live third-party toll-free line).
// Empty means "we have no line yet" — every consumer MUST hide its call row
// rather than render a dead number. Guard with HAS_CARE_PHONE.
// Override per build with EXPO_PUBLIC_CARE_PHONE (display format, e.g. "1800 000 0000").
// ─────────────────────────────────────────────────────────────────────────────
export const CARE_PHONE: string = process.env.EXPO_PUBLIC_CARE_PHONE || '';
/** Digits-only `tel:` variant — DERIVED from CARE_PHONE, never duplicated. */
export const CARE_PHONE_TEL: string = CARE_PHONE.replace(/\D/g, '');
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

// PLACEHOLDER — founder to confirm the real PYAAS support inbox and website.
export const CARE_EMAIL = 'care@pyaasdairy.in';
export const SITE_URL = 'https://www.pyaasdairy.in';

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

// ── Support chat tickets (local queue) ───────────────────────────────────────
// The in-app chat is a scripted bot and there is NO support backend, so a saved
// ticket never leaves the handset — it is a record for the customer, not a
// message to us. Screens must therefore hand the user on to email/phone and
// must never say "our team will be in touch" off the back of this write.
// When the backend is live, POST these to a /support/tickets endpoint instead
// of (or in addition to) storing on device.
export type SupportTicket = {
  id: string;
  topic: string;
  detail: string;
  transcript: { from: 'bot' | 'user'; text: string }[];
  rating?: number; // 1-5, the user's rating of the chat experience
  createdAt: string;
};

export async function saveSupportTicket(t: Omit<SupportTicket, 'id' | 'createdAt'>): Promise<SupportTicket | null> {
  const uid = await getUserId();
  if (!uid) return null;
  const row: SupportTicket = { ...t, id: newId('ticket'), createdAt: new Date().toISOString() };
  await insertRow('support_tickets', uid, row);
  return row;
}
