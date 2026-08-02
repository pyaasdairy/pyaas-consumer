import { CARE_PHONE } from '../lib/support';

import type { ImageSourcePropType } from 'react-native';

export type Category =
  | 'milk'
  | 'dahi'
  | 'paneer'
  | 'ghee'
  | 'butter'
  | 'chaach'
  | 'flavoured_milk'
  | 'mattha'
  | 'lassi'
  | 'khoya'
  | 'super_tea'
  | 'sweets';

export type Product = {
  id: string; // the SKU / variantId — cart lines key by this (500 ml and 1 L are separate lines)
  name: string;
  variant: string; // e.g. "1L Pouch"
  /** Groups sibling SKUs (500 ml / 1 L …) under one storefront card. Defaults to
   *  `name` when omitted — set explicitly only when two lines share a name but
   *  should NOT collapse into one card (or vice-versa). */
  baseId?: string;
  category: Category;
  price: number;
  mrp?: number; // on paragdairy.com MRP == offer price on every SKU, so mrp is omitted (no invented discounts)
  unit: string; // e.g. "1 L"
  tag: string; // short descriptor ('' = none)
  description: string;
  /** Bundled pack shot. Missing for SKUs with no source photo yet; the UI
   *  renders a flat brand-cream tile with the product name instead. */
  image?: ImageSourcePropType;
  subscribable: boolean; // ONLY milk is subscribable (daily morning delivery); everything else is one-time
  // ── Social proof (seeded demo data; see META below). All optional so any
  //    un-seeded SKU renders nothing. ──
  rating?: number;        // 0-5, one decimal
  ratingCount?: number;   // number of ratings behind the average
  mostOrdered?: boolean;  // shows a "MOST ORDERED" badge + surfaces on a home shelf
  packCount?: number;     // 2-3 => a grouped/bulk pack, rendered as overlapping pack shots
  /** Not currently orderable: card + detail render an "OUT OF STOCK" state and the
   *  SKU is excluded from every order/subscription flow until the flag drops. */
  outOfStock?: boolean;
  /** Per-SKU manufacturer overrides (e.g. partner SKUs sold on PYAAS).
   *  Override all three together so a partner SKU never shows its own
   *  manufacturer name above PYAAS's address / FSSAI licence. */
  manufacturer?: string;
  manufacturerAddress?: string;
  fssaiLicense?: string;
  // ── Compliance (FSSAI / Legal Metrology / GST) · optional per-SKU overrides;
  //    defaults come from COMPLIANCE + the category helpers below. Founder to
  //    confirm exact values before launch. Surfaced on product + invoice. ──
  hsn?: string;
  gstRate?: number;         // product-wise GST %
  netQuantity?: string;     // e.g. "1 L", "500 g"
  veg?: boolean;            // green-dot veg mark (all PYAAS dairy is veg)
  ingredients?: string;
  nutrition?: string;       // per 100 g / 100 ml summary
  allergens?: string;
  shelfLife?: string;
  storage?: string;
  countryOfOrigin?: string;
};

/**
 * Shared FSSAI / Legal Metrology / seller block for every PYAAS SKU. These are
 * PLACEHOLDERS the founder confirms before launch. Shown on product listings
 * and on every tax invoice (Legal Metrology + FSSAI + GST require them).
 */
export const COMPLIANCE = {
  brand: 'PYAAS',
  manufacturer: 'PYAAS Dairy Private Limited', // PLACEHOLDER — founder to confirm legal entity
  manufacturerAddress: 'PYAAS Dairy, Lucknow, Uttar Pradesh', // PLACEHOLDER — founder to confirm
  fssaiLicense: '10012345000000',   // PLACEHOLDER - confirm the real FSSAI licence number
  gstin: '09AAAAA0000A1Z5',         // PLACEHOLDER - confirm the real GSTIN
  customerCare: CARE_PHONE,         // single source: lib/support.ts (PLACEHOLDER until founder confirms)
  customerCareEmail: 'care@pyaasdairy.in', // PLACEHOLDER — founder to confirm
  countryOfOrigin: 'India',
} as const;

/** Indicative Indian dairy GST by category (founder-adjustable). Fresh
 *  pasteurised milk is GST-exempt; curd/paneer/buttermilk/sweets 5%; ghee/butter 12%. */
export function gstFor(category: Category): number {
  switch (category) {
    case 'milk': case 'super_tea': return 0; // plain / tea milk is GST-exempt
    case 'ghee': case 'butter': case 'flavoured_milk': return 12;
    default: return 5; // dahi, paneer, chaach, mattha, lassi, khoya, sweets
  }
}

/** Indicative HSN code by category (founder-adjustable). */
export function hsnFor(category: Category): string {
  switch (category) {
    case 'milk': case 'super_tea': return '0401';
    case 'dahi': case 'chaach': case 'mattha': case 'lassi': return '0403';
    case 'paneer': case 'khoya': return '0406';
    case 'ghee': case 'butter': return '0405';
    case 'flavoured_milk': return '2202';
    case 'sweets': return '2106';
    default: return '0406';
  }
}

function defaultStorage(category: Category): string {
  return category === 'ghee' ? 'Store in a cool, dry place away from sunlight.' : 'Keep refrigerated at 4 degrees C or below.';
}
function defaultShelfLife(category: Category): string {
  switch (category) {
    case 'milk': case 'flavoured_milk': case 'chaach': case 'mattha': case 'lassi': return '2 days from packaging when refrigerated.';
    case 'ghee': return '9 months from packaging.';
    case 'sweets': return '3 to 5 days when refrigerated.';
    default: return '3 to 4 days from packaging when refrigerated.';
  }
}
function defaultIngredients(category: Category): string {
  switch (category) {
    case 'ghee': return 'Cow / buffalo milk fat (ghee).';
    case 'paneer': return 'Milk, milk solids, acidulant (citric acid).';
    case 'dahi': return 'Pasteurised toned milk, active lactic cultures.';
    case 'sweets': return 'Milk solids, sugar, edible dairy ingredients.';
    default: return 'Pasteurised milk.';
  }
}

/** Full compliance view for a product: per-SKU overrides on top of brand + category defaults. */
export function complianceFor(p: Product) {
  return {
    ...COMPLIANCE,
    manufacturer: p.manufacturer ?? COMPLIANCE.manufacturer,
    manufacturerAddress: p.manufacturerAddress ?? COMPLIANCE.manufacturerAddress,
    fssaiLicense: p.fssaiLicense ?? COMPLIANCE.fssaiLicense,
    hsn: p.hsn ?? hsnFor(p.category),
    gstRate: p.gstRate ?? gstFor(p.category),
    netQuantity: p.netQuantity ?? p.unit,
    veg: p.veg ?? true,
    ingredients: p.ingredients ?? defaultIngredients(p.category),
    nutrition: p.nutrition ?? '',
    allergens: p.allergens ?? 'Contains milk.',
    shelfLife: p.shelfLife ?? defaultShelfLife(p.category),
    storage: p.storage ?? defaultStorage(p.category),
    countryOfOrigin: p.countryOfOrigin ?? COMPLIANCE.countryOfOrigin,
  };
}

// Real pack shots bundled with the app (original Parag brand assets). One reference photo covers all
// pack sizes of a line (e.g. the same Taaza pouch art for 500ml / 1L / 5L).
const IMG = {
  taaza: require('../assets/products/taaza.png'),
  gold: require('../assets/products/gold.png'),
  dahiPouch: require('../assets/products/dahi-pouch.png'),
  dahiCup: require('../assets/products/dahi-cup.png'),
  paneer: require('../assets/products/paneer.png'),
  ghee: require('../assets/products/ghee.png'), // poly-pack shot; only ghee reference photo available (also used for Sika pack)
  butter: require('../assets/products/butter.png'), // Makkhan label art (no pack shot available)
  chaach: require('../assets/products/chaach.png'),
  flavouredMilk: require('../assets/products/flavoured-milk.png'),
  lassi: require('../assets/products/lassi.png'),
  // Added from "Parag brand assets 2"
  shakti: require('../assets/products/shakti.png'),
  chaiSpecial: require('../assets/products/chai-special.png'),
  masalaMattha: require('../assets/products/masala-mattha.png'),
  khoya: require('../assets/products/khoya.png'),
  besanLadoo: require('../assets/products/besan-ladoo.png'),
  chhenaKheer: require('../assets/products/chhena-kheer.png'),
  dahiBucket: require('../assets/products/dahi-bucket.png'),
  lassiCup: require('../assets/products/lassi-cup.png'),
  // Added from "parag products new"
  milkCake: require('../assets/products/milk-cake.png'),
  shriKhand: require('../assets/products/shri-khand.png'),
  rasgolla: require('../assets/products/rasgolla.png'),
  mattha: require('../assets/products/mattha.png'),
  peda: require('../assets/products/peda.png'),
  gulabJamun: require('../assets/products/gulab-jamun.png'),
  riceKheer: require('../assets/products/rice-kheer.png'),
  // PYAAS partner SKUs (marketed & manufactured by PYAAS, listed ahead of launch)
  pyaasA2Carton: require('../assets/products/pyaas-a2-1l.png'),
  pyaasA2Pouch: require('../assets/products/pyaas-a2-pouch.png'),
  pyaasTonedCarton: require('../assets/products/pyaas-toned-1l.png'),
  pyaasTonedPouch: require('../assets/products/pyaas-toned-pouch.png'),
};

// Real BACK-of-pack photos (rotated upright) for the flip on the Home hero shelf.
// Only SKUs we actually photographed get a back; the rest fall back to the printed
// PackBack card. Keyed to the SAME front image so it maps to every size of a line.
const IMG_BACK = {
  taaza: require('../assets/products/taaza-back.jpg'),
  ghee: require('../assets/products/ghee-back.jpg'),
  chaach: require('../assets/products/chaach-back.jpg'),
  dahi: require('../assets/products/dahi-back.jpg'),
};

/** The real back-of-pack photo for a product, or null when we only have the front. */
export function backImageFor(p: Product): number | null {
  switch (p.image) {
    case IMG.taaza:
      return IMG_BACK.taaza;
    case IMG.ghee:
      return IMG_BACK.ghee;
    case IMG.chaach:
    case IMG.mattha:
    case IMG.masalaMattha:
      return IMG_BACK.chaach;
    case IMG.dahiPouch:
    case IMG.dahiCup:
    case IMG.dahiBucket:
      return IMG_BACK.dahi;
    default:
      return null;
  }
}

/**
 * PYAAS product catalog, extracted from the live paragdairy.com storefront
 * (Pradeshik Cooperative Dairy Federation, UP). MRP equals offer price on
 * every SKU there, so no strikethrough pricing is shown anywhere.
 */
export const PRODUCTS: Product[] = [
  // ── Milk ──────────────────────────────────────────────────────────────────
  {
    id: 'taaza-500ml',
    name: 'Toned Milk - PYAAS Taaza',
    variant: '500ml Pouch',
    category: 'milk',
    price: 29,
    unit: '500 ml',
    tag: '3% Fat · Toned',
    description:
      'Pasteurised toned milk from the PYAAS cooperative network, fortified with vitamins A and D. A light, dependable everyday milk for chai, coffee and the whole family.',
    image: IMG.taaza,
    subscribable: true,
  },
  {
    id: 'taaza-1l',
    name: 'Toned Milk - PYAAS Taaza',
    variant: '1L Pouch',
    category: 'milk',
    price: 57,
    unit: '1 L',
    tag: '3% Fat · Toned',
    description:
      'The family-size pouch of PYAAS Taaza pasteurised toned milk. Fortified with vitamins A and D, delivered fresh for your daily glass, chai and cooking.',
    image: IMG.taaza,
    subscribable: true,
  },
  {
    id: 'taaza-5l',
    name: 'Toned Milk - PYAAS Taaza',
    variant: '5L Bulk Pack',
    category: 'milk',
    price: 285,
    unit: '5 L',
    tag: '3% Fat · Toned · Bulk pack',
    description:
      'A 5 litre bulk pack of PYAAS Taaza toned milk for large households, tea stalls and kitchens that go through milk fast.',
    image: IMG.taaza,
    subscribable: true,
  },
  {
    id: 'gold-500ml',
    name: 'Full Cream Milk - PYAAS Gold',
    variant: '500ml Pouch',
    category: 'milk',
    price: 35,
    unit: '500 ml',
    tag: 'Full Cream',
    description:
      'PYAAS Gold pasteurised full cream milk, rich and creamy with a minimum of 6% fat. The indulgent choice for kheer, malai and a proper morning glass.',
    image: IMG.gold,
    subscribable: true,
  },
  {
    id: 'gold-1l',
    name: 'Full Cream Milk - PYAAS Gold',
    variant: '1L Pouch',
    category: 'milk',
    price: 69,
    unit: '1 L',
    tag: 'Full Cream',
    description:
      'The 1 litre pouch of PYAAS Gold full cream milk. Rich, creamy and satisfying, ideal for families that like their milk thick and their chai strong.',
    image: IMG.gold,
    subscribable: true,
  },
  // PYAAS Shakti · standardised milk (4.5% fat), between Taaza toned and Gold full
  // cream. Specs read off the pack; price indicative (founder to confirm).
  {
    id: 'shakti-500ml',
    name: 'Standardised Milk - PYAAS Shakti',
    variant: '500ml Pouch',
    category: 'milk',
    price: 32,
    unit: '500 ml',
    tag: '4.5% Fat · Standardised',
    description:
      'PYAAS Shakti pasteurised standardised milk, with a minimum 4.5% fat and 8.5% SNF. A richer everyday glass than toned milk, without the full weight of full cream.',
    image: IMG.shakti,
    subscribable: true,
    nutrition: 'Fat min 4.5%, SNF min 8.5% (per pack).',
  },
  {
    id: 'shakti-1l',
    name: 'Standardised Milk - PYAAS Shakti',
    variant: '1L Pouch',
    category: 'milk',
    price: 62,
    unit: '1 L',
    tag: '4.5% Fat · Standardised',
    description:
      'The 1 litre pouch of PYAAS Shakti standardised milk (min 4.5% fat, 8.5% SNF). A balanced, wholesome everyday milk for the whole family.',
    image: IMG.shakti,
    subscribable: true,
    nutrition: 'Fat min 4.5%, SNF min 8.5% (per pack).',
  },

  // ── Super Tea · milk made for chai ────────────────────────────────────────
  {
    id: 'chai-special-500ml',
    name: 'Chai Special - PYAAS',
    variant: '500ml Pouch',
    category: 'super_tea',
    price: 32,
    unit: '500 ml',
    tag: 'For tea · Standardised',
    description:
      'PYAAS Chai Special, a pasteurised homogenised standardised milk (min 4.5% fat, 8.6% SNF) made for tea. Homogenised so it will not split and gives your chai a full, creamy body.',
    image: IMG.chaiSpecial,
    subscribable: true,
    nutrition: 'Fat min 4.5%, SNF min 8.6% (per pack).',
  },

  // ── Dahi ──────────────────────────────────────────────────────────────────
  {
    id: 'dahi-sweet-90g',
    name: 'Sweet Dahi',
    variant: '90g Cup',
    category: 'dahi',
    price: 10,
    unit: '90 g',
    tag: 'Sweet',
    description:
      'A single-serve cup of sweetened dahi, set fresh from pasteurised milk. A ready dessert for lunchboxes and after meals.',
    image: IMG.dahiCup,
    subscribable: false,
  },
  {
    id: 'dahi-sweet-200g',
    name: 'Sweet Dahi',
    variant: '200g Cup',
    category: 'dahi',
    price: 24,
    unit: '200 g',
    tag: 'Sweet',
    description:
      'The bigger cup of sweet dahi, set fresh from pasteurised milk. Enough to share, or not.',
    image: IMG.dahiCup,
    subscribable: false,
  },
  {
    id: 'dahi-plain-90g',
    name: 'Plain Dahi',
    variant: '90g Pouch',
    category: 'dahi',
    price: 10,
    unit: '90 g',
    tag: 'Plain',
    description:
      'A small pouch of plain dahi made from pasteurised toned milk. Just right for one serving of raita or a quick bowl with lunch.',
    image: IMG.dahiPouch,
    subscribable: false,
  },
  {
    id: 'dahi-plain-200g',
    name: 'Plain Dahi',
    variant: '200g Pouch',
    category: 'dahi',
    price: 23,
    unit: '200 g',
    tag: 'Plain',
    description:
      'Plain dahi set from pasteurised toned milk. Thick enough for raita, kadhi and marinades, everyday enough to keep in the fridge.',
    image: IMG.dahiPouch,
    subscribable: false,
  },
  {
    id: 'dahi-plain-400g',
    name: 'Plain Dahi',
    variant: '400g Pouch',
    category: 'dahi',
    price: 35,
    unit: '400 g',
    tag: 'Plain',
    description:
      'The family pouch of plain dahi made from pasteurised toned milk. Covers raita, kadhi and a bowl for everyone at the table.',
    image: IMG.dahiPouch,
    subscribable: false,
  },
  {
    id: 'dahi-plain-5kg',
    name: 'Plain Dahi - Low Fat (Bucket)',
    variant: '5kg Bucket',
    category: 'dahi',
    price: 400,
    unit: '5 kg',
    tag: 'Low Fat · Bucket',
    description:
      'A 5 kg bucket of low fat plain dahi for functions, canteens and large families. Consistent set, kitchen-ready quantity.',
    image: IMG.dahiBucket,
    subscribable: false,
  },
  {
    id: 'dahi-plain-15kg',
    name: 'Plain Dahi - Low Fat (Bucket)',
    variant: '15kg Bucket',
    category: 'dahi',
    price: 1050,
    unit: '15 kg',
    tag: 'Low Fat · Bucket · Bulk',
    description:
      'The 15 kg catering bucket of low fat plain dahi. Built for halwais, hostels and events where dahi is measured in kilos, not cups.',
    image: IMG.dahiBucket,
    subscribable: false,
  },
  {
    id: 'dahi-pp-400g',
    name: 'Dahi PP',
    variant: '400g Poly Pack',
    category: 'dahi',
    price: 35,
    unit: '400 g',
    tag: 'Poly Pack',
    description:
      'Dahi in a convenient 400g poly pack. The same fresh set curd in a sturdier pack for the fridge shelf.',
    image: IMG.dahiPouch,
    subscribable: false,
  },

  // ── Paneer ────────────────────────────────────────────────────────────────
  {
    id: 'paneer-1kg',
    name: 'Paneer',
    variant: '1kg',
    category: 'paneer',
    price: 410,
    unit: '1 kg',
    tag: '',
    description:
      'A full kilo of fresh PYAAS paneer, soft with a clean milky taste. For the big family dinners, party trays and serious paneer lovers.',
    image: IMG.paneer,
    subscribable: false,
  },
  {
    id: 'paneer-vac-100g',
    name: 'Paneer (Vacuum Pack)',
    variant: '100g',
    category: 'paneer',
    price: 45,
    unit: '100 g',
    tag: 'Vacuum Pack',
    description:
      'Fresh paneer sealed in a 100g vacuum pack to hold its softness and shelf life. A single-dish portion with no leftovers.',
    image: IMG.paneer,
    subscribable: false,
  },
  {
    id: 'paneer-vac-200g',
    name: 'Paneer (Vacuum Pack)',
    variant: '200g',
    category: 'paneer',
    price: 90,
    unit: '200 g',
    tag: 'Vacuum Pack',
    description:
      'The 200g vacuum pack of fresh PYAAS paneer. Enough for a family-size matar paneer, sealed to stay soft till you cook.',
    image: IMG.paneer,
    subscribable: false,
  },

  // ── Ghee ──────────────────────────────────────────────────────────────────
  {
    id: 'ghee-poly-200ml',
    name: 'Ghee - Poly Pack',
    variant: '200ml',
    category: 'ghee',
    price: 130,
    unit: '200 ml',
    tag: 'Poly Pack',
    description:
      'Agmark-grade PYAAS ghee in a handy 200ml poly pack. Aromatic and granular, made from cooperative dairy cream.',
    image: IMG.ghee,
    subscribable: false,
  },
  {
    id: 'ghee-poly-500ml',
    name: 'Ghee - Poly Pack',
    variant: '500ml',
    category: 'ghee',
    price: 320,
    unit: '500 ml',
    tag: 'Poly Pack',
    description:
      'The 500ml poly pack of Agmark-grade PYAAS ghee. A kitchen staple for tadka, parathas and everything in between.',
    image: IMG.ghee,
    subscribable: false,
  },
  {
    id: 'ghee-poly-1l',
    name: 'Ghee - Poly Pack',
    variant: '1000ml',
    category: 'ghee',
    price: 630,
    unit: '1000 ml',
    tag: 'Poly Pack',
    description:
      'A full litre of Agmark-grade PYAAS ghee in a poly pack. The family-size pack for kitchens where ghee never sits idle.',
    image: IMG.ghee,
    subscribable: false,
  },
  {
    id: 'ghee-sika-500ml',
    name: 'Ghee - Sika Pack',
    variant: '500ml',
    category: 'ghee',
    price: 325,
    unit: '500 ml',
    tag: 'Sika Pack',
    description:
      'PYAAS ghee in the 500ml Sika pack. The same Agmark-grade ghee in a sturdier pack that stores and pours neatly.',
    image: IMG.ghee, // only one ghee reference photo available (poly pack art)
    subscribable: false,
  },
  {
    id: 'ghee-sika-1l',
    name: 'Ghee - Sika Pack',
    variant: '1000ml',
    category: 'ghee',
    price: 640,
    unit: '1000 ml',
    tag: 'Sika Pack',
    description:
      'The 1 litre Sika pack of Agmark-grade PYAAS ghee, for households that buy ghee the sensible way, in bulk.',
    image: IMG.ghee, // only one ghee reference photo available (poly pack art)
    subscribable: false,
  },

  // ── Butter ────────────────────────────────────────────────────────────────
  {
    id: 'butter-100g',
    name: 'Butter',
    variant: '100g',
    category: 'butter',
    price: 54,
    unit: '100 g',
    tag: '',
    description:
      'PYAAS Makkhan, pasteurised table butter made from fresh cream. For toast, parathas and pav that deserve better.',
    image: IMG.butter,
    subscribable: false,
  },
  {
    id: 'butter-500g',
    name: 'Butter',
    variant: '500g',
    category: 'butter',
    price: 260,
    unit: '500 g',
    tag: '',
    description:
      'The 500g family block of PYAAS pasteurised table butter. Keeps the whole house buttered through the week.',
    image: IMG.butter,
    subscribable: false,
  },

  // ── Chaach ────────────────────────────────────────────────────────────────
  {
    id: 'chaach-500ml',
    name: 'Chaach',
    variant: '500ml',
    category: 'chaach',
    price: 20,
    unit: '500 ml',
    tag: 'Buttermilk',
    description:
      'Traditional churned buttermilk, light and cooling. The working lunch companion across Uttar Pradesh.',
    image: IMG.chaach,
    subscribable: false,
  },

  // ── Flavoured Milk ────────────────────────────────────────────────────────
  {
    id: 'flavoured-milk-200ml',
    name: 'Flavoured Milk',
    variant: '200ml',
    category: 'flavoured_milk',
    price: 15,
    unit: '200 ml',
    tag: '',
    description:
      'Pasteurised flavoured milk in a chilled 200ml serve. A sweet, milky refresher for hot afternoons.',
    image: IMG.flavouredMilk,
    subscribable: false,
  },

  // ── Mattha ────────────────────────────────────────────────────────────────
  {
    id: 'mattha-200ml',
    name: 'Mattha',
    variant: '200ml',
    category: 'mattha',
    price: 13,
    unit: '200 ml',
    tag: '',
    description:
      'Plain mattha in a single 200ml serve. Salty, tangy and made for summer meals.',
    image: IMG.mattha,
    subscribable: false,
  },
  {
    id: 'masala-mattha-200ml',
    name: 'Masala Mattha',
    variant: '200ml',
    category: 'mattha',
    price: 15,
    unit: '200 ml',
    tag: 'Spiced',
    description:
      'PYAAS Masala Mattha, spiced buttermilk churned from fresh dahi with roasted cumin, coriander and a hint of green chilli. Cooling, tangy and perfect after a heavy meal.',
    image: IMG.masalaMattha,
    subscribable: false,
  },

  // ── Khoya (mawa) ──────────────────────────────────────────────────────────
  {
    id: 'khoya-250g',
    name: 'Khoya',
    variant: '250g',
    category: 'khoya',
    price: 120,
    unit: '250 g',
    tag: 'Mawa',
    description:
      'PYAAS Khoya (mawa), thickened milk solids made by slowly reducing pure milk. The base for pedas, gulab jamun, barfi and rich gravies. Price indicative, founder to confirm.',
    image: IMG.khoya,
    subscribable: false,
  },
  {
    id: 'khoya-500g',
    name: 'Khoya',
    variant: '500g',
    category: 'khoya',
    price: 235,
    unit: '500 g',
    tag: 'Mawa',
    description:
      'The 500g box of PYAAS Khoya (mawa), slow-reduced milk solids for festive sweets and cooking. Price indicative, founder to confirm.',
    image: IMG.khoya,
    subscribable: false,
  },
  {
    id: 'khoya-1kg',
    name: 'Khoya',
    variant: '1kg',
    category: 'khoya',
    price: 460,
    unit: '1 kg',
    tag: 'Mawa · Bulk',
    description:
      'A 1kg box of PYAAS Khoya (mawa) for halwais and large festive batches. Price indicative, founder to confirm.',
    image: IMG.khoya,
    subscribable: false,
  },

  // ── Lassi ─────────────────────────────────────────────────────────────────
  {
    id: 'lassi-200g',
    name: 'Lassi',
    variant: '200g',
    category: 'lassi',
    price: 20,
    unit: '200 g',
    tag: '',
    description:
      'Tasty sweet lassi in a 200g cup, churned from fresh dahi. Shake well, drink cold.',
    image: IMG.lassi,
    subscribable: false,
  },
  {
    id: 'lassi-160ml',
    name: 'Lassi',
    variant: '160ml Cup',
    category: 'lassi',
    price: 15,
    unit: '160 ml',
    tag: 'Single serve',
    description:
      'A handy 160ml single-serve cup of PYAAS sweet lassi, churned from fresh dahi. Chill and enjoy on the go.',
    image: IMG.lassiCup,
    subscribable: false,
  },

  // ── Sweets ────────────────────────────────────────────────────────────────
  {
    id: 'ladoo-besan-250g',
    name: 'Besan Ladoo',
    variant: '250g',
    category: 'sweets',
    price: 125,
    unit: '250 g',
    tag: '',
    description:
      'Classic besan ladoos made with ghee, roasted slow the traditional way. A 250g box for festivals or no reason at all.',
    image: IMG.besanLadoo,
    subscribable: false,
  },
  {
    id: 'kheer-chhena-100g',
    name: 'Chhena Kheer',
    variant: '100g',
    category: 'sweets',
    price: 30,
    unit: '100 g',
    tag: '',
    description:
      'Soft chhena simmered in sweetened milk. A single-serve cup of an old-school dairy dessert.',
    image: IMG.chhenaKheer,
    subscribable: false,
  },
  {
    id: 'peda-250g',
    name: 'Peda',
    variant: '250g',
    category: 'sweets',
    price: 125,
    unit: '250 g',
    tag: '',
    description:
      'Milky, cardamom-scented pedas made from khoya. A 250g box of the classic temple-town sweet.',
    image: IMG.peda,
    subscribable: false,
  },
  {
    id: 'milk-cake-250g',
    name: 'Milk Cake',
    variant: '250g',
    category: 'sweets',
    price: 125,
    unit: '250 g',
    tag: '',
    description:
      'Grainy, caramelised milk cake made by slow-cooking fresh milk. 250g of the good dense stuff.',
    image: IMG.milkCake,
    subscribable: false,
  },
  {
    id: 'rasgolla-200g',
    name: 'Rasgolla',
    variant: '200g',
    category: 'sweets',
    price: 64,
    unit: '200 g',
    tag: '',
    description:
      'Spongy chhena rasgollas in light sugar syrup. A 200g tin for a small celebration.',
    image: IMG.rasgolla,
    subscribable: false,
  },
  {
    id: 'rasgolla-500g',
    name: 'Rasgolla',
    variant: '500g',
    category: 'sweets',
    price: 160,
    unit: '500 g',
    tag: '',
    description:
      'The 500g tin of spongy chhena rasgollas in syrup. For households where one tin never survives the evening.',
    image: IMG.rasgolla,
    subscribable: false,
  },
  {
    id: 'gulab-jamun-200g',
    name: 'Gulab Jamun',
    variant: '200g',
    category: 'sweets',
    price: 80,
    unit: '200 g',
    tag: '',
    description:
      'Soft khoya gulab jamuns soaked in warm sugar syrup. A 200g pack for dessert tonight.',
    image: IMG.gulabJamun,
    subscribable: false,
  },
  {
    id: 'gulab-jamun-500g',
    name: 'Gulab Jamun',
    variant: '500g',
    category: 'sweets',
    price: 200,
    unit: '500 g',
    tag: '',
    description:
      'The 500g pack of khoya gulab jamuns in syrup. Enough for guests, barely enough for family.',
    image: IMG.gulabJamun,
    subscribable: false,
  },
  {
    id: 'rice-kheer-100ml',
    name: 'Rice Kheer',
    variant: '100ml',
    category: 'sweets',
    price: 20,
    unit: '100 ml',
    tag: '',
    description:
      'Slow-cooked rice kheer in a single 100ml serve. Creamy, gently sweet, ready to eat.',
    image: IMG.riceKheer,
    subscribable: false,
  },
  {
    id: 'shree-khand-100g',
    name: 'Shri Khand',
    variant: '100g',
    category: 'sweets',
    price: 25,
    unit: '100 g',
    tag: '',
    description:
      'Thick, strained-curd shrikhand with cardamom and saffron notes. A 100g cup of the festive classic.',
    image: IMG.shriKhand,
    subscribable: false,
  },

  // ── PYAAS partner range · listed ahead of launch (outOfStock) ─────────────
  // Prices mirror PYAAS's founding prices (pyaasdairy.in). Deliberately LAST in
  // the catalog so the pair fills the trailing grid row on the home feed.
  {
    id: 'pyaas-a2-1l',
    name: 'A2 Cow Milk - PYAAS',
    variant: '1L Carton',
    category: 'milk',
    price: 139,
    mrp: 169,
    unit: '1 L',
    tag: 'A2 Beta-Casein · 3% Fat · 8.5% SNF',
    description:
      'Single-origin A2 cow milk from desi cows, gently pasteurised and sealed in a carton. Naturally easy to digest, with the full, creamy taste of real milk. Marketed & manufactured by PYAAS.',
    image: IMG.pyaasA2Carton,
    subscribable: true,
    outOfStock: true,
    manufacturer: 'PYAAS (Pyaas Dairy)',
    manufacturerAddress: 'Pyaas Dairy, Lucknow, Uttar Pradesh (full address declared at launch)',
    fssaiLicense: 'Declared at launch',
  },
  {
    id: 'pyaas-a2-pouch',
    name: 'A2 Cow Milk - PYAAS',
    variant: '500ml Pouch',
    category: 'milk',
    price: 69,
    unit: '500 ml',
    tag: 'A2 Beta-Casein · Daily fresh',
    description:
      'Everyday A2 cow milk in a fresh daily pouch - the format your milkman delivers, in plant-based packaging. Marketed & manufactured by PYAAS.',
    image: IMG.pyaasA2Pouch,
    subscribable: true,
    outOfStock: true,
    manufacturer: 'PYAAS (Pyaas Dairy)',
    manufacturerAddress: 'Pyaas Dairy, Lucknow, Uttar Pradesh (full address declared at launch)',
    fssaiLicense: 'Declared at launch',
  },
  {
    id: 'pyaas-toned-1l',
    name: 'Toned Milk - PYAAS',
    variant: '1L Carton',
    category: 'milk',
    price: 66,
    mrp: 79,
    unit: '1 L',
    tag: 'Toned · 3% Fat · 8.5% SNF',
    description:
      'Everyday toned milk, gently pasteurised and homogenised, sealed in a carton for a longer, fresher shelf. Light and dependable for chai, coffee and the whole family. Marketed & manufactured by PYAAS.',
    image: IMG.pyaasTonedCarton,
    subscribable: true,
    outOfStock: true,
    manufacturer: 'PYAAS (Pyaas Dairy)',
    manufacturerAddress: 'Pyaas Dairy, Lucknow, Uttar Pradesh (full address declared at launch)',
    fssaiLicense: 'Declared at launch',
  },
  {
    id: 'pyaas-toned-pouch',
    name: 'Toned Milk - PYAAS',
    variant: '500ml Pouch',
    category: 'milk',
    price: 34,
    unit: '500 ml',
    tag: 'Toned · Daily fresh',
    description:
      'Fresh daily toned milk in a plant-based pouch - the format your milkman delivers, with traceability built in. Marketed & manufactured by PYAAS.',
    image: IMG.pyaasTonedPouch,
    subscribable: true,
    outOfStock: true,
    manufacturer: 'PYAAS (Pyaas Dairy)',
    manufacturerAddress: 'Pyaas Dairy, Lucknow, Uttar Pradesh (full address declared at launch)',
    fssaiLicense: 'Declared at launch',
  },
];

// NOTE: a "Super Tea" tab exists in paragdairy.com's navigation but no
// product or price was visible in the source screenshots, so it is omitted
// here rather than inventing a SKU. A khoya pack shot exists in the brand
// assets but has no price data either, so khoya is not listed.
export const CATEGORIES: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'milk', label: 'Milk' },
  { key: 'dahi', label: 'Dahi' },
  { key: 'paneer', label: 'Paneer' },
  { key: 'ghee', label: 'Ghee' },
  { key: 'butter', label: 'Butter' },
  { key: 'chaach', label: 'Chaach' },
  { key: 'flavoured_milk', label: 'Flavoured Milk' },
  { key: 'mattha', label: 'Mattha' },
  { key: 'lassi', label: 'Lassi' },
  { key: 'khoya', label: 'Khoya' },
  { key: 'super_tea', label: 'Super Tea' },
  { key: 'sweets', label: 'Sweets' },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function discountPct(p: Product): number | null {
  if (!p.mrp || p.mrp <= p.price) return null;
  return Math.round((1 - p.price / p.mrp) * 100);
}

// ── Seeded social proof: ratings, "most ordered" flags, bulk pack markers ────
// PYAAS has no reviews backend yet, so these are author-seeded demo values.
// Swap for real aggregates once the backend serves them. Every field is
// optional, so an un-seeded SKU simply renders nothing.
type ProductMeta = { rating: number; ratingCount: number; mostOrdered?: boolean; packCount?: number };

const META: Record<string, ProductMeta> = {
  'taaza-500ml': { rating: 4.7, ratingCount: 2140, mostOrdered: true },
  'taaza-1l': { rating: 4.8, ratingCount: 3860, mostOrdered: true },
  'taaza-5l': { rating: 4.5, ratingCount: 412, packCount: 3 },
  'gold-500ml': { rating: 4.6, ratingCount: 1580, mostOrdered: true },
  'gold-1l': { rating: 4.8, ratingCount: 2670, mostOrdered: true },
  'shakti-500ml': { rating: 4.4, ratingCount: 690 },
  'shakti-1l': { rating: 4.5, ratingCount: 980 },
  'chai-special-500ml': { rating: 4.5, ratingCount: 540 },
  'dahi-sweet-90g': { rating: 4.6, ratingCount: 760 },
  'dahi-sweet-200g': { rating: 4.6, ratingCount: 1120, mostOrdered: true },
  'dahi-plain-90g': { rating: 4.3, ratingCount: 480 },
  'dahi-plain-200g': { rating: 4.5, ratingCount: 1740, mostOrdered: true },
  'dahi-plain-400g': { rating: 4.5, ratingCount: 910 },
  'dahi-plain-5kg': { rating: 4.4, ratingCount: 168, packCount: 2 },
  'dahi-plain-15kg': { rating: 4.3, ratingCount: 74, packCount: 3 },
  'dahi-pp-400g': { rating: 4.4, ratingCount: 620 },
  'paneer-1kg': { rating: 4.7, ratingCount: 540, packCount: 2 },
  'paneer-vac-100g': { rating: 4.6, ratingCount: 880 },
  'paneer-vac-200g': { rating: 4.7, ratingCount: 1460, mostOrdered: true },
  'ghee-poly-200ml': { rating: 4.7, ratingCount: 730 },
  'ghee-poly-500ml': { rating: 4.8, ratingCount: 1980, mostOrdered: true },
  'ghee-poly-1l': { rating: 4.8, ratingCount: 1240 },
  'ghee-sika-500ml': { rating: 4.6, ratingCount: 410 },
  'ghee-sika-1l': { rating: 4.7, ratingCount: 360 },
  'butter-100g': { rating: 4.5, ratingCount: 690 },
  'butter-500g': { rating: 4.6, ratingCount: 520 },
  'chaach-500ml': { rating: 4.4, ratingCount: 1180, mostOrdered: true },
  'flavoured-milk-200ml': { rating: 4.5, ratingCount: 960 },
  'mattha-200ml': { rating: 4.3, ratingCount: 430 },
  'masala-mattha-200ml': { rating: 4.4, ratingCount: 380 },
  'khoya-250g': { rating: 4.5, ratingCount: 240 },
  'khoya-500g': { rating: 4.5, ratingCount: 190 },
  'khoya-1kg': { rating: 4.5, ratingCount: 96, packCount: 2 },
  'lassi-200g': { rating: 4.6, ratingCount: 1040, mostOrdered: true },
  'lassi-160ml': { rating: 4.5, ratingCount: 720 },
  'ladoo-besan-250g': { rating: 4.6, ratingCount: 360 },
  'kheer-chhena-100g': { rating: 4.5, ratingCount: 280 },
  'peda-250g': { rating: 4.7, ratingCount: 410 },
  'milk-cake-250g': { rating: 4.6, ratingCount: 330 },
  'rasgolla-200g': { rating: 4.6, ratingCount: 520 },
  'rasgolla-500g': { rating: 4.6, ratingCount: 300 },
  'gulab-jamun-200g': { rating: 4.7, ratingCount: 640 },
  'gulab-jamun-500g': { rating: 4.7, ratingCount: 380 },
  'rice-kheer-100ml': { rating: 4.5, ratingCount: 260 },
  'shree-khand-100g': { rating: 4.6, ratingCount: 340 },
};

// Apply the seed onto the catalog (mutates the shared Product objects at load).
for (const p of PRODUCTS) {
  const m = META[p.id];
  if (m) { p.rating = m.rating; p.ratingCount = m.ratingCount; p.mostOrdered = m.mostOrdered; p.packCount = m.packCount; }
}

export type Review = { id: string; author: string; stars: number; text: string; date: string; verified?: boolean };

// Seeded written reviews for the popular SKUs. getReviews() returns [] otherwise.
const REVIEWS: Record<string, Review[]> = {
  'taaza-1l': [
    { id: 'r1', author: 'Anjali S.', stars: 5, text: 'Fresh every morning, delivered before 7. My chai finally tastes like home.', date: '18 Jun 2026', verified: true },
    { id: 'r2', author: 'Rahul M.', stars: 5, text: 'Consistent quality, never once spoiled. Kids drink it plain.', date: '9 Jun 2026', verified: true },
    { id: 'r3', author: 'Deepa K.', stars: 4, text: 'Good milk and honest pricing. Would love a 2L pouch option.', date: '2 Jun 2026' },
  ],
  'gold-1l': [
    { id: 'r1', author: 'Vikram T.', stars: 5, text: 'Rich and creamy, the malai is thick. Perfect for kheer.', date: '20 Jun 2026', verified: true },
    { id: 'r2', author: 'Sneha P.', stars: 5, text: 'Full cream done right. Switched the whole family to Gold.', date: '11 Jun 2026', verified: true },
  ],
  'dahi-plain-200g': [
    { id: 'r1', author: 'Meena R.', stars: 5, text: 'Sets thick and never sour. Tastes like ghar ka dahi.', date: '15 Jun 2026', verified: true },
    { id: 'r2', author: 'Arjun N.', stars: 4, text: 'Fresh and clean taste. Cup could be a little bigger.', date: '7 Jun 2026' },
  ],
  'paneer-vac-200g': [
    { id: 'r1', author: 'Priya D.', stars: 5, text: 'Soft, fresh paneer that does not crumble in curry. Vacuum pack keeps well.', date: '21 Jun 2026', verified: true },
    { id: 'r2', author: 'Karan V.', stars: 5, text: 'Better than the local shop, and cheaper. Reordering weekly now.', date: '13 Jun 2026', verified: true },
  ],
  'ghee-poly-500ml': [
    { id: 'r1', author: 'Sunita J.', stars: 5, text: 'Aroma fills the kitchen. Pure desi ghee, granular and fragrant.', date: '19 Jun 2026', verified: true },
    { id: 'r2', author: 'Manoj B.', stars: 5, text: 'One spoon in dal and it is restaurant level. Will reorder.', date: '5 Jun 2026', verified: true },
  ],
  'chaach-500ml': [
    { id: 'r1', author: 'Farah A.', stars: 4, text: 'Light, well spiced and refreshing after lunch. Not too salty.', date: '16 Jun 2026', verified: true },
  ],
};

export function getReviews(id: string): Review[] {
  return REVIEWS[id] ?? [];
}

/** Bestseller SKUs (for the "Most ordered" home shelf), in catalog order. */
export function mostOrderedProducts(): Product[] {
  return PRODUCTS.filter((p) => p.mostOrdered);
}
