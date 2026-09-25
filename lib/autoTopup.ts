import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { MIN_RECHARGE } from './pricing';
import { notify } from './notificationCenter';
import { getUserId } from './session';
import { isBackendConfigured } from './apiClient';
import { currentMandate } from './autopay';

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
 *
 * DONE (25 Sep, AutoPay funds the wallet): the server now runs Smart Recharge
 * off an ACTIVE UPI AutoPay mandate. This reminder preference stays the
 * member's REMINDER only: nothing chosen here (the card says "Nothing is
 * charged until you pay") ever reaches the mandate's server policy, which
 * only the AutoPay card / screen changes (walletApi.setupAutopay ->
 * updateMandatePolicy). The reminder stands down only while the server says
 * Smart Recharge is really topping this wallet up (the mandate's
 * smart_recharge_on: automatic top-ups switched on, the bank token
 * confirmed, not waiting for the member after refused debits); then the
 * member hears "money added" instead. The bank sends its own pre-debit
 * notice for each AutoPay debit.
 */

// PER ACCOUNT, not per device.
//
// These were two fixed keys, so on a shared phone whoever signed in next
// inherited the previous member's armed threshold and amount — and the setting
// outlived "delete my account", which promises the opposite. Suffixing with the
// uid keeps each account's preference to itself. Signed out (no uid) falls back
// to the bare key, which is also what an existing setting was stored under, so
// nobody loses what they had.
const KEY_BASE = 'pyaas_auto_topup';
const LAST_NUDGE_BASE = 'pyaas_auto_topup_last_nudge';

async function scopedKey(base: string): Promise<string> {
  const uid = await getUserId();
  return uid ? `${base}:${uid}` : base;
}

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

// ON by default (founder call, 21 Sep); the member can switch it off.
const DEFAULTS: AutoTopupPrefs = { on: true, threshold: 200, amount: MIN_RECHARGE };

let prefs: AutoTopupPrefs = DEFAULTS;
let hydrated = false;
// Whether the server is really topping the signed-in member's wallet up
// (the mandate's smart_recharge_on). An ACTIVE mandate alone is not enough:
// with automatic top-ups switched off on the server, a bank token not yet
// confirmed, or Smart Recharge waiting for the member after refused debits,
// nothing tops the wallet up and the reminder must still speak.
// null = not known yet this session.
let serverArmed: boolean | null = null;

/** walletApi.getAutopay reports the mandate it read (null forgets it). */
export function setServerAutopayArmed(armed: boolean | null): void {
  serverArmed = armed;
}

async function serverAutopayArmed(): Promise<boolean> {
  if (serverArmed !== null) return serverArmed;
  if (!isBackendConfigured()) return false;
  try {
    const m = await currentMandate();
    serverArmed = m?.smart_recharge_on === true;
    return serverArmed;
  } catch {
    return false; // unknown: the reminder still speaks
  }
}
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
    // This account's own setting, else the pre-scoping one written before the
    // key carried a uid (read once, then re-saved under the scoped key).
    const key = await scopedKey(KEY_BASE);
    const raw = (await AsyncStorage.getItem(key)) ?? (key === KEY_BASE ? null : await AsyncStorage.getItem(KEY_BASE));
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
  try { await AsyncStorage.setItem(await scopedKey(KEY_BASE), JSON.stringify(prefs)); } catch { /* best-effort */ }
  // The reminder only: the AutoPay policy (what the bank is charged) changes
  // from the AutoPay card / screen alone (walletApi.setupAutopay).
}

/** Forget this device's copy of the signed-in member's setting (sign-out,
 *  account deletion). Without it the next member on the phone inherits it. */
export async function clearAutoTopup(): Promise<void> {
  try { await AsyncStorage.removeItem(await scopedKey(KEY_BASE)); } catch { /* best-effort */ }
  try { await AsyncStorage.removeItem(await scopedKey(LAST_NUDGE_BASE)); } catch { /* best-effort */ }
  prefs = { ...DEFAULTS };
  hydrated = false;
  serverArmed = null;
  emit();
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
    // Smart Recharge is topping this wallet up: no "time to top up" nag.
    if (await serverAutopayArmed()) return;
    const today = new Date().toISOString().slice(0, 10);
    const nudgeKey = await scopedKey(LAST_NUDGE_BASE);
    const last = await AsyncStorage.getItem(nudgeKey);
    if (last === today) return;
    await AsyncStorage.setItem(nudgeKey, today);
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
