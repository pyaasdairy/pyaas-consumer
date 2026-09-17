import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { MIN_RECHARGE } from './pricing';
import { notify } from './notificationCenter';

/**
 * AUTO TOP-UP — the "never run dry" setting a member can switch on BEFORE they
 * are asked to type an amount (founder call, 18 Sep: "give an autopay setup for
 * the consumer before asking them to recharge a custom amount").
 *
 * WHAT IT DOES TODAY, HONESTLY: it is a WATCH, not a debit. The member picks
 * the balance they never want to fall below and the amount they normally add;
 * the app then watches every balance refresh and, the moment they dip under
 * that line, sends a notification with a one-tap recharge for exactly that
 * amount. No money moves without the member tapping pay.
 *
 * WHY IT IS NOT A MANDATE YET: a true UPI AutoPay mandate needs the recurring
 * checkout wired end to end (lib/autopay + the backend's /consumer/mandate/*
 * and a PSP that can actually collect). Shipping a button that claims to debit
 * automatically while approval cannot complete is exactly the dead payment
 * flow App Review has already rejected once on this app. So the promise here
 * is the one the app can keep, and the copy says so in the member's words.
 *
 * FOR THE CO-DEV: when recurring collection is live, keep this preference as
 * the source of truth for threshold + amount and swap `armed` for the real
 * mandate state; the reminder becomes the pre-debit notice NPCI requires.
 */

const KEY = 'pyaas_auto_topup';
const LAST_NUDGE = 'pyaas_auto_topup_last_nudge';

export type AutoTopupPrefs = {
  /** The member switched it on. */
  on: boolean;
  /** Balance we should never fall below (₹). */
  threshold: number;
  /** Amount to add when we do (₹). Never below the recharge floor. */
  amount: number;
};

export const THRESHOLD_CHOICES = [100, 200, 300];
export const AMOUNT_CHOICES = [MIN_RECHARGE, 1000, 2000];

const DEFAULTS: AutoTopupPrefs = { on: false, threshold: 200, amount: MIN_RECHARGE };

let prefs: AutoTopupPrefs = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getAutoTopup(): AutoTopupPrefs {
  return prefs;
}

/** React hook — re-renders when the preference changes. */
export function useAutoTopup(): AutoTopupPrefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getAutoTopup,
    getAutoTopup,
  );
}

export async function hydrateAutoTopup(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<AutoTopupPrefs>;
    prefs = {
      on: !!p.on,
      threshold: Number(p.threshold) > 0 ? Math.round(Number(p.threshold)) : DEFAULTS.threshold,
      amount: Math.max(MIN_RECHARGE, Number(p.amount) > 0 ? Math.round(Number(p.amount)) : DEFAULTS.amount),
    };
    emit();
  } catch {
    /* unreadable storage — defaults stand */
  }
}

export async function setAutoTopup(next: Partial<AutoTopupPrefs>): Promise<void> {
  prefs = {
    on: next.on ?? prefs.on,
    threshold: next.threshold ?? prefs.threshold,
    amount: Math.max(MIN_RECHARGE, next.amount ?? prefs.amount),
  };
  emit();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* best-effort */ }
}

/**
 * Called on every balance refresh. When the watch is armed and the balance has
 * fallen under the line, raise ONE notification per day with a one-tap
 * recharge for the member's chosen amount.
 */
export async function checkAutoTopup(balance: number): Promise<void> {
  try {
    await hydrateAutoTopup();
    if (!prefs.on) return;
    if (balance >= prefs.threshold) return;
    const today = new Date().toISOString().slice(0, 10);
    const last = await AsyncStorage.getItem(LAST_NUDGE);
    if (last === today) return;
    await AsyncStorage.setItem(LAST_NUDGE, today);
    await notify({
      kind: 'wallet',
      title: 'Time to top up',
      body: `Your balance is under ₹${prefs.threshold}. Add ₹${prefs.amount} so your mornings keep coming.`,
      href: `/recharge?amount=${prefs.amount}&reason=to keep your mornings running`,
      dedupe: `autotopup:${today}`,
    });
  } catch {
    /* a reminder must never break a balance read */
  }
}
