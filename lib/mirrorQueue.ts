import { getRows, setRows } from './localStore';
import { getUserId } from './session';
import { isBackendConfigured, HttpError } from './apiClient';
import { logDiag } from './diag';

/**
 * THE DURABLE MIRROR QUEUE — the fix for the app's one systemic persistence
 * defect: every backend mirror used to be a single-shot
 * `void api.post(...).catch(() => undefined)`. One dropped request and the
 * phone and the server disagreed FOREVER — a lost pause kept the backend
 * billing and shipping milk the customer stopped; a lost set-default kept
 * deliveries going to the old door; a lost vacation mirror billed a holiday.
 *
 * Model:
 *  - Ops are TARGETS, not payloads. `enqueueMirror(kind, target)` persists a
 *    row keyed `kind:target`; enqueueing the same key again just re-arms it
 *    (LAST-WRITE-WINS by construction, because the handler reads the CURRENT
 *    local state at drain time — never a stale captured body).
 *  - `drainMirrorQueue()` replays FIFO. A handler returns:
 *      'done'  → op removed;
 *      'retry' → op kept AND the drain stops (order preserved: a sub-status
 *                must never overtake the sub-create that mints its twin);
 *      'drop'  → op removed with a diagnostic (permanent 4xx — retrying would
 *                loop forever; the local state stays visible so the customer
 *                can redo the action).
 *  - Triggers: app boot, foreground, after every enqueue, and before the
 *    on-device subscription sweep. Offline enqueues simply wait — AsyncStorage
 *    survives restarts, so the intent lands on the next connective moment.
 *
 * Handlers are registered by their domain modules (subscriptions.ts, api.ts,
 * deliveryPrefs.ts) at import time — this file knows transport + persistence
 * only, so there are no circular imports.
 */

export type MirrorOutcome = 'done' | 'retry' | 'drop';
export type MirrorHandler = (target: string) => Promise<MirrorOutcome>;

type MirrorOp = {
  id: string; // `${kind}:${target}` — the collapse key
  kind: string;
  target: string;
  queued_at: string;
  attempts?: number;
};

const TABLE = 'mirror_queue';
const handlers = new Map<string, MirrorHandler>();

export function registerMirrorHandler(kind: string, fn: MirrorHandler): void {
  handlers.set(kind, fn);
}

/** Classify an error: permanent client errors drop, everything else retries. */
export function mirrorOutcomeFor(e: unknown): MirrorOutcome {
  if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
    return 'drop';
  }
  return 'retry';
}

/** Persist the intent, then try to flush immediately (error-soft). */
export async function enqueueMirror(kind: string, target = ''): Promise<void> {
  if (!isBackendConfigured()) return; // local mode has no twin to mirror
  const uid = await getUserId();
  if (!uid) return;
  const id = `${kind}:${target}`;
  const rows = await getRows<MirrorOp>(TABLE, uid);
  const next = rows.filter((r) => r.id !== id);
  next.push({ id, kind, target, queued_at: new Date().toISOString() });
  await setRows<MirrorOp>(TABLE, uid, next);
  void drainMirrorQueue();
}

let draining: Promise<void> | null = null;

/** Replay pending mirrors in order. Concurrent callers share one drain. */
export function drainMirrorQueue(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    try {
      if (!isBackendConfigured()) return;
      const uid = await getUserId();
      if (!uid) return;
      // Loop until clean or blocked: a drained op may enqueue a follow-up
      // (sub-create → vacations), so re-read each pass.
      for (let pass = 0; pass < 10; pass++) {
        const rows = await getRows<MirrorOp>(TABLE, uid);
        if (rows.length === 0) return;
        const op = rows[0];
        const fn = handlers.get(op.kind);
        let outcome: MirrorOutcome;
        if (!fn) {
          outcome = 'drop'; // unknown op from an older build — never wedge the queue
        } else {
          try {
            outcome = await fn(op.target);
          } catch (e) {
            outcome = mirrorOutcomeFor(e);
          }
        }
        if (outcome === 'retry') {
          const bumped = (op.attempts ?? 0) + 1;
          await setRows<MirrorOp>(TABLE, uid, [{ ...op, attempts: bumped }, ...rows.slice(1)]);
          logDiag({ kind: 'event', method: op.kind, path: op.target, message: `mirror retry — attempt ${bumped}, will replay` });
          return; // stop: order matters, connectivity will re-trigger us
        }
        if (outcome === 'drop') {
          logDiag({ kind: 'event', method: op.kind, path: op.target, message: 'mirror dropped — permanent rejection' });
        }
        const after = await getRows<MirrorOp>(TABLE, uid);
        await setRows<MirrorOp>(TABLE, uid, after.filter((r) => r.id !== op.id));
      }
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/** True when a mirror is still pending for this key — server-wins refreshes
 *  must not clobber a local intent that has not landed yet. */
export async function mirrorPending(kind: string, target = ''): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  const rows = await getRows<MirrorOp>(TABLE, uid);
  const id = `${kind}:${target}`;
  return rows.some((r) => r.id === id || (kind === '*' && r.id.length > 0));
}
