import { getUserId, getLoginPhone } from './session';

/**
 * GOOGLE PLAY REVIEW ACCESS — the reviewer signs in with the hardcoded test
 * number below (shared in the Play Console "App access" instructions) and must
 * be able to exercise EVERY feature from wherever Google's review farm sits.
 * The launch geofence would otherwise stop them at the door (browse-only shop,
 * ordering closed), which reads as a broken app and risks a rejection.
 *
 * The bypass is DELIVERY-GATE ONLY and per-account: it lifts the geofence for
 * this one signed-in tester so ordering opens; money, consent, OTP and every
 * other flow stay exactly as production users see them.
 */
export const PLAY_TESTER_PHONE = '9999900000';

/** Loose match: ignores +91 / spaces — compares the last 10 digits. */
export function isPlayTesterPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10) === PLAY_TESTER_PHONE;
}

/** Whether the CURRENT signed-in session is the Play reviewer's account.
 *  Keyed off the OTP-VERIFIED login phone recorded at sign-in (device-scoped,
 *  unreachable from profile-edit), NOT the profile's phone field — reading
 *  that would let anyone self-assign the reviewer bypass. The legacy
 *  `u_<phone>` uid check remains for sessions from before the uid migration. */
export async function isPlayTesterSession(): Promise<boolean> {
  try {
    const login = await getLoginPhone();
    if (login === PLAY_TESTER_PHONE) return true;
    const uid = await getUserId();
    return uid === `u_${PLAY_TESTER_PHONE}`;
  } catch {
    return false;
  }
}
