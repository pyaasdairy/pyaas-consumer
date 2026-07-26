import { api, isBackendConfigured } from './apiClient';
import { requireUserId } from './session';

/**
 * UPI AutoPay (Paytm) mandate client — the REAL mechanism, backed by the shared
 * backend (parag-bridge → shared Atlas cluster, `consumer_mandates`).
 *
 * Lifecycle mirrors NPCI UPI AutoPay as the customer sees it in the Paytm app:
 *   PENDING_APPROVAL → (customer approves in Paytm → UMN assigned) → ACTIVE
 *   ACTIVE ⇄ PAUSED → REVOKED, per-debit cap (ceiling ₹15,000, NPCI no-AFA),
 *   AS_PRESENTED recurrence (on-demand debits — the quick-commerce pattern),
 *   every execution idempotent by ref with a pre-debit notice + RRN.
 *
 * When the backend runs with Paytm for Business credentials (PAYTM_MID +
 * PAYTM_MERCHANT_KEY), mandate creation returns the PG deeplink and approval
 * happens inside the real Paytm app; until then the backend runs the same
 * lifecycle in DEMO mode and `approveMandate` stands in for that approval.
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
  umn: string | null; // UPI Mandate Number, visible in Paytm → UPI AutoPay
  created_at: string;
  approved_at: string | null;
  revoked_at: string | null;
  executions: MandateExecution[];
};

export async function listMandates(): Promise<UpiMandate[]> {
  if (!isBackendConfigured()) return [];
  const uid = await requireUserId();
  return api.get<UpiMandate[]>(`/autopay/mandates?user_id=${encodeURIComponent(uid)}`);
}

/** Newest mandate that has not been revoked (one live mandate per member). */
export async function currentMandate(): Promise<UpiMandate | null> {
  const all = await listMandates();
  return all.find((m) => m.state !== 'REVOKED') ?? null;
}

export async function createMandate(params: { maxAmount: number; upiId?: string }): Promise<UpiMandate> {
  const uid = await requireUserId();
  return api.post<UpiMandate>('/autopay/mandates', {
    user_id: uid,
    max_amount: params.maxAmount,
    upi_id: params.upiId,
  });
}

/** Approve = the customer confirming the mandate in Paytm (DEMO stand-in for the PG webhook). */
export async function approveMandate(id: string): Promise<UpiMandate> {
  return api.post<UpiMandate>(`/autopay/mandates/${id}/approve`);
}

export async function pauseMandate(id: string): Promise<UpiMandate> {
  return api.post<UpiMandate>(`/autopay/mandates/${id}/pause`);
}

export async function resumeMandate(id: string): Promise<UpiMandate> {
  return api.post<UpiMandate>(`/autopay/mandates/${id}/resume`);
}

export async function cancelMandate(id: string): Promise<UpiMandate> {
  return api.post<UpiMandate>(`/autopay/mandates/${id}/cancel`);
}

/**
 * Execute a debit under the mandate. Idempotent by `ref` on the backend — the
 * same ref always returns the original execution, never a second debit.
 */
export async function executeMandate(id: string, amount: number, ref: string, purpose = 'wallet_topup'): Promise<MandateExecution> {
  return api.post<MandateExecution>(`/autopay/mandates/${id}/execute`, { amount, ref, purpose });
}
