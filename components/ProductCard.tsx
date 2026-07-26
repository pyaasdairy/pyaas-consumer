import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, rupee, shadow, spacing, tabular } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap, Pill } from './ui';
import { Stars } from './Stars';
import { StackedProductImage } from './StackedProductImage';
import { haptics } from '../lib/haptics';
import { useFavorites } from '../store/favorites';
import { captureRestockLead } from '../lib/leads';
import { discountPct, type Product } from '../constants/products';

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const router = useRouter();
  const pct = discountPct(product);
  const isFav = useFavorites((s) => s.ids.includes(product.id));
  const toggleFav = useFavorites((s) => s.toggle);
  // "Add" no longer drops to a cart · it opens the product's subscription screen
  // (Daily / Alternate / One-Time + start date).
  const open = () => router.push(`/product/${product.id}`);

  return (
    <View style={{ flex: 1 }}>
      <Tap
        haptic={false}
        onPress={open}
        style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, ...shadow.soft }}
      >
        <View style={{ backgroundColor: colors.wash, borderRadius: radius.md, height: 140, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {product.image ? (
            product.packCount && product.packCount >= 2 ? (
              <StackedProductImage source={product.image} count={product.packCount} />
            ) : (
              <Image source={product.image} style={{ width: '78%', height: '88%' }} contentFit="contain" transition={200} />
            )
          ) : (
            <View style={{ paddingHorizontal: 10, alignItems: 'center' }}>
              <TextSemi numberOfLines={2} style={{ textAlign: 'center', fontSize: 14 }} color={colors.flameDeep}>{product.name}</TextSemi>
            </View>
          )}
          {/* Top-left badge · boxed to stop short of the heart button (right: 44 =
              32px heart + 6px inset + 6px gap) so a long label can never overlap it. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 44, flexDirection: 'row' }}>
            {product.outOfStock ? (
              <Pill small label="OUT OF STOCK" bg={colors.ink} color={colors.white} />
            ) : product.mostOrdered ? (
              <Pill small label="MOST ORDERED" bg={colors.flameDeep} color={colors.white} />
            ) : pct ? (
              <Pill small label={`${pct}% OFF`} bg={colors.blue} color={colors.white} />
            ) : null}
          </View>
          {product.packCount && product.packCount >= 2 ? (
            <Pill small label="BULK" bg={colors.ink} color={colors.white} style={{ position: 'absolute', bottom: 8, left: 8 }} />
          ) : null}
          <Tap
            haptic={false}
            onPress={() => {
              haptics.press();
              const adding = !isFav;
              toggleFav(product.id);
              // Hearting an out-of-stock SKU = a restock request: the member's
              // data lands on the backend right there (fire-and-forget).
              if (adding && product.outOfStock) void captureRestockLead(product);
            }}
            style={{ position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={17} color={isFav ? colors.flameDeep : colors.inkMute} />
          </Tap>
        </View>

        <View style={{ paddingHorizontal: 4, paddingTop: 10 }}>
          <Serif style={{ fontSize: 17 }} numberOfLines={1}>{product.name}</Serif>
          <TextBody style={{ fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>{product.variant}</TextBody>
          {product.rating ? (
            <View style={{ marginTop: 5 }}>
              <Stars rating={product.rating} count={product.ratingCount} size={11} />
            </View>
          ) : null}

          {/* Price on its own line · the struck MRP can never collide with the button */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <Serif style={{ fontSize: 18, ...tabular }} color={colors.ink} numberOfLines={1}>{rupee(product.price)}</Serif>
            {product.mrp ? <TextBody style={{ fontSize: 12, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute} numberOfLines={1}>{rupee(product.mrp)}</TextBody> : null}
          </View>

          {/* Full-width "Add" button below the price → opens subscription setup.
              Out-of-stock SKUs render a muted, non-pressable stand-in instead. */}
          {product.outOfStock ? (
            <View style={{ marginTop: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.wash, borderWidth: 1.5, borderColor: colors.line }}>
              <TextSemi color={colors.inkMute} style={{ fontSize: 13, letterSpacing: 0.5 }}>OUT OF STOCK</TextSemi>
            </View>
          ) : (
            <Tap
              onPress={open}
              scaleTo={0.95}
              style={{ marginTop: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.flameDeep, ...shadow.soft }}
            >
              <TextSemi color={colors.flameDeep} style={{ fontSize: 14, letterSpacing: 0.5 }}>ADD</TextSemi>
            </Tap>
          )}
        </View>
      </Tap>
    </View>
  );
}
