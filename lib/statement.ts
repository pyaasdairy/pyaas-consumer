import { rupee } from './theme';
import type { WalletLedgerRow, LedgerType } from './walletApi';

const isCredit = (t: LedgerType) => t !== 'debit';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Render a self-contained HTML wallet statement for expo-print -> PDF, modelled
 *  on lib/invoice.ts (same PARAG flame header + inline-CSS table). */
export function renderStatementHtml(
  rows: WalletLedgerRow[],
  opts: { generatedAt: string; balance?: number; name?: string; filterLabel?: string },
): string {
  const totalIn = rows.filter((r) => isCredit(r.type)).reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => !isCredit(r.type)).reduce((s, r) => s + r.amount, 0);

  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
      <td>${esc(fmtDate(r.created_at))}</td>
      <td>${esc(r.remark ?? r.ref_type)}<br><span class="muted">${r.bucket === 'promo' ? 'Rewards' : 'Cash'}${r.status !== 'success' ? ' · ' + esc(r.status) : ''}</span></td>
      <td class="r ${isCredit(r.type) ? 'in' : 'out'}">${isCredit(r.type) ? '+' : '-'}${esc(rupee(r.amount))}</td>
      <td class="r">${esc(rupee(r.closing_balance))}</td>
    </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted" style="text-align:center;padding:24px">No transactions in this statement.</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#241A15;margin:0;padding:22px;background:#fff}
    h1{font-size:20px;margin:0 0 2px}
    .muted{color:#9A8D83;font-size:11px}
    .head{border-bottom:2px solid #E8491D;padding-bottom:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end}
    .cards{display:flex;gap:10px;margin:14px 0}
    .card{flex:1;border:1px solid #EDE4DA;border-radius:10px;padding:10px 12px}
    .card .k{font-size:10px;color:#9A8D83;letter-spacing:.4px;text-transform:uppercase}
    .card .v{font-size:17px;font-weight:700;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{padding:7px 6px;border-bottom:1px solid #EDE4DA;text-align:left;vertical-align:top}
    th{background:#FFF6EC;font-size:11px}
    .r{text-align:right}
    .in{color:#2E5AAC;font-weight:700}
    .out{color:#241A15;font-weight:700}
    .foot{margin-top:18px;font-size:11px;color:#5E5047}
  </style></head><body>
  <div class="head">
    <div>
      <h1>PARAG Wallet statement</h1>
      <div class="muted">${esc(opts.name ?? 'PARAG member')} · Generated ${esc(opts.generatedAt)}${opts.filterLabel ? ' · ' + esc(opts.filterLabel) : ''}</div>
    </div>
    <div style="color:#E8491D;font-weight:800;font-size:15px">PARAG</div>
  </div>
  <div class="cards">
    <div class="card"><div class="k">Money in</div><div class="v" style="color:#2E5AAC">${esc(rupee(totalIn))}</div></div>
    <div class="card"><div class="k">Money out</div><div class="v">${esc(rupee(totalOut))}</div></div>
    <div class="card"><div class="k">Balance</div><div class="v" style="color:#E8491D">${esc(rupee(opts.balance ?? 0))}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Details</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="foot">This is a computer-generated wallet statement from the PARAG app. Cash and reward (promo) balances are tracked separately. For queries, contact PARAG customer care.</div>
  </body></html>`;
}
