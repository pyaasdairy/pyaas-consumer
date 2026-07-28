import { useSyncExternalStore } from 'react';

/**
 * Shared delivery-mode store (Country-Delight-style instant checkout).
 * The home strip and the product/checkout screen read + write ONE mode so the
 * choice follows the member through the app:
 *   - 'instant'   → one-off order delivered ~90 min from placing (lane 'instant')
 *   - 'morning'   → the classic 5–7:30 AM morning slot (lane 'morning')
 *   - 'scheduled' → a picked date, delivered in that day's morning slot
 * Module-level state + subscribe (no zustand needed): both the hook and the
 * imperative getter see the same value, and any setter re-renders subscribers.
 */
export type DeliveryMode = 'instant' | 'morning' | 'scheduled';

let mode: DeliveryMode = 'morning';
const listeners = new Set<() => void>();

export function getDeliveryMode(): DeliveryMode {
  return mode;
}

export function setDeliveryMode(next: DeliveryMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook — re-renders when the shared delivery mode changes. */
export function useDeliveryMode(): DeliveryMode {
  return useSyncExternalStore(subscribe, getDeliveryMode, getDeliveryMode);
}

/** "Arriving by" clock time for an instant order: now + 90 min, local "HH:MM". */
export const INSTANT_ETA_MINUTES = 90;

export function instantEtaHHMM(from: Date = new Date()): string {
  const eta = new Date(from.getTime() + INSTANT_ETA_MINUTES * 60 * 1000);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(eta.getHours())}:${pad(eta.getMinutes())}`;
}

/** "HH:MM" (24h) → "6:30 PM" for display. Returns null on garbage. */
export function hhmmTo12(hhmm: string): string | null {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(Number.isNaN(m) ? 0 : m).padStart(2, '0')} ${ampm}`;
}

/** The morning delivery window sent on morning/scheduled lanes. */
export const MORNING_WINDOW = '05:00-07:30';
