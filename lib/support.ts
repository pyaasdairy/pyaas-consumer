import { Linking } from 'react-native';
import { getUserId } from './session';
import { insertRow, newId } from './localStore';

/**
 * PARAG consumer support contacts — single source of truth so the founder can
 * swap a number in ONE place and every screen (support, profile, the support
 * chat's "talk to a human" fallback) updates.
 *
 * "PARAG" here is PCDF (Pradeshik Cooperative Dairy Federation, Uttar Pradesh,
 * paragdairy.com) — NOT the unrelated private Parag Milk Foods (Gowardhan/Go).
 *
 * CONFIDENCE:
 *  - careNumber (1800 103 3611): official Parag Customer Care toll-free line.
 *  - office (0522 2286644) + email (lko@paragmilkup.in): HIGH confidence, from
 *    the official paragdairy.com/ContactUs page (HQ: 22 Jopling Road, Lucknow).
 *  - helpline (1967): govt State Consumer Helpline escalation fallback.
 */
export const SUPPORT = {
  careNumber: '1800 103 3611',
  careTel: '18001033611',
  careNote: 'Parag Customer Care (toll-free)',
  altNumber: '1800 103 3611',
  altTel: '18001033611',
  office: '0522 2286644',
  officeTel: '05222286644',
  email: 'lko@paragmilkup.in',
  appEmail: 'hello@paragdairy.app',
  site: 'https://www.paragdairy.com',
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
