import { api, isBackendConfigured } from './apiClient';
import { requireUserId } from './session';
import { openCheckout, RAZORPAY_KEY_ID } from './razorpay';

/**
 * UPI AutoPay / e-mandate client — SMART RECHARGE that FUNDS the wallet,
 * backed by the shared backend at `/consumer/mandate/*` (Razorpay recurring
 * payments; collection `consumer_mandates`).
 *
 * Founder decision (25 Sep 2026): AutoPay adds money TO the prepaid wallet; it
 * never takes money out of it. The member approves ONE UPI AutoPay mandate (a
 * per-debit cap). The server then charges it when the wallet, less what the
 * next locked and upcoming mornings will take, falls below the member's
 * threshold, and credits the wallet only once the bank's payment is captured
 * (the same exactly-once ledger gate as every top-up, so "money added" is sent
 * once). The same mandate funds the Rs 99 Founding Family seat through the
 * wallet.
 *
 * Lifecycle as the customer experiences it:
 *   pending  → (the recurring checkout: approve in the UPI app) → active
 *   active ⇄ paused → cancelled, with a per-debit cap.
 * The registration payment is REAL money and is credited to the wallet.
 *
 * With a live RAZORPAY_KEY_SECRET on the backend, `createMandate` returns the
 * registration order + customer, and `approveMandate` opens Razorpay's
 * recurring checkout (key, order_id, customer_id, recurring "1") and verifies
 * it. On the demo backend (no secret + OTP dev mode) there is no customer, and
 * DEV activates through the backend's dev seam so the flow is exercisable
 * without moving money.
 *
 * The exported shapes are kept stable for walletApi.ts / the wallet screen: the
 * backend `mandate` (status pending|active|paused|cancelled) is adapted onto the
 * UpiMandate view below (new fields are optional additions).
 *
 * Pure client: no wallet imports here (walletApi consumes this module).
 */

export type MandateState = 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'REVOKED';

export type MandateExecution = {
  id: string;
  ref: string;
  amount: number;
  purpose: string;
  pre_debit_notice_at: string;
  executed_at: string;
  rrn: string; // bank retrieval reference number
  /** SUCCESS: money captured and credited. PENDING: the bank is processing it
   *  (a UPI AutoPay debit lands about a day later). FAILED: refused, nothing
   *  taken. */
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
};

export type UpiMandate = {
  id: string;
  user_id: string;
  payer_vpa: string | null;
  psp: 'paytm';
  mode: 'PAYTM_PG' | 'DEMO';
  recurrence: 'AS_PRESENTED';
  max_amount: number;
  state: MandateState;
  umn: string | null; // UPI Mandate Number / recurring token, visible in the UPI app
  created_at: string;
  approved_at: string | null;
  revoked_at: string | null;
  executions: MandateExecution[];
  /** Smart Recharge: top up when the wallet (less the next mornings) falls below this (₹). */
  threshold?: number;
  /** Smart Recharge: what one top-up adds (₹); also the registration payment. */
  recharge_amount?: number;
  /** The bank's word on the mandate: initiated | confirmed | rejected | paused | cancelled. */
  token_status?: string | null;
};

// ── Backend wire shape (mandate.go) ─────────────────────────────────────────
type BackendMandate = {
  id: string;
  plan?: string;
  status: string; // pending | active | paused | cancelled
  amount?: number; // Smart Recharge amount
  max_amount?: number; // per-debit cap
  threshold?: number;
  token?: string;
  token_status?: string;
  order_id?: string; // registration order (the recurring checkout's order_id)
  customer_id?: string; // Razorpay customer (live only)
  reg_amount_paise?: number;
  cancel_reason?: string;
  next_charge?: string;
  last_charge_date?: string;
  last_charge_at?: string;
  created_at?: string;
  updated_at?: string;
};

/** POST /mandate/create: what the recurring checkout needs. */
type MandateOrder = {
  id: string;
  token?: string;
  keyId?: string;
  status?: string;
  orderId?: string;
  customerId?: string;
  amountPaise?: number;
};

/** POST /mandate/{id}/execute: one Smart Recharge charge. */
type BackendTopup = {
  ref: string;
  mandate_id: string;
  reason: string;
  amount: number;
  status: string; // starting | initiated | captured | failed | expired
  failure_reason?: string;
  created_at: string;
  settled_at?: string;
};

function stateFromStatus(status: string): MandateState {
  switch (status) {
    case 'active': return 'ACTIVE';
    case 'paused': return 'PAUSED';
    case 'cancelled': return 'REVOKED';
    default: return 'PENDING_APPROVAL'; // pending / unknown
  }
}

/** Adapt a backend mandate onto the stable UpiMandate view the UI consumes. */
function toUpiMandate(m: BackendMandate): UpiMandate {
  const state = stateFromStatus(m.status);
  return {
    id: m.id,
    user_id: '',
    payer_vpa: null,
    psp: 'paytm',
    mode: 'DEMO',
    recurrence: 'AS_PRESENTED',
    max_amount: m.max_amount ?? m.amount ?? 0,
    state,
    umn: m.token ?? null,
    created_at: m.created_at ?? '',
    approved_at: state === 'ACTIVE' ? (m.updated_at ?? null) : null,
    revoked_at: state === 'REVOKED' ? (m.updated_at ?? null) : null,
    executions: [],
    threshold: typeof m.threshold === 'number' && m.threshold > 0 ? m.threshold : undefined,
    recharge_amount: typeof m.amount === 'number' && m.amount > 0 ? m.amount : undefined,
    token_status: m.token_status ?? null,
  };
}

/** The IST calendar day (YYYY-MM-DD) of an instant. */
function istDay(ms: number): string {
  return new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Razorpay approves a UPI AutoPay registration only on the IST day its order
 * was created ("create an Order and the Authorisation Transaction on the same
 * day ... before 11:59 pm"). A pending mandate created on an earlier IST day
 * than `now` needs a fresh registration order. Unknown dates: not stale.
 */
export function registrationIsStale(createdAt: string | undefined, now: number = Date.now()): boolean {
  const at = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(at)) return false;
  return istDay(at) < istDay(now);
}

/** Clamp to the backend's mandate bands: top-up ₹1..5,000 and ≤ the cap; cap ≤ ₹1,00,000. */
function boundedAmounts(maxAmount: number, rechargeAmount?: number): { amount: number; max_amount: number } {
  const cap = Math.min(100000, Math.max(1, Math.round(maxAmount || 1)));
  const wanted = rechargeAmount && rechargeAmount > 0 ? Math.round(rechargeAmount) : cap;
  const amount = Math.max(1, Math.min(5000, cap, wanted));
  return { amount, max_amount: Math.max(cap, amount) };
}

// The registration checkout of a mandate created this session (keyId is only
// on the create answer; order and customer are also on GET /mandate/me).
const registration = new Map<string, { orderId?: string; customerId?: string; keyId?: string; amountPaise?: number }>();

async function listBackendMandates(): Promise<BackendMandate[]> {
  const list = await api.get<BackendMandate[]>('/mandate/me');
  return Array.isArray(list) ? list : [];
}

export async function listMandates(): Promise<UpiMandate[]> {
  if (!isBackendConfigured()) return [];
  await requireUserId(); // must be signed in; the mandate is scoped server-side by JWT
  return (await listBackendMandates()).map(toUpiMandate);
}

/** Newest mandate that has not been cancelled (one live mandate per member). */
export async function currentMandate(): Promise<UpiMandate | null> {
  const all = await listMandates();
  return all.find((m) => m.state !== 'REVOKED') ?? null;
}

/**
 * Register a mandate (state PENDING_APPROVAL until approveMandate). maxAmount
 * is the per-debit cap the member approves at their bank; rechargeAmount is
 * what one Smart Recharge top-up adds (and the registration payment, which is
 * credited to the wallet); threshold is the line the wallet is kept above.
 */
export async function createMandate(params: {
  maxAmount: number;
  upiId?: string;
  threshold?: number;
  rechargeAmount?: number;
}): Promise<UpiMandate> {
  await requireUserId();
  const { amount, max_amount } = boundedAmounts(params.maxAmount, params.rechargeAmount);
  const body: Record<string, unknown> = { plan: 'daily', amount, max_amount };
  const threshold = params.threshold != null && params.threshold > 0 ? Math.round(params.threshold) : undefined;
  if (threshold != null) body.threshold = threshold;
  const order = await api.post<MandateOrder>('/mandate/create', body);
  registration.set(order.id, {
    orderId: order.orderId ?? order.token,
    customerId: order.customerId,
    keyId: order.keyId,
    amountPaise: order.amountPaise ?? amount * 100,
  });
  return toUpiMandate({ id: order.id, status: order.status ?? 'pending', amount, max_amount, token: order.token, threshold });
}

/**
 * Approve = complete the mandate registration (→ active). With a live backend
 * (the create answered a Razorpay customer) this opens Razorpay's RECURRING
 * checkout for the registration order and sends its result to /mandate/verify;
 * the registration payment is credited to the wallet by the server. A caller
 * may pass a completed checkout itself. On the demo backend (no customer)
 * only DEV may fall back to the backend's dev seam — a release build must
 * NEVER transmit fabricated 'demo' credentials to /mandate/verify.
 */
export async function approveMandate(id: string, checkout?: { paymentId: string; signature: string; token?: string }): Promise<UpiMandate> {
  let pg = checkout ?? null;
  let mandateId = id;
  if (!pg) {
    let reg = registration.get(id);
    const m = (await listBackendMandates().catch(() => [] as BackendMandate[])).find((x) => x.id === id);
    if ((!reg?.customerId || !reg.orderId) && m?.customer_id && m.order_id) {
      reg = { ...reg, orderId: m.order_id, customerId: m.customer_id, amountPaise: m.reg_amount_paise ?? reg?.amountPaise };
    }
    // A live registration order from an earlier IST day can no longer be
    // approved (Razorpay: order and authorisation on the same day). Register
    // again with the same policy; the server supersedes the old pending
    // mandate (and cancels any bank token it got), and the checkout opens on
    // the fresh order.
    if (m && m.status === 'pending' && m.customer_id && registrationIsStale(m.created_at)) {
      const fresh = await createMandate({
        maxAmount: m.max_amount ?? m.amount ?? 0,
        threshold: m.threshold,
        rechargeAmount: m.amount,
      });
      mandateId = fresh.id;
      reg = registration.get(fresh.id);
    }
    if (reg?.customerId && reg.orderId) {
      const outcome = await openCheckout({
        amountPaise: reg.amountPaise ?? 0,
        orderId: reg.orderId,
        keyId: reg.keyId || RAZORPAY_KEY_ID,
        customerId: reg.customerId,
        recurring: true,
        method: 'upi',
        description: 'PYAAS AutoPay setup',
      });
      if (outcome.status === 'cancelled') throw new Error('AutoPay setup was cancelled. Nothing was charged.');
      if (outcome.status === 'failed') throw new Error(outcome.error || 'AutoPay setup did not go through.');
      pg = { paymentId: outcome.result.razorpay_payment_id, signature: outcome.result.razorpay_signature ?? '' };
    } else if (__DEV__) {
      pg = { paymentId: `demo_${id}`, signature: 'demo', token: '' };
    }
  }
  if (!pg) throw new Error('AutoPay approval needs a completed UPI AutoPay checkout.');
  const m = await api.post<BackendMandate>('/mandate/verify', {
    mandate_id: mandateId,
    razorpay_payment_id: pg.paymentId,
    razorpay_signature: pg.signature,
    razorpay_token: pg.token ?? '',
  });
  registration.delete(mandateId);
  return toUpiMandate(m);
}

export async function pauseMandate(id: string): Promise<UpiMandate> {
  return toUpiMandate(await api.post<BackendMandate>(`/mandate/${id}/pause`));
}

export async function resumeMandate(id: string): Promise<UpiMandate> {
  return toUpiMandate(await api.post<BackendMandate>(`/mandate/${id}/resume`));
}

export async function cancelMandate(id: string): Promise<UpiMandate> {
  return toUpiMandate(await api.post<BackendMandate>(`/mandate/${id}/cancel`));
}

/**
 * Change the Smart Recharge line and/or top-up amount of a live mandate
 * (POST /mandate/{id}/policy). The amount must stay within the per-debit cap
 * the bank approved; the server refuses more.
 */
export async function updateMandatePolicy(id: string, policy: { threshold?: number; rechargeAmount?: number }): Promise<UpiMandate> {
  const body: Record<string, number> = {};
  if (policy.threshold != null) body.threshold = Math.max(0, Math.round(policy.threshold));
  if (policy.rechargeAmount != null) body.amount = Math.max(1, Math.round(policy.rechargeAmount));
  return toUpiMandate(await api.post<BackendMandate>(`/mandate/${id}/policy`, body));
}

/**
 * "Top up now" through AutoPay (POST /mandate/{id}/execute). The backend
 * charges the member's own mandate for `amount` (0 = their recharge amount;
 * never above the cap), keyed by `ref` so a retry answers the same charge,
 * and credits the WALLET once the bank's payment is captured — about a day
 * later for UPI AutoPay. It never debits the wallet. Answers 503 without live
 * gateway keys, 409 while another top-up is on its way.
 */
export async function executeMandate(id: string, amount: number, ref: string, purpose = 'wallet_topup'): Promise<MandateExecution> {
  const t = await api.post<BackendTopup>(`/mandate/${id}/execute`, { amount, ref, purpose });
  const status: MandateExecution['status'] =
    t.status === 'captured' ? 'SUCCESS' : t.status === 'failed' || t.status === 'expired' ? 'FAILED' : 'PENDING';
  return {
    id: t.ref ?? ref,
    ref,
    amount: typeof t.amount === 'number' ? t.amount : amount,
    purpose,
    pre_debit_notice_at: '',
    executed_at: t.settled_at ?? '',
    rrn: '',
    status,
  };
}
