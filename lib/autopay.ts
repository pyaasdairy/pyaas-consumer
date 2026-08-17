import { api, isBackendConfigured } from './apiClient';
import { requireUserId } from './session';

/**
 * UPI AutoPay / e-mandate client — the REAL recurring-payment mechanism, backed
 * by the shared backend at `/consumer/mandate/*` (Razorpay recurring; collection
 * `consumer_mandates`).
 *
 * Lifecycle as the customer experiences it:
 *   pending  → (approve in the UPI app / recurring checkout) → active
 *   active ⇄ paused → cancelled, with a per-debit cap and daily/weekly cadence.
 * Every execution drives the SAME exactly-once wallet settle path as a delivery
 * (idempotent by `mandate:<id>:<day>`), so a retried tick never double-charges.
 *
 * Payments are gateway-agnostic (Razorpay routes UPI-intent / cards / netbanking);
 * this module keeps a provider-neutral surface. When the backend runs with a live
 * RAZORPAY_KEY_SECRET (recurring feature enabled) `createMandate` returns the
 * registration token for the recurring checkout; in the demo backend (no secret +
 * OTP dev mode) the server activates on `approveMandate` so the whole
 * subscribe→approve→charge flow is exercisable without moving real money.
 *
 * The exported shapes are kept stable for walletApi.ts / the wallet screen: the
 * backend `mandate` (status pending|active|paused|cancelled) is adapted onto the
 * UpiMandate view below.
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
  status: 'SUCCESS';
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
};

// ── Backend wire shape (mandate.go) ─────────────────────────────────────────
type BackendMandate = {
  id: string;
  plan?: string;
  status: string; // pending | active | paused | cancelled
  amount?: number;
  max_amount?: number;
  token?: string;
  next_charge?: string;
  last_charge_date?: string;
  last_charge_at?: string;
  created_at?: string;
  updated_at?: string;
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
  };
}

/** Clamp to the backend's mandate bands: charge ₹1..5,000, cap ≥ charge, ≤ ₹1,00,000. */
function boundedAmounts(maxAmount: number): { amount: number; max_amount: number } {
  const cap = Math.min(100000, Math.max(1, Math.round(maxAmount || 1)));
  const amount = Math.min(5000, cap);
  return { amount, max_amount: Math.max(cap, amount) };
}

export async function listMandates(): Promise<UpiMandate[]> {
  if (!isBackendConfigured()) return [];
  await requireUserId(); // must be signed in; the mandate is scoped server-side by JWT
  const list = await api.get<BackendMandate[]>('/mandate/me');
  return Array.isArray(list) ? list.map(toUpiMandate) : [];
}

/** Newest mandate that has not been cancelled (one live mandate per member). */
export async function currentMandate(): Promise<UpiMandate | null> {
  const all = await listMandates();
  return all.find((m) => m.state !== 'REVOKED') ?? null;
}

export async function createMandate(params: { maxAmount: number; upiId?: string }): Promise<UpiMandate> {
  await requireUserId();
  const { amount, max_amount } = boundedAmounts(params.maxAmount);
  // Returns the registration token (mandateOrderView {id, token, keyId, status}).
  const order = await api.post<{ id: string; token?: string; keyId?: string; status?: string }>(
    '/mandate/create',
    { plan: 'daily', amount, max_amount }
  );
  return toUpiMandate({ id: order.id, status: order.status ?? 'pending', amount, max_amount, token: order.token });
}

/**
 * Approve = complete the mandate registration (→ active). Production hands the
 * Razorpay recurring-checkout result (payment id + signature + token) here; the
 * demo backend activates without a real checkout (dev seam) so the flow is
 * testable end-to-end.
 */
export async function approveMandate(id: string, checkout?: { paymentId: string; signature: string; token?: string }): Promise<UpiMandate> {
  // A real approval needs a completed UPI-AutoPay checkout (paymentId+signature
  // from the PG). Until that recurring checkout is wired, only DEV may fall back
  // to the backend's dev seam — a release build must NEVER transmit fabricated
  // 'demo' credentials to /mandate/verify. (The AutoPay UI itself is __DEV__-only
  // in release for the same reason.)
  const pg = checkout ?? (__DEV__ ? { paymentId: `demo_${id}`, signature: 'demo', token: '' } : null);
  if (!pg) throw new Error('AutoPay approval needs a completed UPI AutoPay checkout.');
  const m = await api.post<BackendMandate>('/mandate/verify', {
    mandate_id: id,
    razorpay_payment_id: pg.paymentId,
    razorpay_signature: pg.signature,
    razorpay_token: pg.token ?? '',
  });
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
 * Execute one day's debit under the mandate (dev-gated on the backend; the daily
 * charge is normally driven by the backend scheduler). Idempotent by `ref` — the
 * same ref never debits twice. The backend returns the wallet view; we synthesise
 * a minimal execution record for the UI's optimistic history.
 */
export async function executeMandate(id: string, amount: number, ref: string, purpose = 'wallet_topup'): Promise<MandateExecution> {
  await api.post(`/mandate/${id}/execute`, { amount, ref, purpose });
  return { id: ref, ref, amount, purpose, pre_debit_notice_at: '', executed_at: '', rrn: '', status: 'SUCCESS' };
}
