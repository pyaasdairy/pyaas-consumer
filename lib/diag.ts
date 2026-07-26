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

export function logDiag(e: Omit<DiagEvent, 'ts'>): void {
  events = [{ ts: Date.now(), ...e }, ...events].slice(0, MAX_EVENTS);
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
