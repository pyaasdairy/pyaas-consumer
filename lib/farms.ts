import { isBackendConfigured } from './apiClient';

/**
 * Where the dairy PYAAS sells is actually MADE.
 *
 * PYAAS is a seller, not a dairy. The launch range is PARAG-branded milk and
 * dairy manufactured by Lucknow Producers Co-operative Milk Union Ltd, which is
 * part of the Uttar Pradesh cooperative dairy structure: milk pooled from
 * village dairy cooperative societies, chilled and processed at the district
 * union plant, packed there and sold on by PYAAS.
 *
 * This module used to seed EIGHT real UP district milk unions, each with a
 * "PYAAS partner union" blurb and society/capacity numbers that were invented
 * for the demo. Both had to go before store submission: naming real third-party
 * cooperatives as commercial partners we have no agreement with is a rights
 * problem (App Store 5.2.1 — Apple pulls first and asks later if the rights
 * holder complains), and the figures were unverifiable. What is left is the one
 * dairy PYAAS can evidence, because its name, address and licence are printed
 * on the pack the customer is handed.
 *
 * Add a row here ONLY when the operator can point at a document for it.
 *   // TODO(api): GET /source-dairies -> SourceDairy[]  (public, no auth needed)
 */

export type SourceDairy = {
  id: string;
  /** Legal entity name of the manufacturer, exactly as declared on the pack. */
  name: string;
  /** Short label used in tight UI. */
  shortName: string;
  /** Brand the packs carry. The manufacturer's trademark, never PYAAS's. */
  brand: string;
  district: string;
  /** Manufacturing plant address as declared on the pack. */
  plant: string;
  /** Factual sourcing note: no partnership claims, no invented figures. */
  blurb: string;
};

/**
 * The dairy behind the packs we deliver. One entry, on purpose — see the module
 * note above. No coordinates and no maps deep link: routing customers to a
 * third party's plant is not ours to offer.
 */
const SEED: SourceDairy[] = [
  {
    id: 'union_lucknow',
    name: 'Lucknow Producers Co-operative Milk Union Ltd',
    shortName: 'Lucknow Producers Co-operative Milk Union',
    brand: 'PARAG',
    district: 'Lucknow',
    // Manufacturer address as printed on the pack. Single source of truth is
    // MANUFACTURER in lib/invoice.ts (the bill prints the same block) — keep
    // the two in step if the operator confirms a different plant address.
    plant: 'Plot No. 166, 167, 13 Km Stone Sultanpur Road, Gosaiganj, Lucknow, Uttar Pradesh 226002',
    blurb:
      'The milk and dairy PYAAS delivers is made here and reaches you in the manufacturer\'s sealed pack. Milk is pooled from village dairy cooperative societies, then chilled, tested, processed and packed at the union plant. PARAG is the union\'s own brand.',
  },
];

/** Dairies whose products PYAAS sells. Only what the operator can evidence. */
export async function listSourceDairies(): Promise<SourceDairy[]> {
  // TODO(api): when isBackendConfigured(), GET /source-dairies instead of SEED.
  void isBackendConfigured;
  return SEED.map((d) => ({ ...d }));
}
