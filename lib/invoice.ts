import type { Order, OrderItem } from './api';
import { PRODUCTS, type Category } from '../constants/products';
import { CARE_EMAIL, CARE_PHONE } from './support';

/**
 * GST tax-invoice generator for PYAAS consumer orders.
 *
 * This builds a compliant Indian retail/tax invoice from a local order: product
 * wise GST (CGST/SGST for an intra-state supply, IGST for inter-state), an FY
 * invoice number, seller GSTIN + FSSAI header, buyer + delivery address, and a
 * shareable plain-text / HTML rendering (via react-native `Share`, so there is
 * no native PDF dependency).
 *
 * Retail dairy prices on paragdairy.com are MRP == selling price and are GST
 * INCLUSIVE, so the taxable value is back-calculated out of each line price
 * (taxable = price / (1 + gst%)). That keeps the customer-facing total exactly
 * equal to what they paid.
 *
 * apiClient seam: when the Go backend is live it will issue the real, digitally
 * signed GST invoice (proper e-invoice IRN/QR, an authoritative FY sequence, and
 * the registered GSTIN/FSSAI). At that point, replace `buildInvoice` with
 *   api.get<Invoice>(`/orders/${orderId}/invoice`)
 * and keep the render/display helpers below as-is for offline receipts.
 */

// ── Biller identity ───────────────────────────────────────────────────────────
// PYAAS bills the customer (the seller of record on the bill). The manufacturer
// of the goods is shown separately below.
// ALL registration numbers here are PLACEHOLDERS — replace the five values in
// this block (and MANUFACTURER) with the registered ones; flip the
// *_is_placeholder flags to false and the "(to be updated)" tag disappears.
export const SELLER = {
  name: 'PYAAS Dairy',
  brand: 'PYAAS',
  // PLACEHOLDER GSTIN. Format: 2-digit state code + PAN + entity + Z + check.
  // 09 = Uttar Pradesh (PYAAS registered in UP → intra-state CGST + SGST).
  gstin: '09AAAAA0000A1Z5',
  gstin_is_placeholder: true,
  // PARAG (Lucknow Producers Co-operative Milk Union Ltd) FSSAI licence — the
  // manufacturer's licence as printed on the Parag Taaza pack.
  fssai: '12722999000171',
  fssai_is_placeholder: false,
  address: 'PYAAS Dairy, Lucknow, Uttar Pradesh 226001',
  state: 'Uttar Pradesh',
  state_code: '09', // GST state code for the place of the seller (UP)
  email: CARE_EMAIL,
  phone: CARE_PHONE, // single source: lib/support.ts CARE_PHONE
  cin: 'PLACEHOLDER-CIN',
} as const;

// ── Manufacturer identity — the dairy that makes the goods ────────────────────
// Shown on the bill as "Goods manufactured by" with its own GSTIN + FSSAI.
// PLACEHOLDERS — founder to confirm the legal entity, its registered numbers
// and address, then flip the flags.
export const MANUFACTURER = {
  // The dairy actually making the launch-range milk: PARAG (as on-pack).
  name: 'Lucknow Producers Co-operative Milk Union Ltd',
  brand: 'PARAG',
  gstin: '09PPPPP0000P1Z5', // PLACEHOLDER — confirm the Union's GSTIN
  gstin_is_placeholder: true,
  fssai: '12722999000171', // as printed on the Parag Taaza pack
  fssai_is_placeholder: false,
  address: 'Plot No. 166, 167, 13 Km Stone Sultanpur Road, Gosaiganj, Lucknow (U.P.) 226002',
} as const;

// ── Indicative GST rates + HSN by product category ───────────────────────────
// INDICATIVE / FOUNDER-ADJUSTABLE. Confirm current rates with your CA before
// issuing real invoices. Rates reflect common Indian dairy treatment: fresh milk
// is nil-rated; pre-packaged & labelled curd/buttermilk/lassi/paneer attract 5%;
// ghee/butter 12%; flavoured milk 12%; packaged sweets 5%.
export const GST_BY_CATEGORY: Record<Category, { hsn: string; rate: number }> = {
  milk: { hsn: '0401', rate: 0 },
  dahi: { hsn: '0403', rate: 5 },
  chaach: { hsn: '0403', rate: 5 },
  mattha: { hsn: '0403', rate: 5 },
  lassi: { hsn: '0403', rate: 5 },
  paneer: { hsn: '0406', rate: 5 },
  ghee: { hsn: '0405', rate: 12 },
  butter: { hsn: '0405', rate: 12 },
  flavoured_milk: { hsn: '2202', rate: 12 },
  khoya: { hsn: '0406', rate: 5 },
  super_tea: { hsn: '0401', rate: 0 }, // tea milk, GST-exempt like plain milk
  sweets: { hsn: '2106', rate: 5 },
};

const DEFAULT_TAX = { hsn: '0406', rate: 5 }; // safe fallback for an unknown SKU

/** Resolve HSN + GST% for an order line (by product id, else name keywords). */
export function gstFor(item: Pick<OrderItem, 'product_id' | 'name'>): { hsn: string; rate: number } {
  const prod = PRODUCTS.find((p) => p.id === item.product_id);
  if (prod) return GST_BY_CATEGORY[prod.category] ?? DEFAULT_TAX;
  const n = (item.name || '').toLowerCase();
  if (n.includes('milk') && !n.includes('flavour')) return GST_BY_CATEGORY.milk;
  if (n.includes('ghee')) return GST_BY_CATEGORY.ghee;
  if (n.includes('butter') || n.includes('makkhan')) return GST_BY_CATEGORY.butter;
  if (n.includes('paneer')) return GST_BY_CATEGORY.paneer;
  if (n.includes('dahi') || n.includes('curd')) return GST_BY_CATEGORY.dahi;
  if (n.includes('lassi')) return GST_BY_CATEGORY.lassi;
  if (n.includes('chaach') || n.includes('chhach') || n.includes('buttermilk') || n.includes('mattha')) return GST_BY_CATEGORY.chaach;
  return DEFAULT_TAX;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type InvoiceType = 'tax' | 'retail' | 'credit_note' | 'debit_note' | 'refund' | 'subscription';

export type InvoiceParty = {
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null; // optional buyer/company GSTIN captured at order time
};

export type InvoiceLine = {
  name: string;
  variant: string;
  hsn: string;
  gst_rate: number; // %
  qty: number;
  unit_price: number; // GST-inclusive rupees per unit (== MRP)
  gross: number; // unit_price * qty (inclusive)
  taxable: number; // back-calculated ex-GST value for the line
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number; // taxable + cgst + sgst + igst (== gross)
};

export type Invoice = {
  type: InvoiceType;
  title: string; // human label for the document type
  invoice_no: string; // e.g. PYAAS/2026-27/000123
  order_id: string;
  date: string; // ISO
  fy: string; // e.g. 2026-27
  seller: typeof SELLER;
  manufacturer: typeof MANUFACTURER;
  buyer: InvoiceParty;
  delivery_address: string;
  place_of_supply: string; // state name
  place_of_supply_code: string; // GST state code
  intra_state: boolean; // true => CGST+SGST, false => IGST
  items: InvoiceLine[];
  // money (all rupees)
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  tax_total: number;
  discount: number;
  coupon: string | null;
  delivery_charge: number;
  monsoon_charge: number;
  packaging_charge: number;
  round_off: number;
  grand_total: number;
  notes?: string;
};

const DOC_TITLE: Record<InvoiceType, string> = {
  tax: 'Proforma Bill', // PYAAS proforma bill (indicative; not a final tax invoice)
  retail: 'Retail Invoice',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  refund: 'Refund Voucher',
  subscription: 'Subscription Invoice',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Indian financial year (April–March) for a date, e.g. "2026-27". */
export function financialYear(d: Date): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 == April
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}

/** Stable 6-digit sequence derived from the order id (offline receipts have no
 *  central counter). The Go backend supplies the authoritative sequence later. */
function sequenceFromOrder(orderId: string): number {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return (h % 900000) + 100000; // 100000..999999
}

/** Build an FY invoice number like PYAAS/2026-27/000123. */
export function generateInvoiceNumber(date: Date, sequence: number, prefix = 'PYAAS'): string {
  return `${prefix}/${financialYear(date)}/${String(sequence).padStart(6, '0')}`;
}

/** UP state code check from a 6-digit pincode (2xxxxx range is broadly UP).
 *  Indicative only; the real place of supply comes from the saved address. */
function isUttarPradeshPincode(pincode?: string | null): boolean {
  if (!pincode) return true; // default to UP (seller state) when unknown
  const p = pincode.trim();
  return /^2[0-8]\d{4}$/.test(p);
}

function pincodeFromAddress(addr: string): string | null {
  // The real pincode is appended LAST when placeOrder flattens the address
  // ([line1, line2, city, pincode].join(', ')), so take the LAST 6-digit token —
  // not the first, which could be a house/flat number and would mis-derive the
  // place of supply (→ IGST instead of CGST/SGST for a genuine intra-state order).
  const m = addr.match(/\b\d{6}\b/g);
  return m && m.length ? m[m.length - 1] : null;
}

// ── Build ─────────────────────────────────────────────────────────────────────
export function buildInvoice(
  order: Order,
  opts?: {
    type?: InvoiceType;
    buyer?: InvoiceParty;
    coupon?: string | null;
    discount?: number; // total order-level discount (rupees)
    packaging_charge?: number;
    intra_state?: boolean; // override the pincode heuristic
    sequence?: number; // override the derived sequence (backend authority)
    notes?: string;
  },
): Invoice {
  const type = opts?.type ?? 'tax';
  const date = new Date(order.placed_at || Date.now());
  const items: OrderItem[] = order.order_items ?? [];

  const pincode = pincodeFromAddress(order.address_text || '');
  const intra_state = opts?.intra_state ?? isUttarPradeshPincode(pincode);
  const place_of_supply = intra_state ? SELLER.state : 'Other State';
  const place_of_supply_code = intra_state ? SELLER.state_code : 'NA';

  const lines: InvoiceLine[] = items.map((it) => {
    const { hsn, rate } = gstFor(it);
    const gross = round2(it.price * it.qty);
    // Price is GST-inclusive; back-calculate the taxable (ex-GST) value.
    const taxable = round2(gross / (1 + rate / 100));
    const tax = round2(gross - taxable);
    const cgst = intra_state ? round2(tax / 2) : 0;
    // SGST is the REMAINDER after CGST — not round2(tax/2) again. Since tax/2 is
    // exact in IEEE-754, tax - tax/2 === tax/2, so re-rounding would overstate the
    // pair by 1 paisa on odd-paise tax; subtracting the rounded cgst reconciles
    // cgst + sgst back to tax exactly.
    const sgst = intra_state ? round2(tax - cgst) : 0;
    const igst = intra_state ? 0 : tax;
    return {
      name: it.name,
      variant: it.variant,
      hsn,
      gst_rate: rate,
      qty: it.qty,
      unit_price: it.price,
      gross,
      taxable,
      cgst,
      sgst,
      igst,
      line_total: gross,
    };
  });

  const taxable_total = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const cgst_total = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgst_total = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const igst_total = round2(lines.reduce((s, l) => s + l.igst, 0));
  const tax_total = round2(cgst_total + sgst_total + igst_total);

  const discount = round2(opts?.discount ?? 0);
  const delivery_charge = round2(order.delivery_fee ?? 0);
  const monsoon_charge = round2(order.monsoon_fee ?? 0);
  const packaging_charge = round2(opts?.packaging_charge ?? 0);

  // Grand total mirrors what the customer paid: order.total (already net of any
  // coupon and inclusive of delivery) plus any explicit packaging charge.
  const rawTotal = (order.total ?? taxable_total + tax_total + delivery_charge - discount) + packaging_charge;
  const grand_total = Math.round(rawTotal);
  const round_off = round2(grand_total - rawTotal);

  const sequence = opts?.sequence ?? sequenceFromOrder(order.id);

  return {
    type,
    title: DOC_TITLE[type],
    invoice_no: generateInvoiceNumber(date, sequence),
    order_id: order.id,
    date: date.toISOString(),
    fy: financialYear(date),
    seller: SELLER,
    manufacturer: MANUFACTURER,
    buyer: opts?.buyer ?? { name: 'PYAAS customer', phone: null, email: null },
    delivery_address: order.address_text || '',
    place_of_supply,
    place_of_supply_code,
    intra_state,
    items: lines,
    taxable_total,
    cgst_total,
    sgst_total,
    igst_total,
    tax_total,
    discount,
    coupon: opts?.coupon ?? null,
    delivery_charge,
    monsoon_charge,
    packaging_charge,
    round_off,
    grand_total,
    notes: opts?.notes,
  };
}

// ── Display helper (structured rows for on-screen rendering) ─────────────────
export type DisplayRow = { label: string; value: string; strong?: boolean };

const inr = (n: number): string => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money rows for the invoice summary block on screen. */
export function invoiceSummaryRows(inv: Invoice): DisplayRow[] {
  const rows: DisplayRow[] = [{ label: 'Taxable value', value: inr(inv.taxable_total) }];
  if (inv.intra_state) {
    rows.push({ label: 'CGST', value: inr(inv.cgst_total) });
    rows.push({ label: 'SGST', value: inr(inv.sgst_total) });
  } else {
    rows.push({ label: 'IGST', value: inr(inv.igst_total) });
  }
  if (inv.discount > 0) rows.push({ label: `Discount${inv.coupon ? ` (${inv.coupon})` : ''}`, value: '-' + inr(inv.discount) });
  rows.push({ label: 'Delivery charge', value: inv.delivery_charge > 0 ? inr(inv.delivery_charge) : 'Free' });
  if (inv.monsoon_charge > 0) rows.push({ label: 'Monsoon fee', value: inr(inv.monsoon_charge) });
  if (inv.packaging_charge > 0) rows.push({ label: 'Packaging charge', value: inr(inv.packaging_charge) });
  if (Math.abs(inv.round_off) >= 0.01) rows.push({ label: 'Round off', value: (inv.round_off >= 0 ? '+' : '') + inr(inv.round_off) });
  rows.push({ label: 'Grand total', value: '₹' + inv.grand_total.toLocaleString('en-IN'), strong: true });
  return rows;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Plain-text render (react-native Share message) ───────────────────────────
export function renderInvoiceText(inv: Invoice): string {
  const L: string[] = [];
  L.push(`${inv.title}`);
  L.push(`Billed by: ${inv.seller.name}`);
  L.push(`GSTIN: ${inv.seller.gstin}${inv.seller.gstin_is_placeholder ? ' (to be updated)' : ''}`);
  L.push(`FSSAI: ${inv.seller.fssai}${inv.seller.fssai_is_placeholder ? ' (to be updated)' : ''}`);
  L.push(inv.seller.address);
  L.push('');
  L.push(`Goods manufactured by: ${inv.manufacturer.name}`);
  L.push(`GSTIN: ${inv.manufacturer.gstin}${inv.manufacturer.gstin_is_placeholder ? ' (to be updated)' : ''}`);
  L.push(`FSSAI: ${inv.manufacturer.fssai}${inv.manufacturer.fssai_is_placeholder ? ' (to be updated)' : ''}`);
  L.push('');
  L.push(`Invoice No: ${inv.invoice_no}`);
  L.push(`Date: ${fmtDate(inv.date)}`);
  L.push(`Order: ${inv.order_id}`);
  L.push(`Place of supply: ${inv.place_of_supply} (${inv.place_of_supply_code})`);
  L.push('');
  L.push(`Billed to: ${inv.buyer.name}${inv.buyer.phone ? ' · ' + inv.buyer.phone : ''}`);
  if (inv.buyer.gstin) L.push(`Buyer GSTIN: ${inv.buyer.gstin}`);
  if (inv.delivery_address) L.push(`Deliver to: ${inv.delivery_address}`);
  L.push('');
  L.push('Items');
  inv.items.forEach((it, i) => {
    L.push(`${i + 1}. ${it.name} (${it.variant})`);
    L.push(`   HSN ${it.hsn} · GST ${it.gst_rate}% · ${it.qty} x ₹${it.unit_price} = ${inr(it.gross)}`);
    if (inv.intra_state) L.push(`   Taxable ${inr(it.taxable)} · CGST ${inr(it.cgst)} · SGST ${inr(it.sgst)}`);
    else L.push(`   Taxable ${inr(it.taxable)} · IGST ${inr(it.igst)}`);
  });
  L.push('');
  invoiceSummaryRows(inv).forEach((r) => L.push(`${r.label}: ${r.value}`));
  L.push('');
  L.push('Prices are inclusive of GST. This is a proforma bill (indicative), not a valid tax invoice, and does not require a signature.');
  if (inv.seller.gstin_is_placeholder || inv.seller.fssai_is_placeholder || inv.manufacturer.gstin_is_placeholder) {
    L.push('Note: GSTIN/FSSAI marked "to be updated" are pending registration.');
  }
  return L.join('\n');
}

// ── HTML render (for Share on platforms that accept an HTML/url payload, or a
//    future WebView print). Self-contained inline styles, no external assets. ──
export function renderInvoiceHtml(inv: Invoice): string {
  const rows = inv.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(it.name)}<br><span class="muted">${escapeHtml(it.variant)}</span></td>
        <td>${it.hsn}</td>
        <td>${it.gst_rate}%</td>
        <td class="r">${it.qty}</td>
        <td class="r">${inr(it.unit_price)}</td>
        <td class="r">${inr(it.taxable)}</td>
        <td class="r">${inv.intra_state ? inr(it.cgst) : '-'}</td>
        <td class="r">${inv.intra_state ? inr(it.sgst) : '-'}</td>
        <td class="r">${inv.intra_state ? '-' : inr(it.igst)}</td>
        <td class="r">${inr(it.gross)}</td>
      </tr>`,
    )
    .join('');
  const summary = invoiceSummaryRows(inv)
    .map((r) => `<tr class="${r.strong ? 'strong' : ''}"><td>${escapeHtml(r.label)}</td><td class="r">${escapeHtml(r.value)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#241A15;margin:0;padding:20px;background:#fff}
    h1{font-size:20px;margin:0 0 2px}
    .muted{color:#9A8D83;font-size:11px}
    .head{border-bottom:2px solid #E8491D;padding-bottom:10px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{padding:6px 6px;border-bottom:1px solid #EDE4DA;text-align:left;vertical-align:top}
    th{background:#FFF6EC;font-size:11px}
    .r{text-align:right}
    .totals{margin-top:14px;width:60%;margin-left:auto}
    .totals .strong td{font-weight:700;border-top:2px solid #241A15}
    .foot{margin-top:18px;font-size:11px;color:#5E5047}
  </style></head><body>
    <div class="head">
      <h1>${escapeHtml(inv.title)}</h1>
      <div class="muted"><b>Billed by</b> ${escapeHtml(inv.seller.name)}</div>
      <div class="muted">GSTIN ${escapeHtml(inv.seller.gstin)}${inv.seller.gstin_is_placeholder ? ' (to be updated)' : ''} · FSSAI ${escapeHtml(inv.seller.fssai)}${inv.seller.fssai_is_placeholder ? ' (to be updated)' : ''}</div>
      <div class="muted">${escapeHtml(inv.seller.address)}</div>
      <div class="muted" style="margin-top:6px"><b>Goods manufactured by</b> ${escapeHtml(inv.manufacturer.name)}</div>
      <div class="muted">GSTIN ${escapeHtml(inv.manufacturer.gstin)}${inv.manufacturer.gstin_is_placeholder ? ' (to be updated)' : ''} · FSSAI ${escapeHtml(inv.manufacturer.fssai)}${inv.manufacturer.fssai_is_placeholder ? ' (to be updated)' : ''}</div>
    </div>
    <table style="font-size:12px;margin-bottom:12px">
      <tr><td><b>Invoice No</b><br>${escapeHtml(inv.invoice_no)}</td>
          <td><b>Date</b><br>${escapeHtml(fmtDate(inv.date))}</td>
          <td><b>Place of supply</b><br>${escapeHtml(inv.place_of_supply)} (${escapeHtml(inv.place_of_supply_code)})</td></tr>
      <tr><td colspan="3"><b>Billed to</b><br>${escapeHtml(inv.buyer.name)}${inv.buyer.phone ? ' · ' + escapeHtml(inv.buyer.phone) : ''}${inv.buyer.gstin ? '<br>Buyer GSTIN: ' + escapeHtml(inv.buyer.gstin) : ''}<br><span class="muted">${escapeHtml(inv.delivery_address)}</span></td></tr>
    </table>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>HSN</th><th>GST</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">${summary}</table>
    <div class="foot">Prices are inclusive of GST. This is a proforma bill (indicative), not a valid tax invoice, and does not require a signature.${inv.seller.gstin_is_placeholder || inv.seller.fssai_is_placeholder || inv.manufacturer.gstin_is_placeholder ? ' GSTIN/FSSAI marked "to be updated" are pending registration.' : ''}</div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
