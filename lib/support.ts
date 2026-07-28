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
 *  - CARE_PHONE: PLACEHOLDER until the founder supplies the real line.
 *  - helpline (1967): govt State Consumer Helpline escalation fallback.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER — founder to supply the real PYAAS toll-free number.
// The single source of truth for the customer-care line. Override per build
// with EXPO_PUBLIC_CARE_PHONE (display format, e.g. "1800 120 7929").
// ─────────────────────────────────────────────────────────────────────────────
export const CARE_PHONE: string = process.env.EXPO_PUBLIC_CARE_PHONE || '1800 120 7929';
/** Digits-only `tel:` variant — DERIVED from CARE_PHONE, never duplicated. */
export const CARE_PHONE_TEL: string = CARE_PHONE.replace(/\D/g, '');

// PLACEHOLDER — founder to confirm the real PYAAS support inbox and website.
export const CARE_EMAIL = 'care@pyaasdairy.in';
export const SITE_URL = 'https://www.pyaasdairy.in';

export const SUPPORT = {
  careNumber: CARE_PHONE,
  careTel: CARE_PHONE_TEL,
  careNote: 'PYAAS Customer Care (toll-free)',
  altNumber: CARE_PHONE,
  altTel: CARE_PHONE_TEL,
  email: CARE_EMAIL,
  appEmail: CARE_EMAIL,
  site: SITE_URL,
  helpline: '1967',
} as const;

/** Dial the toll-free customer-care line. */
export function callCare() {
  return Linking.openURL(`tel:${SUPPORT.careTel}`).catch(() => {});
}

/** Dial an arbitrary support number (already digits-only). */
export function callNumber(tel: string) {
  return Linking.openURL(`tel:${tel}`).catch(() => {});
}

/** Compose an email to the support inbox. */
export function emailCare(subject = 'PYAAS support', body = '') {
  const q = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return Linking.openURL(`mailto:${SUPPORT.appEmail}?${q}`).catch(() => {});
}

// ── Support chat tickets (local queue) ───────────────────────────────────────
// The in-app chat is a scripted bot (no live agent yet), so it queues a ticket
// locally for the team to follow up. When the backend is live, POST these to a
// /support/tickets endpoint instead of (or in addition to) storing on device.
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
