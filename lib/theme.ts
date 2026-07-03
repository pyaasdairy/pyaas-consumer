/**
 * PYAAS brand theme. Mirrors the website's CSS design tokens so the app and the
 * web experience feel like one brand.
 */
export const colors = {
  milk: '#FFFFFF',        // app background - pure white (Blinkit-style)
  cream: '#FFF1F8',       // faint pink surface (section headers, soft chips)
  wash: '#FBF0F6',        // faint pink fill for image tiles / steppers on white cards
  // PYAAS pink (#F36CB5) and its tints
  roseSoft: '#FBC9E6',
  rose: '#F491CC',
  roseDeep: '#F36CB5',
  // deeper berry-pink - secondary accent (was green "sage"; repointed so the
  // whole app drops green for the pink/white/gold identity)
  sage: '#D63C95',
  sageSoft: 'rgba(214,60,149,0.12)',
  // premium GOLD - reserved for VIP / membership only
  gold: '#C9A24B',
  goldDeep: '#A87E2E',
  goldSoft: '#F6ECD2',
  ink: '#2E2329',
  inkSoft: '#5E5057',
  inkMute: '#9A8C92',
  inkDeep: '#2A1018',
  line: '#ECE2DC',
  white: '#FFFFFF',
  // semantic
  success: '#D63C95',
  danger: '#E04B6E',
  overlay: 'rgba(42,16,24,0.45)',
  // premium token aliases (intent-named)
  action: '#F36CB5',   // primary CTAs (== roseDeep)
  onAction: '#FFFFFF', // text/icons on a primary CTA
  vip: '#C9A24B',      // gold, reserved for membership only
};

// Premium type identity, loaded at runtime in app/_layout.tsx (no native build):
// Bricolage Grotesque = display / headings / hero prices, Hanken Grotesk = body
// + UI. The family name carries the weight, so the typography components do NOT
// set fontWeight (which would faux-bold on iOS or be ignored on Android).
export const fonts = {
  serif: 'BricolageGrotesque_700Bold',
  serifSemi: 'BricolageGrotesque_600SemiBold',
  serifBlack: 'BricolageGrotesque_800ExtraBold',
  sans: 'HankenGrotesk_400Regular',
  sansMed: 'HankenGrotesk_500Medium',
  sansSemi: 'HankenGrotesk_600SemiBold',
  sansBold: 'HankenGrotesk_700Bold',
};

export const weights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  xxl: 44,
};

// Three-step elevation. Each level sets BOTH the iOS shadow and Android
// elevation (brand-ink tint) so cards never render flat on Android. `card`/`soft`
// are kept as aliases so existing call sites (...shadow.card) keep working.
const e1 = { shadowColor: '#7A4650', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
const e2 = { shadowColor: '#7A4650', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 };
const e3 = { shadowColor: '#7A4650', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 12 };
export const shadow = { e1, e2, e3, card: e2, soft: e1 };

// Modular type scale (1.2 ratio, line-heights snapped to a 4pt rhythm). Prices
// use Bricolage ExtraBold with tabular figures so digits/columns align.
export const type = {
  display: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.serifSemi, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  title: { fontFamily: fonts.sansSemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.sansMed, fontSize: 13, lineHeight: 16 },
  micro: { fontFamily: fonts.sansSemi, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.3 },
  priceHero: { fontFamily: fonts.serifBlack, fontSize: 34, letterSpacing: -0.5, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  price: { fontFamily: fonts.sansSemi, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
} as const;

/** Tabular figures: use on any number that sits in a column or ticks/changes. */
export const tabular = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

/** Format paise-free rupee amounts the Indian way (e.g. 1,099). */
export function rupee(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
