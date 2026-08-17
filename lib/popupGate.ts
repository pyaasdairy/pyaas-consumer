import { useEffect, useSyncExternalStore } from 'react';

/**
 * POPUP ARBITER — at most ONE auto-presented popup on screen, ever.
 *
 * Every self-opening surface (out-of-zone sheet, welcome offer, claim flow,
 * the money nudges) registers while visible via {@link usePopupSlot}. Anything
 * that wants to AUTO-OPEN first asks {@link anyPopupOpen}; anything that wants
 * to auto-RENDER subtracts itself via {@link useOtherPopupsOpen}. Popups the
 * member opened by tapping (sheets behind an explicit button) don't register:
 * the rule exists for surfaces that present themselves.
 */

let count = 0;
const subs = new Set<() => void>();
const emit = () => { for (const cb of subs) cb(); };

export function anyPopupOpen(): boolean {
  return count > 0;
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** Register this popup while `visible`. Call from the component that OWNS the
 *  visible flag (not from inside the Modal). */
export function usePopupSlot(visible: boolean): void {
  useEffect(() => {
    if (!visible) return;
    count += 1; emit();
    return () => { count -= 1; emit(); };
  }, [visible]);
}

/** Reactive: are popups OTHER than mine on screen? (Subtracts my own slot so a
 *  surface can both register and gate on the rest.) */
export function useOtherPopupsOpen(selfVisible: boolean): boolean {
  const total = useSyncExternalStore(subscribe, () => count, () => count);
  return total - (selfVisible ? 1 : 0) > 0;
}
