import { requireUserId } from './session';
import { getRows, setRows, getSingle, putSingle, newId } from './localStore';
import { rechargeBonus, LOW_BALANCE_THRESHOLD } from './pricing';
import { api, isBackendConfigured } from './apiClient';
import {
  currentMandate,
  createMandate,
  approveMandate as approveMandateOnPsp,
  cancelMandate as cancelMandateOnPsp,
  executeMandate,
} from './autopay';

/**
 * PARAG wallet — APPEND-ONLY LEDGER model.
 *
 * Every money event is one immutable row in the on-device `wallet_ledger` table
 * (never mutated in place; corrections are new rows). The current balance is a
 * derived fold over that ledger, so the books always reconcile and there is a
 * full audit trail. Two sub-balances are tracked:
 *   - CASH  : real money the member topped up (recharge principal, refunds).
 *   - PROMO : rewards / cashback / recharge bonuses (spent first, never withdrawn).
 * `available = cash + promo`. Pending (not-yet-settled) and locked (held for an
 * in-flight debit) amounts are exposed separately.
 *
 * Local-first: this runs entirely against lib/localStore. When parag-api is live
 * these map onto the seam below (the shapes already match a real ledger table):
 *   TODO(api): GET  /wallet/balances     -> getBalances()
 *   TODO(api): GET  /wallet/ledger       -> getLedger(filters)
 *   TODO(api): POST /wallet/recharge     -> rechargeWallet(amount, method)
 *   TODO(api): POST /wallet/debit        -> debitWallet(amount, ref)
 *   TODO(api): POST /wallet/refund       -> refundToWallet(...)
 *   TODO(api): POST /wallet/promo-credit -> addPromoCredit(...)
 *   TODO(api): GET/POST /wallet/autopay  -> getAutopay/setupAutopay/cancelAutopay
 * Recharge here credits locally (principal + bonus tier) as a placeholder for a
 * real PSP; wire the founder's own gateway keys + a server-verified callback in
 * production, landing the verified success on rechargeWallet().
 */

// ── Ledger row shape ─────────────────────────────────────────────────────────
export type LedgerType = 'credit' | 'debit' | 'refund' | 'reward' | 'adjustment';
export type LedgerRefType = 'order' | 'payment' | 'refund' | 'recharge' | 'reward' | 'adjustment' | 'seed';
export type LedgerStatus = 'success' | 'pending' | 'reversed';
export type LedgerBucket = 'cash' | 'promo';

export type WalletLedgerRow = {
  id: string;
  type: LedgerType;
  amount: number;               // always positive; `type` carries the direction
  bucket: LedgerBucket;         // which sub-balance this row moves
  opening_balance: number;      // total available BEFORE this row
  closing_balance: number;      // total available AFTER this row
  ref_id: string | null;        // idempotency + linkage key (order id, receipt…)
  ref_type: LedgerRefType;
  status: LedgerStatus;
  source: string;               // 'app' | 'gateway' | 'system'
  remark: string | null;        // human description
  created_at: string;           // ISO
  created_by: string;           // owner uid
};

export type WalletBalances = {
  available: number;   // cash + promo (settled)
  cash: number;        // settled real-money balance
  promo: number;       // settled reward/cashback balance
  pending: number;     // incoming, not yet settled
  locked: number;      // held for an in-flight debit
  currency: 'INR';
  lowBalance: boolean; // available under the nudge threshold
};

export type LedgerFilters = {
  type?: LedgerType | 'all';
  bucket?: LedgerBucket | 'all';
  status?: LedgerStatus | 'all';
  refType?: LedgerRefType | 'all';
  search?: string;
  limit?: number;
};

/** Legacy transaction shape kept so app/transactions.tsx + the wallet tab keep
 *  compiling. Derived from the ledger. */
export type WalletTxn = {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  category: string;
  description: string | null;
  created_at: string;
};

export type AutopayMandate = {
  id: string;
  status: 'pending' | 'active' | 'paused' | 'cancelled';
  upi_id: string | null;
  max_amount: number;               // per-charge cap
  next_charge_date: string | null;
  threshold?: number;               // auto top-up when available falls below this
  recharge_amount?: number;         // amount to top up by
  umn?: string | null;              // UPI Mandate Number (assigned when approved in Paytm)
};

const LEDGER_TABLE = 'wallet_ledger';
const LEGACY_WALLET = 'wallet'; // single-row {balance} kept mirrored for the seam

// ── Ledger math ──────────────────────────────────────────────────────────────
/** Positive for money in (credit/refund/reward/adjustment), negative for a debit. */
function signOf(type: LedgerType): 1 | -1 {
  return type === 'debit' ? -1 : 1;
}
const money = (n: number) => Math.round(n); // paise-free rupees, no float dust

/** Settled available balance across the whole ledger. */
function settledAvailable(rows: WalletLedgerRow[]): number {
  return money(
    rows.reduce((s, r) => (r.status === 'success' ? s + signOf(r.type) * r.amount : s), 0),
  );
}

/** Settled balance for a single bucket (cash or promo). */
function settledBucket(rows: WalletLedgerRow[], bucket: LedgerBucket): number {
  return money(
    rows.reduce(
      (s, r) => (r.status === 'success' && r.bucket === bucket ? s + signOf(r.type) * r.amount : s),
      0,
    ),
  );
}

type LedgerDraft = {
  type: LedgerType;
  amount: number;
  bucket: LedgerBucket;
  ref_id?: string | null;
  ref_type: LedgerRefType;
  status?: LedgerStatus;
  source?: string;
  remark?: string | null;
};

/**
 * Atomic append. Reads the ledger once, stamps opening/closing on each draft in
 * sequence (pending/reversed rows do not move the settled balance), writes once,
 * and mirrors the resulting available balance into the legacy single-row table
 * so any code still reading `wallet` stays correct.
 */
async function append(uid: string, drafts: LedgerDraft[]): Promise<WalletLedgerRow[]> {
  const rows = await getRows<WalletLedgerRow>(LEDGER_TABLE, uid);
  let running = settledAvailable(rows);
  const created: WalletLedgerRow[] = [];
  const base = Date.now();
  drafts.forEach((d, i) => {
    const status: LedgerStatus = d.status ?? 'success';
    const delta = status === 'success' ? signOf(d.type) * money(d.amount) : 0;
    const opening = running;
    const closing = money(opening + delta);
    const row: WalletLedgerRow = {
      id: newId('wl'),
      type: d.type,
      amount: money(d.amount),
      bucket: d.bucket,
      opening_balance: opening,
      closing_balance: closing,
      ref_id: d.ref_id ?? null,
      ref_type: d.ref_type,
      status,
      source: d.source ?? 'app',
      remark: d.remark ?? null,
      // +i keeps a stable, strictly-increasing order when several rows land at once
      created_at: new Date(base + i).toISOString(),
      created_by: uid,
    };
    running = closing;
    rows.push(row);
    created.push(row);
  });
  await setRows(LEDGER_TABLE, uid, rows);
  await putSingle<{ balance: number }>(LEGACY_WALLET, uid, { balance: running });
  return created;
}

/**
 * One-time migration: if the ledger is empty but a legacy `wallet` balance exists
 * (e.g. the demo seed on sign-up, or an older build), open the ledger with that
 * balance so nothing is lost and the fold matches what the user already had.
 */
async function ensureBootstrapped(uid: string): Promise<WalletLedgerRow[]> {
  const rows = await getRows<WalletLedgerRow>(LEDGER_TABLE, uid);
  if (rows.length > 0) return rows;
  const legacy = await getSingle<{ balance: number }>(LEGACY_WALLET, uid);
  const seed = money(Number(legacy?.balance ?? 0));
  if (seed <= 0) return rows;
  return append(uid, [
    { type: 'credit', amount: seed, bucket: 'cash', ref_type: 'seed', source: 'system', remark: 'Opening balance' },
  ]);
}

/** Non-reversed debit already recorded for this ref? (idempotency guard) */
function hasDebitFor(rows: WalletLedgerRow[], refId: string): boolean {
  return rows.some((r) => r.type === 'debit' && r.status !== 'reversed' && r.ref_id === refId);
}
function hasEntryFor(rows: WalletLedgerRow[], refId: string): boolean {
  return rows.some((r) => r.status !== 'reversed' && r.ref_id === refId);
}

// ── Server wallet mapping (backend mode) ─────────────────────────────────────
// The backend is the AUTHORITATIVE dual-bucket wallet (Cash + Rewards). These
// map its shapes onto the app's WalletBalances / WalletLedgerRow so every
// existing call site keeps working. Local-first stays as the offline fallback.
type ServerWallet = { cash: number; rewards: number; held: number; available: number; lowBalance: boolean };
type ServerTxn = {
  id: string; seq: number; type: string; bucket: string; amount: number;
  cash_after?: number; rewards_after?: number; ref_type?: string; ref_id?: string;
  status?: string; remark?: string; created_at: string;
};

function mapServerTxn(t: ServerTxn): WalletLedgerRow {
  const availableAfter = money((t.cash_after ?? 0) + (t.rewards_after ?? 0));
  const type: LedgerType =
    t.type === 'TOPUP' ? 'credit'
      : t.type === 'BONUS' ? 'reward'
      : t.type === 'DEBIT' ? 'debit'
      : t.type === 'REFUND' ? 'refund'
      : 'adjustment';
  const bucket: LedgerBucket = t.bucket === 'REWARDS' ? 'promo' : 'cash';
  const signed = signOf(type) * money(t.amount);
  // Categorise by the ledger TYPE (the server ref_type carries the PSP/method
  // string, which is not one of the app's LedgerRefType buckets).
  const refType: LedgerRefType =
    type === 'credit' ? 'recharge'
      : type === 'reward' ? 'reward'
      : type === 'refund' ? 'refund'
      : type === 'debit' ? 'order'
      : isRefType(t.ref_type ?? '') ? (t.ref_type as LedgerRefType) : 'adjustment';
  return {
    id: t.id,
    type,
    amount: money(t.amount),
    bucket,
    opening_balance: money(availableAfter - signed),
    closing_balance: availableAfter,
    ref_id: t.ref_id ?? null,
    ref_type: refType,
    status: 'success',
    source: 'server',
    remark: t.remark ?? null,
    created_at: t.created_at,
    created_by: '',
  };
}

// ── Public reads ─────────────────────────────────────────────────────────────
export async function getBalances(): Promise<WalletBalances> {
  if (isBackendConfigured()) {
    const w = await api.get<ServerWallet>('/wallet');
    return {
      available: money(w.available),
      cash: money(w.cash),
      promo: money(w.rewards),
      pending: 0, // server settles synchronously — no pending bucket yet
      locked: money(w.held),
      currency: 'INR',
      lowBalance: w.lowBalance,
    };
  }
  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  const cash = settledBucket(rows, 'cash');
  const promo = settledBucket(rows, 'promo');
  let pending = 0;
  let locked = 0;
  for (const r of rows) {
    if (r.status !== 'pending') continue;
    if (signOf(r.type) > 0) pending += r.amount; // incoming, not settled
    else locked += r.amount; // outgoing hold
  }
  const available = money(cash + promo);
  return {
    available,
    cash,
    promo,
    pending: money(pending),
    locked: money(locked),
    currency: 'INR',
    lowBalance: available < LOW_BALANCE_THRESHOLD,
  };
}

/** Full ledger (newest first), optionally filtered. */
export async function getLedger(filters: LedgerFilters = {}): Promise<WalletLedgerRow[]> {
  let rows: WalletLedgerRow[];
  if (isBackendConfigured()) {
    const server = await api.get<ServerTxn[]>('/wallet/txns');
    rows = server.map(mapServerTxn);
  } else {
    const uid = await requireUserId();
    rows = await ensureBootstrapped(uid);
  }
  const q = filters.search?.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (filters.type && filters.type !== 'all' && r.type !== filters.type) return false;
    if (filters.bucket && filters.bucket !== 'all' && r.bucket !== filters.bucket) return false;
    if (filters.status && filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.refType && filters.refType !== 'all' && r.ref_type !== filters.refType) return false;
    if (q) {
      const hay = `${r.remark ?? ''} ${r.ref_type} ${r.type} ${r.ref_id ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return typeof filters.limit === 'number' ? out.slice(0, filters.limit) : out;
}

/** Legacy transaction feed (newest 50), derived from the ledger. */
export async function getTransactions(): Promise<WalletTxn[]> {
  const rows = await getLedger({ limit: 50 });
  return rows.map((r) => ({
    id: r.id,
    direction: signOf(r.type) > 0 ? 'credit' : 'debit',
    amount: r.amount,
    balance_after: r.closing_balance,
    category: r.ref_type,
    description: r.remark,
    created_at: r.created_at,
  }));
}

/** Rough burn rate + days-of-cover, from the last 30 days of debits. */
export async function getSpendSummary(): Promise<{ dailyBurn: number; daysRemaining: number | null }> {
  const rows = await getLedger();
  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const spent = rows
    .filter((r) => r.type === 'debit' && r.status === 'success' && new Date(r.created_at).getTime() >= since)
    .reduce((s, r) => s + r.amount, 0);
  const dailyBurn = money(spent / 30);
  const { available } = await getBalances();
  const daysRemaining = dailyBurn > 0 ? Math.floor(available / dailyBurn) : null;
  return { dailyBurn, daysRemaining };
}

// ── Public writes ────────────────────────────────────────────────────────────
/**
 * Recharge (PLACEHOLDER PAYMENT). Credits the principal to CASH plus the matching
 * bonus tier to PROMO, as two ledger rows sharing one receipt ref. Returns the new
 * available balance.
 */
export async function rechargeWallet(amount: number, method?: string, ref?: string): Promise<number> {
  const uid = await requireUserId();
  await ensureBootstrapped(uid);
  const amt = money(amount);
  if (amt <= 0) return (await getBalances()).available;
  const bonus = money(rechargeBonus(amt)?.bonus ?? 0);
  // Use the verified payment reference (razorpay_payment_id) as the receipt so
  // the ledger row carries the PSP receipt and stays idempotent per payment.
  const receipt = ref ?? newId('rcpt');
  const drafts: LedgerDraft[] = [
    {
      type: 'credit',
      amount: amt,
      bucket: 'cash',
      ref_id: receipt,
      ref_type: 'recharge',
      source: method ? `gateway:${method}` : 'gateway',
      remark: `Recharge ₹${amt}`,
    },
  ];
  if (bonus > 0) {
    drafts.push({
      type: 'reward',
      amount: bonus,
      bucket: 'promo',
      ref_id: receipt,
      ref_type: 'reward',
      source: 'system',
      remark: `Recharge bonus (+₹${bonus})`,
    });
  }
  const created = await append(uid, drafts);
  return created[created.length - 1].closing_balance;
}

/**
 * Debit the wallet for a purchase. Spends PROMO first, then CASH (so real money is
 * preserved as long as possible), recording one ledger row per bucket touched.
 * Guards against a negative balance and is idempotent by ref.
 *
 * Back-compatible signature: callers pass (amount, refType, remark). The
 * idempotency key is `refType:remark` when a remark is given (unique per order),
 * else just refType.
 */
export async function debitWallet(amount: number, ref?: string, remark?: string): Promise<number> {
  const amt = money(amount);
  const refType: LedgerRefType = isRefType(ref) ? ref : 'order';
  const refId = remark ? `${ref ?? refType}:${remark}` : (ref ?? refType);

  // Backend mode: the server debits promo-first, idempotent by ref, and fails
  // closed on insufficient funds (throws so callers can nudge a top-up).
  if (isBackendConfigured()) {
    if (amt <= 0) return (await getBalances()).available;
    const w = await api.post<ServerWallet>('/wallet/debit', { amount: amt, ref: refId, remark: remark ?? refType });
    return money(w.available);
  }

  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  const cash = settledBucket(rows, 'cash');
  const promo = settledBucket(rows, 'promo');
  const available = cash + promo;
  if (amt <= 0) return available;

  if (hasDebitFor(rows, refId)) return available; // idempotent replay → no double-charge
  if (available < amt) throw new Error('Wallet balance is too low for this order.');

  const fromPromo = Math.min(amt, promo);
  const fromCash = amt - fromPromo;
  const drafts: LedgerDraft[] = [];
  if (fromPromo > 0) {
    drafts.push({ type: 'debit', amount: fromPromo, bucket: 'promo', ref_id: refId, ref_type: refType, remark: remark ?? null });
  }
  if (fromCash > 0) {
    drafts.push({ type: 'debit', amount: fromCash, bucket: 'cash', ref_id: refId, ref_type: refType, remark: remark ?? null });
  }
  const created = await append(uid, drafts);
  return created[created.length - 1].closing_balance;
}

/** Refund money back to the wallet (defaults to CASH). Idempotent by ref. */
export async function refundToWallet(
  amount: number,
  ref?: string,
  opts?: { bucket?: LedgerBucket; remark?: string },
): Promise<number> {
  const amt = money(amount);
  if (isBackendConfigured()) {
    if (amt <= 0) return (await getBalances()).available;
    const w = await api.post<ServerWallet>('/wallet/refund', { amount: amt, ref: ref ?? newId('rfnd'), remark: opts?.remark });
    return money(w.available);
  }
  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  if (amt <= 0) return settledAvailable(rows);
  const refId = ref ?? newId('rfnd');
  if (ref && hasEntryFor(rows, refId)) return settledAvailable(rows);
  const created = await append(uid, [
    {
      type: 'refund',
      amount: amt,
      bucket: opts?.bucket ?? 'cash',
      ref_id: refId,
      ref_type: 'refund',
      source: 'system',
      remark: opts?.remark ?? `Refund ₹${amt}`,
    },
  ]);
  return created[created.length - 1].closing_balance;
}

/** Add a promotional credit (reward / cashback) to the PROMO balance. */
export async function addPromoCredit(
  amount: number,
  opts?: { ref_id?: string; remark?: string },
): Promise<number> {
  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  const amt = money(amount);
  if (amt <= 0) return settledAvailable(rows);
  const refId = opts?.ref_id ?? newId('rwd');
  if (opts?.ref_id && hasEntryFor(rows, refId)) return settledAvailable(rows);
  const created = await append(uid, [
    {
      type: 'reward',
      amount: amt,
      bucket: 'promo',
      ref_id: refId,
      ref_type: 'reward',
      source: 'system',
      remark: opts?.remark ?? `Reward (+₹${amt})`,
    },
  ]);
  return created[created.length - 1].closing_balance;
}

/**
 * Reconcile: recompute the opening/closing chain from scratch (repairs any drift),
 * re-mirror the legacy balance and return the fresh balances. Cheap, safe to call
 * defensively after a batch of writes.
 */
export async function reconcile(): Promise<WalletBalances> {
  if (isBackendConfigured()) return getBalances(); // server is authoritative — nothing to repair
  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let running = 0;
  for (const r of ordered) {
    const delta = r.status === 'success' ? signOf(r.type) * r.amount : 0;
    r.opening_balance = money(running);
    r.closing_balance = money(running + delta);
    running = r.closing_balance;
  }
  await setRows(LEDGER_TABLE, uid, ordered);
  await putSingle<{ balance: number }>(LEGACY_WALLET, uid, { balance: money(running) });
  return getBalances();
}

function isRefType(v: string | undefined): v is LedgerRefType {
  return v === 'order' || v === 'payment' || v === 'refund' || v === 'recharge' || v === 'reward' || v === 'adjustment' || v === 'seed';
}

// ── AutoPay · Paytm UPI mandate ──────────────────────────────────────────────
// With the shared backend configured this is the REAL mechanism: a UPI AutoPay
// mandate (NPCI lifecycle, UMN, per-debit cap, AS_PRESENTED recurrence) lives
// server-side in `consumer_mandates`; the local 'autopay' row only caches the
// app-side auto-top-up policy (threshold + amount). Without a backend the old
// on-device placeholder behaviour is preserved.

function mandateStateToStatus(state: string): AutopayMandate['status'] {
  return state === 'PENDING_APPROVAL' ? 'pending'
    : state === 'ACTIVE' ? 'active'
    : state === 'PAUSED' ? 'paused'
    : 'cancelled';
}

export async function getAutopay(): Promise<AutopayMandate | null> {
  const uid = await requireUserId();
  const local = await getSingle<AutopayMandate>('autopay', uid);
  if (!isBackendConfigured()) return local;
  const m = await currentMandate().catch(() => null);
  if (!m) return null;
  return {
    id: m.id,
    status: mandateStateToStatus(m.state),
    upi_id: m.payer_vpa,
    max_amount: m.max_amount,
    next_charge_date: null,
    threshold: local?.threshold,
    recharge_amount: local?.recharge_amount,
    umn: m.umn,
  };
}

/**
 * Set up AutoPay. Backend mode: registers a UPI AutoPay mandate with Paytm
 * (state PENDING_APPROVAL until the customer approves it in the Paytm app —
 * see approveAutopay) and caches the top-up policy locally. Local mode keeps
 * the previous immediately-active placeholder.
 */
export async function setupAutopay(params: {
  maxAmount: number;
  upiId?: string;
  threshold?: number;
  rechargeAmount?: number;
}): Promise<AutopayMandate> {
  const uid = await requireUserId();
  const existing = await getSingle<AutopayMandate>('autopay', uid);
  if (isBackendConfigured()) {
    const live = await currentMandate().catch(() => null);
    const m = live ?? (await createMandate({ maxAmount: params.maxAmount, upiId: params.upiId }));
    const record: AutopayMandate = {
      id: m.id,
      status: mandateStateToStatus(m.state),
      upi_id: m.payer_vpa,
      max_amount: m.max_amount,
      next_charge_date: null,
      threshold: params.threshold ?? existing?.threshold,
      recharge_amount: params.rechargeAmount ?? existing?.recharge_amount,
      umn: m.umn,
    };
    await putSingle<AutopayMandate>('autopay', uid, record);
    return record;
  }
  const record: AutopayMandate = {
    id: existing?.id ?? newId('mandate'),
    status: 'active',
    upi_id: params.upiId ?? existing?.upi_id ?? null,
    max_amount: params.maxAmount,
    next_charge_date: existing?.next_charge_date ?? null,
    threshold: params.threshold ?? existing?.threshold,
    recharge_amount: params.rechargeAmount ?? existing?.recharge_amount,
  };
  await putSingle<AutopayMandate>('autopay', uid, record);
  return record;
}

/**
 * The customer approving the mandate in Paytm. In production (PAYTM_PG mode)
 * the app opens the PG deeplink and Paytm's webhook activates the mandate; in
 * DEMO mode this call stands in for that approval. Activates the mandate and
 * returns the UMN.
 */
export async function approveAutopay(id: string): Promise<AutopayMandate | null> {
  if (!isBackendConfigured()) return getAutopay();
  await approveMandateOnPsp(id);
  const uid = await requireUserId();
  const fresh = await getAutopay();
  if (fresh) await putSingle<AutopayMandate>('autopay', uid, fresh);
  return fresh;
}

export async function cancelAutopay(id: string): Promise<void> {
  const uid = await requireUserId();
  if (isBackendConfigured()) await cancelMandateOnPsp(id).catch(() => { /* already revoked / offline */ });
  const existing = await getSingle<AutopayMandate>('autopay', uid);
  if (existing) await putSingle<AutopayMandate>('autopay', uid, { ...existing, status: 'cancelled' });
}

/**
 * Cover a shortfall by executing the AutoPay mandate and crediting the wallet.
 * Used by the delivered-order settlement sweep so a delivery is never left
 * unpaid when the member has AutoPay on. Round up to the next ₹100 (min ₹100)
 * within the mandate cap. Idempotent end to end: the mandate execution is
 * keyed by `ref` on the backend, and the wallet credit is keyed by the
 * execution id, so retries can never double-credit or double-debit.
 * Returns true if the wallet now covers the shortfall.
 */
export async function autoSettleTopUp(shortfall: number, ref: string): Promise<boolean> {
  if (!isBackendConfigured() || shortfall <= 0) return false;
  const m = await currentMandate().catch(() => null);
  if (!m || m.state !== 'ACTIVE') return false;
  const amount = Math.min(Math.max(Math.ceil(shortfall / 100) * 100, 100), m.max_amount);
  if (amount < shortfall) return false; // cap too low for this shortfall
  const execution = await executeMandate(m.id, amount, ref, 'wallet_topup');
  const uid = await requireUserId();
  const rows = await ensureBootstrapped(uid);
  const receipt = `autopay:${execution.id}`;
  if (rows.some((r) => r.ref_id === receipt)) return true; // credit already recorded
  await append(uid, [{
    type: 'credit',
    amount: execution.amount,
    bucket: 'cash',
    ref_id: receipt,
    ref_type: 'recharge',
    source: 'gateway:paytm-autopay',
    remark: `AutoPay top-up ₹${execution.amount} (Paytm)`,
  }]);
  return true;
}
