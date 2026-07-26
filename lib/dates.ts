/**
 * Small date helpers for the subscription ordering flow. All ISO dates are
 * `YYYY-MM-DD` parsed at LOCAL midnight (the `T00:00:00` suffix) so the calendar
 * never drifts a day across timezones.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
export function todayISO(): string {
  return isoOf(new Date());
}
export function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
export function tomorrowISO(): string {
  return addDaysISO(todayISO(), 1);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** "17 Jun 2026" */
export function formatShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
/** "Wed, 17th June" */
export function formatWeekday(iso: string): string {
  const d = parseISO(iso);
  return `${WD_SHORT[d.getDay()]}, ${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`;
}
/** "June 2026" */
export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}

/** "6:00 AM" from "06:00". */
export function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.padStart(2, '0')} ${ampm}`;
}

/** "between 6:00 AM and 7:00 AM" from a "06:00-07:00" delivery window. */
export function formatDeliveryWindow(window: string | null | undefined): string {
  if (!window || !window.includes('-')) return 'in the morning';
  const [a, b] = window.split('-');
  return `between ${formatTime12(a)} and ${formatTime12(b)}`;
}

/** Calendar grid (weeks of 7) for a month; null = empty leading/trailing cell. */
export function monthGrid(year: number, month0: number): (number | null)[][] {
  const firstDay = new Date(year, month0, 1).getDay(); // 0=Sun
  const daysIn = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
