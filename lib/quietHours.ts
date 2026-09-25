/**
 * QUIET HOURS: 22:00 to 07:00 IST (founder decision 6, 25 Sep 2026).
 *
 * Order, delivery and "money added" notices always arrive. Offers and the
 * quirky taglines wait for morning. The backend CRM applies the same hours to
 * its messages (crm_triggers.json guards.G5_quiet_hours); this module is the
 * phone's half, for the notifications the app schedules on the device itself
 * (lib/taglines, lib/cartReminder).
 *
 * The hours are IST whatever the phone's own time zone: India has no daylight
 * saving, so IST is a fixed UTC+05:30. Pure functions, no imports, so the
 * schedule can be checked without a device.
 */

/** 22:00 IST, in minutes after IST midnight. */
export const QUIET_START_MIN = 22 * 60;
/** 07:00 IST, in minutes after IST midnight. */
export const QUIET_END_MIN = 7 * 60;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const ms = (at: Date | number): number => (typeof at === 'number' ? at : at.getTime());

/** Minutes after IST midnight at `at` (0..1439). */
export function istMinuteOfDay(at: Date | number): number {
  const istMs = ms(at) + IST_OFFSET_MS;
  return Math.floor((((istMs % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/** Is `at` inside the quiet hours (22:00 up to, not including, 07:00 IST)? */
export function inQuietHours(at: Date | number): boolean {
  const m = istMinuteOfDay(at);
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

/**
 * The moment a notice due at `at` may be shown: `at` itself outside the quiet
 * hours, else the end of those hours (the next 07:00 IST).
 */
export function afterQuietHours(at: Date | number): Date {
  const t = ms(at);
  if (!inQuietHours(t)) return new Date(t);
  const istMs = t + IST_OFFSET_MS;
  const istMidnight = istMs - (((istMs % DAY_MS) + DAY_MS) % DAY_MS);
  let end = istMidnight + QUIET_END_MIN * MINUTE_MS; // 07:00 IST of this IST day
  if (istMinuteOfDay(t) >= QUIET_START_MIN) end += DAY_MS; // 22:00-23:59: tomorrow's 07:00
  return new Date(end - IST_OFFSET_MS);
}

/**
 * The tagline times: one every `everyMs` after `startMs`, only between 07:00
 * and 22:00 IST, until `horizonMs` after the start, at most `maxSlots`. A time
 * that lands in the quiet hours moves to 07:00 and the cadence runs on from
 * there, so a full day carries 07:00, 09:00 ... 21:00 (8 at the 2-hour
 * cadence) instead of 12 around the clock.
 */
export function taglineTimes(startMs: number, everyMs: number, horizonMs: number, maxSlots: number): Date[] {
  const out: Date[] = [];
  if (!(everyMs > 0)) return out;
  const until = startMs + horizonMs;
  let next = startMs + everyMs;
  while (out.length < maxSlots) {
    const at = afterQuietHours(next).getTime();
    if (at > until) break;
    out.push(new Date(at));
    next = at + everyMs;
  }
  return out;
}
