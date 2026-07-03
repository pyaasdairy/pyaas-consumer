import type { ImageSourcePropType } from 'react-native';

export type Category = 'milk' | 'ghee';

export type Product = {
  id: string;
  name: string;
  variant: string; // e.g. "1L Carton"
  category: Category;
  line: 'a2' | 'toned' | 'ghee';
  price: number;
  mrp?: number;
  unit: string; // e.g. "1 L"
  tag: string; // short descriptor
  description: string;
  image: ImageSourcePropType;
  subscribable: boolean; // milk can be set up as a daily subscription
};

/**
 * Product catalog. Prices mirror the website's founding prices. Images are the
 * same shots used on pyaasdairy.in, bundled into the app.
 */
export const PRODUCTS: Product[] = [
  {
    id: 'a2-1l',
    name: 'A2 Cow Milk',
    variant: '1L Carton',
    category: 'milk',
    line: 'a2',
    price: 139,
    mrp: 169,
    unit: '1 L',
    tag: 'A2 Beta-Casein · 3.5% Fat',
    description:
      'Single-origin A2 cow milk from desi cows, gently pasteurised and sealed in a carton. Naturally easy to digest, with the full, creamy taste of real milk.',
    image: require('../assets/products/a2-1l.png'),
    subscribable: true,
  },
  {
    id: 'a2-500ml',
    name: 'A2 Cow Milk',
    variant: '500ml Carton',
    category: 'milk',
    line: 'a2',
    price: 75,
    mrp: 89,
    unit: '500 ml',
    tag: 'A2 Beta-Casein · 3.5% Fat',
    description:
      'The same single-origin A2 cow milk in a handy 500ml carton. Perfect for smaller households and first-time tasters.',
    image: require('../assets/products/a2-500ml.png'),
    subscribable: true,
  },
  {
    id: 'a2-pouch',
    name: 'A2 Cow Milk',
    variant: '500ml Pouch',
    category: 'milk',
    line: 'a2',
    price: 69,
    unit: '500 ml',
    tag: 'A2 Beta-Casein · Daily fresh',
    description:
      'Everyday A2 cow milk in a fresh daily pouch. The format your milkman delivers, with traceability built in.',
    image: require('../assets/products/a2-pouch.png'),
    subscribable: true,
  },
  {
    id: 'toned-1l',
    name: 'Toned Milk',
    variant: '1L Carton',
    category: 'milk',
    line: 'toned',
    price: 89,
    mrp: 119,
    unit: '1 L',
    tag: '3% Fat · Light & fresh',
    description:
      'Wholesome toned milk, standardised for a lighter everyday glass. Great for chai, coffee and growing families.',
    image: require('../assets/products/toned-1l.png'),
    subscribable: true,
  },
  {
    id: 'toned-500ml',
    name: 'Toned Milk',
    variant: '500ml Carton',
    category: 'milk',
    line: 'toned',
    price: 49,
    mrp: 65,
    unit: '500 ml',
    tag: '3% Fat · Light & fresh',
    description:
      'Toned milk in a 500ml carton, sealed fresh. The lighter choice for your daily routine.',
    image: require('../assets/products/toned-500ml.png'),
    subscribable: true,
  },
  {
    id: 'toned-pouch',
    name: 'Toned Milk',
    variant: '500ml Pouch',
    category: 'milk',
    line: 'toned',
    price: 44,
    unit: '500 ml',
    tag: '3% Fat · Daily fresh',
    description:
      'Daily-fresh toned milk pouch, delivered to your door. Honest milk at an honest price.',
    image: require('../assets/products/toned-pouch.png'),
    subscribable: true,
  },
  {
    id: 'ghee',
    name: 'A2 Bilona Ghee',
    variant: '500ml Jar',
    category: 'ghee',
    line: 'ghee',
    price: 1099,
    mrp: 1499,
    unit: '500 ml',
    tag: 'Hand-churned · Vedic bilona',
    description:
      'Golden A2 ghee, hand-churned the traditional bilona way from cultured curd. Nutty, aromatic, and made in small batches.',
    image: require('../assets/products/ghee.png'),
    subscribable: false,
  },
];

export const CATEGORIES: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'milk', label: 'Milk' },
  { key: 'ghee', label: 'Ghee' },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function discountPct(p: Product): number | null {
  if (!p.mrp || p.mrp <= p.price) return null;
  return Math.round((1 - p.price / p.mrp) * 100);
}

/** Buy-more bundles (packets & bottles). Price comes from lib/pricing bundle logic. */
export type Bundle = { id: string; title: string; subtitle: string; productId: string; qty: number };
export const BUNDLES: Bundle[] = [
  { id: 'b-ghee', title: 'Ghee · Pack of 4', subtitle: 'A2 Bilona Ghee', productId: 'ghee', qty: 4 },
  { id: 'b-a2pouch', title: 'A2 Milk · Pack of 4', subtitle: '500ml pouches', productId: 'a2-pouch', qty: 4 },
  { id: 'b-a2carton', title: 'A2 1L · Pack of 4', subtitle: '1L cartons', productId: 'a2-1l', qty: 4 },
  { id: 'b-toned', title: 'Toned · Pack of 4', subtitle: '500ml pouches', productId: 'toned-pouch', qty: 4 },
];
