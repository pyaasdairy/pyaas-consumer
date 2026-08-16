import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getUserId } from './session';
import { getSingle, putSingle } from './localStore';
import { isBackendConfigured, api } from './apiClient';
import { todayISO, parseISO } from './dates';

/**
 * THE "2 FREE + 2" TRIAL. Applies to PYAAS Taaza toned milk only.
 *
 * A new member's daily-milk subscription opens with a four-day trial:
 *   • days 1–2  → FREE   (nothing is debited; the sweep still places the daily
 *                         order so milk arrives, and the order is marked
 *                         trial_free so it reads FREE on the orders list)
 *   • days 3–4  → PAID   (₹29/day, the wallet is debited as normal)
 * after which the subscription simply continues at ₹29/day until paused.
 *
 * WHY THE ORDER FLIPPED. This used to charge days 1–2 and free days 3–4, while
 * assets/banners/home-banner-1.png told every member on the home screen "Your
 * first 2 days are completely free" and banner 2 spelled out "Day 1 FREE /
 * Day 2 FREE". Charging for days the first screen of the app gives away is a
 * false claim (Play's Deceptive Behavior policy), and the app was removed from
 * Play once already. The marketing was the promise; the code now keeps it.
 *
 * There was a second, quieter defect: nothing local ever honoured the free days
 * at all. lib/subscriptionSweep.ts debited the full cost on every delivery and
 * never read the phase — only a live backend was going to zero it. The sweep now
 * checks the phase itself, so the free days are free in both modes.
 *
 * The trial is OWNED BY THE BACKEND once it is live (GET /consumer/trial/me);
 * this module normalises that response and, in the local/no-backend demo,
 * derives the exact same phase from a per-user anchor row written by the claim /
 * subscribe flows (beginTrial). Both paths produce the identical {@link Trial}
 * shape so every screen renders the same "Day 1 of 2 · paid" / "Day 3 of 4 ·
 * FREE 🎉" chip regardless of mode.
 */

export const TRIAL_PAID_DAYS = 2;
export const TRIAL_FREE_DAYS = 2;
export const TRIAL_TOTAL_DAYS = TRIAL_PAID_DAYS + TRIAL_FREE_DAYS;

const TRIAL_TABLE = 'trial'; // per-user local anchor: { start_date }

export type TrialPhase = 'paid' | 'free' | 'completed' | 'none';

export type Trial = {
  /** Whether the member is currently inside the paid or free trial window. */
  active: boolean;
  phase: TrialPhase;
  /** 1-based day across the whole 4-day trial (0 before day 1 / never started). */
  overallDay: number;
  paidDays: number;
  freeDays: number;
  totalDays: number;
  /** ISO date (YYYY-MM-DD) of day 1 = the first delivery, or null. */
  startDate: string | null;
};

export const NO_TRIAL: Trial = {
  active: false,
  phase: 'none',
  overallDay: 0,
  paidDays: TRIAL_PAID_DAYS,
  freeDays: TRIAL_FREE_DAYS,
  totalDays: TRIAL_TOTAL_DAYS,
  startDate: null,
};

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86400000);
}

/**
 * FREE DAYS COME FIRST. Days 1..freeDays are free, then the balance is paid.
 * The argument order is kept as (paidDays, totalDays) so every existing caller
 * still compiles; freeDays is derived, because totalDays - paidDays is exactly
 * the free window.
 */
function phaseFor(overallDay: number, paidDays: number, totalDays: number): TrialPhase {
  if (overallDay < 1) return 'none';
  const freeDays = Math.max(0, totalDays - paidDays);
  if (overallDay <= freeDays) return 'free';
  if (overallDay <= totalDays) return 'paid';
  return 'completed';
}

/** Derive the trial phase from a day-1 anchor date (local / no-backend mode). */
function computeTrial(startDate: string): Trial {
  const overallDay = daysBetween(startDate, todayISO()) + 1;
  const phase = phaseFor(overallDay, TRIAL_PAID_DAYS, TRIAL_TOTAL_DAYS);
  return {
    active: phase === 'paid' || phase === 'free',
    phase,
    overallDay: Math.max(0, overallDay),
    paidDays: TRIAL_PAID_DAYS,
    freeDays: TRIAL_FREE_DAYS,
    totalDays: TRIAL_TOTAL_DAYS,
    startDate,
  };
}

// The backend contract is intentionally forgiving. Three shapes are accepted:
//   1. The live backend (trial.go trialView): DELIVERED-day counts + a phase,
//      { phase, deliveredPaid, deliveredFree, paidRemaining, freeRemaining, freeActive }.
//   2. A legacy computed shape: { phase, current_day/day, paid_days/free_days }.
//   3. A bare local anchor: { start_date } → derive the phase from the calendar.
type RawTrial = {
  // (1) backend "2+2" ledger shape, camelCase, delivered-day counts.
  phase?: string;
  deliveredPaid?: number;
  deliveredFree?: number;
  paidRemaining?: number;
  freeRemaining?: number;
  freeActive?: boolean;
  // (2)/(3) legacy + anchor shapes.
  active?: boolean;
  start_date?: string | null;
  current_day?: number;
  day?: number;
  paid_days?: number;
  free_days?: number;
};

/** Map the backend phase (paid|free|done) onto the UI phase (…|completed). */
function mapBackendPhase(raw: string | undefined, deliveredPaid: number, deliveredFree: number, paidDays: number, totalDays: number): TrialPhase {
  if (raw === 'done' || raw === 'completed') return 'completed';
  if (raw === 'paid' || raw === 'free' || raw === 'none') return raw as TrialPhase;
  if (deliveredPaid < paidDays) return 'paid';
  if (deliveredPaid + deliveredFree < totalDays) return 'free';
  return 'completed';
}

function normalizeRemote(r: RawTrial): Trial {
  // (1) Backend "2+2" ledger: delivered-day counts drive the day number so the
  // chip advances with real deliveries ("Day 1 of 2 · paid" / "Day 3 of 4 · FREE").
  const hasLedger =
    r.deliveredPaid != null || r.deliveredFree != null ||
    r.paidRemaining != null || r.freeRemaining != null;
  if (hasLedger) {
    const deliveredPaid = r.deliveredPaid ?? 0;
    const deliveredFree = r.deliveredFree ?? 0;
    const paidDays = deliveredPaid + (r.paidRemaining ?? Math.max(0, TRIAL_PAID_DAYS - deliveredPaid));
    const freeDays = deliveredFree + (r.freeRemaining ?? Math.max(0, TRIAL_FREE_DAYS - deliveredFree));
    const totalDays = paidDays + freeDays;
    const phase = mapBackendPhase(r.phase, deliveredPaid, deliveredFree, paidDays, totalDays);
    // The day you're currently ON: within the paid window, deliveredPaid+1; within
    // the free window, past all paid days + deliveredFree+1; else 0 (done/none).
    let overallDay = 0;
    if (phase === 'paid') overallDay = deliveredPaid + 1;
    else if (phase === 'free') overallDay = paidDays + deliveredFree + 1;
    return {
      active: phase === 'paid' || phase === 'free',
      phase,
      overallDay,
      paidDays,
      freeDays,
      totalDays,
      startDate: r.start_date ?? null,
    };
  }

  // (3) Bare anchor: derive everything from the day-1 date.
  if (r.start_date && r.current_day == null && r.day == null && !r.phase) {
    return computeTrial(r.start_date);
  }

  // (2) Legacy computed shape: an explicit current_day/day + optional phase.
  const paidDays = r.paid_days ?? TRIAL_PAID_DAYS;
  const freeDays = r.free_days ?? TRIAL_FREE_DAYS;
  const totalDays = paidDays + freeDays;
  const overallDay = r.current_day ?? r.day ?? 0;
  const phase = (['paid', 'free', 'completed', 'none'].includes(String(r.phase))
    ? (r.phase as TrialPhase)
    : phaseFor(overallDay, paidDays, totalDays));
  return {
    active: r.active ?? (phase === 'paid' || phase === 'free'),
    phase,
    overallDay,
    paidDays,
    freeDays,
    totalDays,
    startDate: r.start_date ?? null,
  };
}

/**
 * The signed-in member's trial. Prefers the backend (GET /consumer/trial/me);
 * falls back to the local anchor for the offline demo. Always resolves to a
 * {@link Trial} (NO_TRIAL when signed out / never subscribed).
 */
export async function getTrial(): Promise<Trial> {
  const uid = await getUserId();
  if (!uid) return NO_TRIAL;
  if (isBackendConfigured()) {
    try {
      const raw = await api.get<RawTrial>('/trial/me');
      return normalizeRemote(raw);
    } catch {
      // Endpoint not deployed yet / transient — fall through to the local anchor
      // so the trial chip still works against a locally-started subscription.
    }
  }
  const row = await getSingle<{ start_date: string }>(TRIAL_TABLE, uid);
  if (!row?.start_date) return NO_TRIAL;
  return computeTrial(row.start_date);
}

/**
 * Anchor day 1 of the trial at `startDate` (the first delivery date). Idempotent:
 * the ORIGINAL anchor is kept so a second subscription never re-arms the trial.
 * A no-op when the backend owns the trial is harmless — getTrial reads the server
 * first, so this local row is only ever consulted in the offline demo.
 */
export async function beginTrial(startDate: string): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  const existing = await getSingle<{ start_date: string }>(TRIAL_TABLE, uid);
  if (existing?.start_date) return;
  await putSingle<{ start_date: string }>(TRIAL_TABLE, uid, { start_date: startDate });
}

/** The chip copy for the current phase, or null when there is nothing to show. */
export function trialLabel(t: Trial): string | null {
  if (!t.active) return null;
  if (t.phase === 'paid') return `Day ${t.overallDay} of ${t.paidDays} · paid`;
  if (t.phase === 'free') return `Day ${t.overallDay} of ${t.totalDays} · FREE 🎉`;
  return null;
}

/**
 * Self-loading trial hook. Refetches on screen focus (so the phase advances a day
 * without a manual reload) and exposes `refresh` for imperative re-pulls.
 */
export function useTrial(): { trial: Trial; loaded: boolean; refresh: () => void } {
  const [trial, setTrial] = useState<Trial>(NO_TRIAL);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    let on = true;
    getTrial()
      .then((t) => { if (on) { setTrial(t); setLoaded(true); } })
      .catch(() => { if (on) { setTrial(NO_TRIAL); setLoaded(true); } });
    return () => { on = false; };
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  return { trial, loaded, refresh };
}
