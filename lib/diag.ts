/**
 * In-app diagnostics: a ring buffer of every API failure and auth event so
 * field issues can be read off the device (Profile → Diagnostics) instead of
 * guessed from server logs. Holds the last 200 events in memory — nothing is
 * sent anywhere, nothing sensitive is stored (never tokens, only presence).
 */

export type DiagKind = 'api-error' | 'network' | 'auth' | 'event';

export interface DiagEvent {
  ts: number;
  kind: DiagKind;
  message: string;
  method?: string;
  path?: string;
  status?: number;
}

const MAX_EVENTS = 200;
let events: DiagEvent[] = [];
const subscribers = new Set<() => void>();

/**
 * CENTRAL REDACTION — no caller should ever pass a phone number, OTP, token
 * or address into a diag line, but a server error message echoed into
 * `message` could carry one anyway. Scrub the recognisable shapes before the
 * line is stored, so the ring buffer is safe BY CONSTRUCTION:
 *   - 10+ digit runs (Indian mobiles, with or without +91/spacing) → ●●●
 *   - otp/code/token/key/authorization "=<value>" pairs → key=●●●
 *   - long base64/JWT-looking blobs → ●●●
 */
function redact(s: string): string {
  return s
    .replace(/(\+?91[\s-]?)?\d[\d\s-]{8,}\d/g, '●●●')
    .replace(/\b(otp|code|token|secret|key|authorization|auth)\b(["'\s:=]+)[^\s&"',}]+/gi, '$1$2●●●')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '●●●')
    .replace(/\b[A-Za-z0-9+/=_-]{40,}\b/g, '●●●');
}

export function logDiag(e: Omit<DiagEvent, 'ts'>): void {
  const scrubbed: Omit<DiagEvent, 'ts'> = {
    ...e,
    message: redact(e.message),
    path: e.path ? redact(e.path) : e.path,
  };
  events = [{ ts: Date.now(), ...scrubbed }, ...events].slice(0, MAX_EVENTS);
  subscribers.forEach((fn) => fn());
}

export function getDiagEvents(): DiagEvent[] {
  return events;
}

export function clearDiag(): void {
  events = [];
  subscribers.forEach((fn) => fn());
}

export function subscribeDiag(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Human label for an event's severity bucket (drives the row colour). */
export function diagSeverity(e: DiagEvent): 'error' | 'warn' | 'info' {
  if (e.kind === 'auth') return 'warn';
  if (e.kind === 'network') return 'warn';
  if (e.kind === 'api-error') return e.status && e.status >= 500 ? 'error' : 'warn';
  return 'info';
}
