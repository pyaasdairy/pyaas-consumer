import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow, rupee, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from './ui';
import { getProduct, type Bundle } from '../constants/products';
import { bundleUnitPrice } from '../lib/pricing';

/** Bundle tile: 4 product images stacked (each slightly revealed) at a pack price. */
export function BundleCard({ bundle }: { bundle: Bundle }) {
  const router = useRouter();
  const p = getProduct(bundle.productId);
  const open = () => router.push(`/product/${bundle.productId}`);
  if (!p) return null;

  const unit = bundleUnitPrice(bundle.productId, bundle.qty) || p.price;
  const price = unit * bundle.qty;
  const mrp = p.price * bundle.qty;
  const save = mrp - price;
  const pct = Math.round((save / mrp) * 100);

  return (
    <Tap haptic={false} onPress={open} style={{ width: 200, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, ...shadow.soft }}>
      {/* Stacked images */}
      <View style={{ height: 132, backgroundColor: colors.wash, borderRadius: radius.md, overflow: 'hidden' }}>
        {pct > 0 ? <Pill label={`${pct}% OFF`} bg={colors.roseDeep} color={colors.white} style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }} /> : null}
        {[0, 1, 2, 3].map((i) => (
          <Image
            key={i}
            source={p.image}
            contentFit="contain"
            style={{
              position: 'absolute',
              top: 14,
              left: 10 + i * 30,
              width: 96,
              height: 104,
              transform: [{ rotate: `${(i - 1.5) * 4}deg` }],
              // nearer items brighter; farther items slightly dimmed for depth
              opacity: 1 - (3 - i) * 0.06,
            }}
          />
        ))}
        <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(46,35,41,0.78)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
          <TextSemi color={colors.white} style={{ fontSize: 11, ...tabular }}>×{bundle.qty}</TextSemi>
        </View>
      </View>

      <View style={{ paddingHorizontal: 4, paddingTop: 10 }}>
        <TextSemi style={{ fontSize: 14.5 }} numberOfLines={1}>{bundle.title}</TextSemi>
        <TextBody style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>{bundle.subtitle}</TextBody>
        {/* Price + savings on their own lines · then a full-width ADD button below */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
          <Serif style={{ fontSize: 18, ...tabular }} numberOfLines={1}>{rupee(price)}</Serif>
          <TextBody style={{ fontSize: 11.5, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute} numberOfLines={1}>{rupee(mrp)}</TextBody>
        </View>
        <TextMed color={colors.sage} style={{ fontSize: 11.5, marginTop: 2, ...tabular }} numberOfLines={1}>Save {rupee(save)}</TextMed>
        <Tap
          onPress={open}
          scaleTo={0.95}
          style={{ marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.roseDeep, paddingVertical: 9, ...shadow.soft }}
        >
          <TextSemi color={colors.roseDeep} style={{ fontSize: 13.5, letterSpacing: 0.5 }}>ADD</TextSemi>
        </Tap>
      </View>
    </Tap>
  );
}
