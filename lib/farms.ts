import { isBackendConfigured } from './apiClient';

/**
 * PARAG member dairies (district cooperative dairy unions).
 *
 * PARAG is the consumer brand of the Uttar Pradesh cooperative dairy structure
 * (Pradeshik Cooperative Dairy Federation, "PCDF"). It is NOT a single farm: the
 * milk in every pack is pooled from village dairy cooperative societies, chilled
 * and processed at a member DISTRICT MILK UNION, and quality tested at that
 * union's plant. This module powers a "member dairies" locator that shows the
 * nearest processing union to the signed-in user.
 *
 * Data is seeded locally so the screen is fully alive offline (demo). When the
 * PARAG backend is wired in, the same shape can be served from the API:
 *   // TODO(api): GET /member-dairies  -> MemberDairy[]  (public, no auth needed)
 * and an optional nearest lookup can move server-side. Until then everything
 * runs on the seeded list below with an on-device haversine distance.
 */

export type MemberDairy = {
  id: string;
  /** Full cooperative union name. */
  name: string;
  /** Short label used in tight UI (e.g. "Lucknow Milk Union"). */
  shortName: string;
  district: string;
  /** Processing plant / chilling-centre address line. */
  plant: string;
  lat: number;
  lng: number;
  /** Number of affiliated village dairy cooperative societies (demo figures). */
  societies: number;
  /** Handling capacity in lakh litres per day (demo figures). */
  capacityLLPD: number;
  /** Year the union was established. */
  established: number;
  /** Short, honest cooperative blurb (no invented farmer stories). */
  blurb: string;
  /** Populated by nearest/list helpers once user coords are known. */
  distance_km?: number;
};

/**
 * Seeded member district milk unions across Uttar Pradesh. Names, districts and
 * coordinates are real UP district-union locations; the society/capacity numbers
 * are representative demo figures and are labelled as such in the UI copy.
 */
const SEED: MemberDairy[] = [
  {
    id: 'union_lucknow',
    name: 'Lucknow Dugdh Utpadak Sahkari Sangh',
    shortName: 'Lucknow Milk Union',
    district: 'Lucknow',
    plant: 'Parag Dairy Plant, Jopling Road, Lucknow',
    lat: 26.8467,
    lng: 80.9462,
    societies: 1180,
    capacityLLPD: 4.5,
    established: 1938,
    blurb: 'The flagship PARAG union. Milk pooled from village societies across the Lucknow region is chilled, standardised and tested here before packing.',
  },
  {
    id: 'union_kanpur',
    name: 'Kanpur Dugdh Utpadak Sahkari Sangh',
    shortName: 'Kanpur Milk Union',
    district: 'Kanpur Nagar',
    plant: 'Parag Dairy Plant, Dada Nagar, Kanpur',
    lat: 26.4499,
    lng: 80.3319,
    societies: 940,
    capacityLLPD: 3.0,
    established: 1964,
    blurb: 'Serves the industrial Kanpur belt. Every batch clears FAT and SNF checks at the union lab before it reaches a PARAG parlour.',
  },
  {
    id: 'union_varanasi',
    name: 'Varanasi Dugdh Utpadak Sahkari Sangh',
    shortName: 'Varanasi Milk Union',
    district: 'Varanasi',
    plant: 'Parag Dairy Plant, Ramnagar, Varanasi',
    lat: 25.3176,
    lng: 82.9739,
    societies: 720,
    capacityLLPD: 1.8,
    established: 1976,
    blurb: 'Collects from cooperative societies across the Purvanchal districts and supplies fresh milk and paneer to the Varanasi region.',
  },
  {
    id: 'union_gonda',
    name: 'Gonda Dugdh Utpadak Sahkari Sangh',
    shortName: 'Gonda Milk Union',
    district: 'Gonda',
    plant: 'Parag Chilling Centre, Gonda',
    lat: 27.1339,
    lng: 81.9617,
    societies: 610,
    capacityLLPD: 1.2,
    established: 1981,
    blurb: 'A largely rural catchment. Morning and evening pooling from village societies feeds the chilling centre that supplies the Devipatan region.',
  },
  {
    id: 'union_agra',
    name: 'Agra Dugdh Utpadak Sahkari Sangh',
    shortName: 'Agra Milk Union',
    district: 'Agra',
    plant: 'Parag Dairy Plant, Sikandra, Agra',
    lat: 27.1767,
    lng: 78.0081,
    societies: 830,
    capacityLLPD: 2.2,
    established: 1972,
    blurb: 'Anchors PARAG supply across the Braj districts, with cold-chain tankering from society chilling points into the Agra plant.',
  },
  {
    id: 'union_meerut',
    name: 'Meerut Dugdh Utpadak Sahkari Sangh',
    shortName: 'Meerut Milk Union',
    district: 'Meerut',
    plant: 'Parag Dairy Plant, Meerut',
    lat: 28.9845,
    lng: 77.7064,
    societies: 990,
    capacityLLPD: 2.6,
    established: 1969,
    blurb: 'Covers the western UP dairy heartland. High pooled volumes from the region keep the Meerut plant running two shifts.',
  },
  {
    id: 'union_prayagraj',
    name: 'Prayagraj Dugdh Utpadak Sahkari Sangh',
    shortName: 'Prayagraj Milk Union',
    district: 'Prayagraj',
    plant: 'Parag Dairy Plant, Naini, Prayagraj',
    lat: 25.4358,
    lng: 81.8463,
    societies: 680,
    capacityLLPD: 1.6,
    established: 1974,
    blurb: 'Pools milk from the Prayagraj and adjoining districts and supplies fresh milk, curd and ghee under the PARAG mark.',
  },
  {
    id: 'union_gorakhpur',
    name: 'Gorakhpur Dugdh Utpadak Sahkari Sangh',
    shortName: 'Gorakhpur Milk Union',
    district: 'Gorakhpur',
    plant: 'Parag Dairy Plant, Gorakhpur',
    lat: 26.7606,
    lng: 83.3732,
    societies: 560,
    capacityLLPD: 1.1,
    established: 1979,
    blurb: 'The eastern-most PARAG union. Chilling centres across the region feed the Gorakhpur plant that serves the districts around it.',
  },
];

/** Great-circle distance in km between two coordinates (haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** All member dairies. If user coords are given, each row carries distance_km and
 *  the list is returned nearest-first. */
export async function listMemberDairies(near?: { lat: number; lng: number }): Promise<MemberDairy[]> {
  // TODO(api): when isBackendConfigured(), GET /member-dairies instead of SEED.
  void isBackendConfigured;
  const rows = SEED.map((d) => ({ ...d }));
  if (!near) return rows;
  for (const d of rows) d.distance_km = distanceKm(near.lat, near.lng, d.lat, d.lng);
  return rows.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
}

/** The single nearest member dairy to a coordinate. */
export async function nearestMemberDairy(lat: number, lng: number): Promise<MemberDairy | null> {
  const rows = await listMemberDairies({ lat, lng });
  return rows[0] ?? null;
}
