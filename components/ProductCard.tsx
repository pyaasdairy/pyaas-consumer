import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, rupee, shadow, spacing, tabular } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap, Pill } from './ui';
import { discountPct, type Product } from '../constants/products';

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const router = useRouter();
  const pct = discountPct(product);
  // "Add" no longer drops to a cart · it opens the product's subscription screen
  // (Daily / Alternate / One-Time + start date).
  const open = () => router.push(`/product/${product.id}`);

  return (
    <Animated.View entering={FadeInDown.delay(index * 55).duration(420)} style={{ flex: 1 }}>
      <Tap
        haptic={false}
        onPress={open}
        style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, ...shadow.soft }}
      >
        <View style={{ backgroundColor: colors.wash, borderRadius: radius.md, height: 140, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image source={product.image} style={{ width: '78%', height: '88%' }} contentFit="contain" transition={200} />
          {pct ? <Pill label={`${pct}% OFF`} bg={colors.sage} color={colors.white} style={{ position: 'absolute', top: 8, left: 8 }} /> : null}
        </View>

        <View style={{ paddingHorizontal: 4, paddingTop: 10 }}>
          <Serif style={{ fontSize: 17 }} numberOfLines={1}>{product.name}</Serif>
          <TextBody style={{ fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>{product.variant}</TextBody>

          {/* Price on its own line · the struck MRP can never collide with the button */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <Serif style={{ fontSize: 18, ...tabular }} color={colors.ink} numberOfLines={1}>{rupee(product.price)}</Serif>
            {product.mrp ? <TextBody style={{ fontSize: 12, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute} numberOfLines={1}>{rupee(product.mrp)}</TextBody> : null}
          </View>

          {/* Full-width "Add" button below the price → opens subscription setup */}
          <Tap
            onPress={open}
            scaleTo={0.95}
            style={{ marginTop: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.roseDeep, ...shadow.soft }}
          >
            <TextSemi color={colors.roseDeep} style={{ fontSize: 14, letterSpacing: 0.5 }}>ADD</TextSemi>
          </Tap>
        </View>
      </Tap>
    </Animated.View>
  );
}
