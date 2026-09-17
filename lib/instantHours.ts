/**
 * INSTANT LANE HOURS — the client-side night guard.
 *
 * Instant (~20 minute) delivery must not be orderable at night: there is no
 * rider on shift at 2 AM, and an instant order placed then would sit until
 * morning while the app promised twenty minutes. The store manager's console
 * toggle remains AUTHORITATIVE for closing the lane early (or reopening it) —
 * this module is the floor underneath it, so a backend that is slow, stale or
 * silent can never leave the lane advertised overnight.
 *
 * THE RULE (founder, 18 Sep):
 *   - Instant is OPEN from OPEN_HOUR to CLOSE_HOUR local time.
 *   - Outside that window the lane is SHUT, and the UI says when it reopens
 *     ("Instant opens at 6:00 AM") instead of silently greying out.
 *   - The lane is never REMOVED: the segment stays on screen, keeps its badge
 *     and explains itself when tapped. "Don't disable instant" means don't
 *     make the feature vanish — it means state the hours.
 *
 * Both bounds are env-overridable so hours can change without a release.
 */

const hour = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : fallback;
};

/** Instant opens at 6 AM. */
export const INSTANT_OPEN_HOUR = hour(process.env.EXPO_PUBLIC_INSTANT_OPEN_HOUR, 6);
/** Instant closes at 11 PM (23:00). */
export const INSTANT_CLOSE_HOUR = hour(process.env.EXPO_PUBLIC_INSTANT_CLOSE_HOUR, 23);

/** "6:00 AM" / "11:00 PM" for a whole-hour clock value. */
export function hourLabel(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm >= 12 ? 'PM' : 'AM';
  const hr = norm % 12 === 0 ? 12 : norm % 12;
  return `${hr}:00 ${ampm}`;
}

export type InstantWindow = {
  /** Inside the published hours right now. */
  open: boolean;
  /** Shut because of the hours (not because the address isn't served). */
  closedForNight: boolean;
  /** "6:00 AM" — when it opens next. Null while open. */
  opensAtLabel: string | null;
  /** "Instant opens at 6:00 AM" — the one line every surface shows. */
  note: string | null;
};

/**
 * Where the instant lane stands at `now`. Pure and synchronous, so any screen
 * can call it during render; pass a Date in tests.
 */
export function instantWindow(now: Date = new Date()): InstantWindow {
  const h = now.getHours() + now.getMinutes() / 60;
  // Windows that don't wrap midnight (6 → 23) and ones that do (e.g. 22 → 5)
  // are both handled, so overriding the hours can never invert the logic.
  const wraps = INSTANT_CLOSE_HOUR <= INSTANT_OPEN_HOUR;
  const open = wraps
    ? h >= INSTANT_OPEN_HOUR || h < INSTANT_CLOSE_HOUR
    : h >= INSTANT_OPEN_HOUR && h < INSTANT_CLOSE_HOUR;
  if (open) return { open: true, closedForNight: false, opensAtLabel: null, note: null };
  const opensAtLabel = hourLabel(INSTANT_OPEN_HOUR);
  return {
    open: false,
    closedForNight: true,
    opensAtLabel,
    note: `Instant opens at ${opensAtLabel}`,
  };
}

/** The morning lane is always orderable — it delivers in tomorrow's 5-7:30 window. */
export const MORNING_ALWAYS_OPEN = true;
