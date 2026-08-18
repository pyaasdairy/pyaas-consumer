import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, type ModalProps } from 'react-native';

/**
 * SAFE MODAL — the ONLY way this app may present a react-native <Modal>.
 *
 * WHY THIS EXISTS (verified against RN 0.85.3 native source): RN issues
 * `presentViewController:` / `dismissViewControllerAnimated:` synchronously,
 * mid-commit, with no queue and an `_isPresented` flag it flips optimistically
 * BEFORE the ~300-500ms transition finishes. Two Modal `visible` flips in one
 * commit (a sheet closing while a capture sheet opens, a fullScreen map and its
 * fullScreen parent dismissing together, a fast open/close toggle) therefore
 * race UIKit's one-transition-at-a-time presentation stack. The failure modes
 * are a silently swallowed present (dead CTA, stuck `visible` flag) or — when a
 * parent is dismissed while its child is still presented — a WRONG-TARGET
 * dismiss that leaks an empty presented view controller over a detached screen:
 * the black, touch-eating, frozen window users hit while toggling the address
 * changer.
 *
 * THE FIX: a module-global sequencer grants ONE native modal transition at a
 * time, app-wide:
 *   · dismissals are granted before presents (a swap is always
 *     slide-out-fully, then slide-in), and among dismissals the TOPMOST
 *     presented modal goes first (strict LIFO teardown — a parent's dismiss is
 *     never issued while its child is up, so the wrong-target chain cannot
 *     start);
 *   · a present releases the queue on native onShow (fires in the present
 *     completion block on iOS; when the dialog window shows on Android);
 *   · a dismiss releases on onDismiss on iOS (its dismiss completion block) —
 *     Android NEVER emits onDismiss, so there a dismiss releases on the next
 *     tick, which is sound because Android Dialogs are independent windows
 *     that need no dismissal serialization;
 *   · a 700ms watchdog (longer than any slide) releases the queue if a
 *     completion never arrives — e.g. a present swallowed by an OS alert or a
 *     navigator transition — so the queue can never deadlock. A watchdogged
 *     present retries ONCE, which self-heals the "modal flag stuck true, CTA
 *     reads as dead" states this codebase used to hack around with timers.
 *
 * Rapid toggles COALESCE: the `visible` prop is only a target. While a
 * transition is in flight, target changes just edit the queue; after each
 * completion the instance reconciles target vs native state and enqueues at
 * most one more transition. The native side never sees a flip mid-animation.
 *
 * Cost: an idle-queue present is granted in the same effect pass (one
 * sub-frame commit). iOS swap handoffs wait out the outgoing dismissal the
 * user is watching anyway; Android gains ~0-16ms.
 */

type Instance = {
  id: number;
  /** Perform the queued transition NOW. Returns the kind started, or null if
   *  target and native state already agree (nothing to do). */
  perform: () => 'present' | 'dismiss' | null;
  /** What this instance WOULD do if granted now — used for grant ordering. */
  intent: () => 'present' | 'dismiss' | null;
};

let nextId = 1;
const queued: Instance[] = [];
const presentedStack: number[] = [];
let inFlight: { id: number; kind: 'present' | 'dismiss'; watchdog: ReturnType<typeof setTimeout>; retried: boolean } | null = null;
const settledWaiters: Array<() => void> = [];

/** Resolves when no modal transition is queued or in flight — await this
 *  before unmounting a screen that hosts presented modals (e.g. router.back
 *  from a modal-bearing route), so navigation never tears a presented stack
 *  out from under UIKit. */
export function modalsSettled(): Promise<void> {
  if (!inFlight && queued.length === 0) return Promise.resolve();
  return new Promise((res) => settledWaiters.push(res));
}

function flushSettledWaiters() {
  if (inFlight || queued.length > 0) return;
  while (settledWaiters.length) settledWaiters.shift()!();
}

function pickNext(): Instance | null {
  if (queued.length === 0) return null;
  // Dismissals first; among them, the one topmost in the presented stack.
  let best: Instance | null = null;
  let bestDepth = -1;
  for (const inst of queued) {
    if (inst.intent() !== 'dismiss') continue;
    const depth = presentedStack.lastIndexOf(inst.id);
    if (depth >= bestDepth) {
      best = inst;
      bestDepth = depth;
    }
  }
  if (best) return best;
  return queued[0]; // presents in FIFO order
}

function grantLoop() {
  while (!inFlight) {
    const inst = pickNext();
    if (!inst) break;
    queued.splice(queued.indexOf(inst), 1);
    const kind = inst.perform();
    if (!kind) continue; // target already satisfied — nothing started
    const watchdog = setTimeout(() => onWatchdog(inst.id), 700);
    inFlight = { id: inst.id, kind, watchdog, retried: false };
    return;
  }
  flushSettledWaiters();
}

function release(id: number, expected: 'present' | 'dismiss') {
  if (!inFlight || inFlight.id !== id || inFlight.kind !== expected) return;
  clearTimeout(inFlight.watchdog);
  inFlight = null;
  grantLoop();
}

const registry = new Map<number, { retryPresent: () => void }>();

function onWatchdog(id: number) {
  if (!inFlight || inFlight.id !== id) return;
  const { kind, retried } = inFlight;
  if (kind === 'dismiss') {
    // Completion lost (or Android, where none exists for odd paths): treat the
    // dismissal as done so the queue moves on.
    const i = presentedStack.lastIndexOf(id);
    if (i >= 0) presentedStack.splice(i, 1);
    inFlight = null;
    grantLoop();
    return;
  }
  // A present that never signalled onShow was swallowed by UIKit. Retry once
  // (flip native visible off, re-enqueue), then give up and free the queue.
  inFlight = null;
  const inst = registry.get(id);
  if (inst && !retried) {
    inst.retryPresent();
    // mark the retry so a second swallow doesn't loop forever
    const wd = setTimeout(() => onWatchdog(id), 700);
    inFlight = { id, kind: 'present', watchdog: wd, retried: true };
    return;
  }
  grantLoop();
}

export function SafeModal(props: ModalProps & { children?: React.ReactNode }) {
  const { visible = false, onShow, onDismiss, children, ...rest } = props;
  const [shown, setShown] = useState(false);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextId++;
  const id = idRef.current;

  const targetRef = useRef(visible);
  targetRef.current = visible;
  const shownRef = useRef(false);

  const instRef = useRef<Instance | null>(null);
  if (!instRef.current) {
    instRef.current = {
      id,
      intent: () => {
        if (targetRef.current === shownRef.current) return null;
        return targetRef.current ? 'present' : 'dismiss';
      },
      perform: () => {
        if (targetRef.current === shownRef.current) return null;
        const kind = targetRef.current ? 'present' : 'dismiss';
        shownRef.current = targetRef.current;
        setShown(targetRef.current);
        if (kind === 'dismiss' && Platform.OS !== 'ios') {
          // Android never emits onDismiss — release on the next tick.
          setTimeout(() => {
            const i = presentedStack.lastIndexOf(id);
            if (i >= 0) presentedStack.splice(i, 1);
            release(id, 'dismiss');
          }, 0);
        }
        return kind;
      },
    };
  }

  const reconcile = useCallback(() => {
    const inst = instRef.current!;
    if (inFlight?.id === id) return; // our own transition is running — reconcile again on completion
    if (!queued.includes(inst) && inst.intent()) queued.push(inst);
    grantLoop();
  }, [id]);

  useEffect(() => {
    registry.set(id, {
      retryPresent: () => {
        // The native present was swallowed: flip the native flag off, then —
        // after that commit lands — back on, while onWatchdog keeps the queue
        // locked on this instance so nothing interleaves with the retry.
        shownRef.current = false;
        setShown(false);
        setTimeout(() => {
          if (targetRef.current && inFlight?.id === id) {
            shownRef.current = true;
            setShown(true);
          }
        }, 60);
      },
    });
    return () => {
      registry.delete(id);
      const inst = instRef.current!;
      const qi = queued.indexOf(inst);
      if (qi >= 0) queued.splice(qi, 1);
      const si = presentedStack.lastIndexOf(id);
      if (si >= 0) presentedStack.splice(si, 1);
      if (inFlight?.id === id) {
        clearTimeout(inFlight.watchdog);
        inFlight = null;
      }
      grantLoop();
    };
  }, [id]);

  useEffect(() => {
    reconcile();
  }, [visible, reconcile]);

  return (
    <Modal
      {...rest}
      visible={shown}
      onShow={(e) => {
        if (!presentedStack.includes(id)) presentedStack.push(id);
        release(id, 'present');
        onShow?.(e);
        // target may have flipped while we were presenting
        reconcile();
      }}
      onDismiss={() => {
        const i = presentedStack.lastIndexOf(id);
        if (i >= 0) presentedStack.splice(i, 1);
        release(id, 'dismiss');
        onDismiss?.();
        reconcile();
      }}
    >
      {children}
    </Modal>
  );
}
