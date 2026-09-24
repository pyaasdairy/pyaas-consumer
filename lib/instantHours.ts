/**
 * INSTANT LANE HOURS: the store manager decides, this module reports it.
 *
 * WHO DECIDES (founder, 24 Sep): the STORE MANAGER sets instant hours in the
 * Saathi console, and the backend's GET /serviceability answer carries them:
 * `instant` (open at this point right now), `instantClosed` (shut by the
 * store's hours, a tonight-only close-now or a pause) and when it resumes
 * (`instantResumesLabel`, `instantResumesAt`). A store that opens at 07:00,
 * stays open tonight until 02:00, or closes now and reopens is shown exactly
 * so. lib/serviceability hands each answer here (recordInstantAnswer) as it
 * lands, and instantWindow() follows it.
 *
 * THE FLOOR (founder, 18 Sep), used only when there is NO server answer: no
 * backend configured (local demo), the serviceability call failed (offline),
 * a local verdict (the Play reviewer, a city pick), or an answer older than
 * ANSWER_TTL_MS. Then instant is open from OPEN_HOUR to CLOSE_HOUR local time,
 * so a silent backend can never leave the lane advertised at 2 AM.
 *
 * Either way the lane is never REMOVED: the segment stays on screen, keeps
 * its badge and explains itself when tapped. "Don't disable instant" means
 * don't make the feature vanish; it means state the hours.
 *
 * Both floor bounds are env-overridable so they can change without a release.
 */

const hour = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : fallback;
};

/** The floor opens instant at 6 AM (no server answer only). */
export const INSTANT_OPEN_HOUR = hour(process.env.EXPO_PUBLIC_INSTANT_OPEN_HOUR, 6);
/** The floor closes instant at 11 PM (23:00) (no server answer only). */
export const INSTANT_CLOSE_HOUR = hour(process.env.EXPO_PUBLIC_INSTANT_CLOSE_HOUR, 23);

/** "6:00 AM" / "11:00 PM" for a whole-hour clock value. */
export function hourLabel(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm >= 12 ? 'PM' : 'AM';
  const hr = norm % 12 === 0 ? 12 : norm % 12;
  return `${hr}:00 ${ampm}`;
}

export type InstantWindow = {
  /** Inside the instant hours right now (the store's, or the floor's). */
  open: boolean;
  /** Shut because of the hours (not because the address isn't served). */
  closedForNight: boolean;
  /** "7:00 AM": when it opens next. Null while open, and for a pause (no time). */
  opensAtLabel: string | null;
  /** "Instant resumes tomorrow at 7:00 AM": the one line every surface shows. */
  note: string | null;
};

/** The instant part of one GET /serviceability answer, as the backend sent it. */
export type InstantAnswer = {
  /** `instant`: the lane is open at this point right now. */
  instant: boolean;
  /** `instantClosed`: the store would serve instant here, but it is shut now. */
  instantClosed: boolean;
  /** `instantResumesLabel`: "tomorrow at 7:00 AM", "when the store turns it back on". */
  resumesLabel: string | null;
  /** `instantResumesAt`: RFC3339 moment it resumes. Absent for a pause. */
  resumesAt: string | null;
};

/**
 * How long an answer speaks for the lane. Home re-asks every 30 s, and the
 * cart reminder looks 30 minutes ahead, so an answer from Home covers the
 * reminder. An older one (the app sat on another screen, or in the
 * background) is no answer, and the floor applies until the next one lands.
 */
const ANSWER_TTL_MS = 45 * 60 * 1000;

let answer: (InstantAnswer & { at: number }) | null = null;

/**
 * lib/serviceability calls this with every backend answer (at = when it
 * landed), and with null when there is none: a failed call, a local verdict,
 * sign-out. Not for screens.
 */
export function recordInstantAnswer(a: InstantAnswer | null, at: number = Date.now()): void {
  answer = a ? { ...a, at } : null;
}

const OPEN: InstantWindow = { open: true, closedForNight: false, opensAtLabel: null, note: null };

/** "7:00 AM" / "1:30 AM" for a moment, in IST: the backend's labels are IST. */
function istClockLabel(ms: number): string {
  const d = new Date(ms + 330 * 60 * 1000);
  const h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ampm}`;
}

/** The store's hours at `t`, from a fresh answer. */
function fromAnswer(a: InstantAnswer, t: number): InstantWindow {
  // Open, or not served at this address (the screens read `instant` for
  // that): either way the store's hours are not what shuts it.
  if (!a.instantClosed) return OPEN;
  const resumes = a.resumesAt ? Date.parse(a.resumesAt) : NaN;
  // The backend said when it comes back; past that moment it is back.
  if (Number.isFinite(resumes) && t >= resumes) return OPEN;
  return {
    open: false,
    closedForNight: true,
    opensAtLabel: Number.isFinite(resumes) ? istClockLabel(resumes) : null,
    note: `Instant resumes ${a.resumesLabel ?? 'soon'}`,
  };
}

/** The floor: OPEN_HOUR to CLOSE_HOUR local time. */
function floorWindow(now: Date): InstantWindow {
  const h = now.getHours() + now.getMinutes() / 60;
  // Windows that don't wrap midnight (6 → 23) and ones that do (e.g. 22 → 5)
  // are both handled, so overriding the hours can never invert the logic.
  const wraps = INSTANT_CLOSE_HOUR <= INSTANT_OPEN_HOUR;
  const open = wraps
    ? h >= INSTANT_OPEN_HOUR || h < INSTANT_CLOSE_HOUR
    : h >= INSTANT_OPEN_HOUR && h < INSTANT_CLOSE_HOUR;
  if (open) return OPEN;
  const opensAtLabel = hourLabel(INSTANT_OPEN_HOUR);
  return {
    open: false,
    closedForNight: true,
    opensAtLabel,
    note: `Instant opens at ${opensAtLabel}`,
  };
}

/**
 * Where the instant lane stands at `now`: the backend's answer while there is
 * a fresh one, else the floor. Synchronous, so any screen can call it during
 * render; pass a Date in tests.
 */
export function instantWindow(now: Date = new Date()): InstantWindow {
  const t = now.getTime();
  // Either side of the answer: Home's clock ticks every 30 s and may trail it.
  if (answer && Math.abs(t - answer.at) <= ANSWER_TTL_MS) return fromAnswer(answer, t);
  return floorWindow(now);
}

/** The morning lane is always orderable — it delivers in tomorrow's 5-7:30 window. */
export const MORNING_ALWAYS_OPEN = true;
