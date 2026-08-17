import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, rupee, shadow, spacing, tabular } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap, Pill } from './ui';
import { Stars } from './Stars';
import { StackedProductImage } from './StackedProductImage';
import { VariantSelector } from './VariantSelector';
import { haptics } from '../lib/haptics';
import { useFavorites } from '../store/favorites';
import { useCart, activeLane } from '../store/cart';
import { useDeliveryMode } from '../lib/deliveryMode';
import { defaultVariant } from '../lib/catalog';
import { discountPct, type Product } from '../constants/products';

/**
 * PRODUCT CARD — one card per base, with an inline size selector.
 *
 * `product` is the representative (base) SKU; `variants` (when passed) are its
 * sibling sizes. The card holds the SELECTED variant in local state and drives
 * price / image / stock badge / favourites / add-to-cart from it — picking a
 * size never reloads, it just re-reads already-loaded data. Passing no
 * `variants` (or one) renders a plain single-SKU card, so existing callers keep
 * working unchanged.
 *
 * Cart + favourites key by the SELECTED variantId, so 500 ml and 1 L are always
 * separate lines. A base card renders as long as ANY variant exists; if the
 * chosen variant is out of stock the Add controls grey out.
 */
export function ProductCard({ product, variants, index = 0, ctaLabel = 'ADD', browseOnly = false }: { product: Product; variants?: Product[]; index?: number; ctaLabel?: string; browseOnly?: boolean }) {
  const router = useRouter();
  const vs = variants && variants.length > 0 ? variants : [product];
  // Open on the first in-stock size (falls back to the first variant).
  const [selectedId, setSelectedId] = useState<string>(() => defaultVariant(vs).id);
  const selected = vs.find((v) => v.id === selectedId) ?? vs[0];

  const pct = discountPct(selected);
  const isFav = useFavorites((s) => s.ids.includes(selected.id));
  const toggleFav = useFavorites((s) => s.toggle);
  const addToCart = useCart((s) => s.add);
  // Bag badge counts the ACTIVE lane's cart only — the instant and morning
  // carts are separate; re-renders on mode switch via useDeliveryMode.
  useDeliveryMode();
  const inCart = useCart((s) => s.lines.find((l) => l.id === selected.id && l.lane === activeLane())?.qty ?? 0);
  // Tapping the card opens the SELECTED variant's screen (Daily / Alternate /
  // One-Time). The bag button drops the SELECTED variant straight into the cart.
  const open = () => router.push(`/product/${selected.id}`);
  const drop = () => {
    if (selected.outOfStock) return;
    haptics.press();
    addToCart(selected, 1);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* flex:1 + fixed-height inner zones: every card in a row (and across rows)
          renders the same height — the grid stays perfectly symmetric whether a
          product has one size, three sizes, a rating or none. */}
      <Tap
        haptic={false}
        onPress={open}
        style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, ...shadow.soft }}
      >
        <View style={{ backgroundColor: colors.wash, borderRadius: radius.md, height: 140, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {/* The pack-shot greys when it can't be bought here yet (out of stock,
              or the whole area is pre-launch); the badge + heart stay crisp. */}
          <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: selected.outOfStock || browseOnly ? 0.45 : 1 }}>
            {selected.image ? (
              selected.packCount && selected.packCount >= 2 ? (
                <StackedProductImage source={selected.image} count={selected.packCount} />
              ) : (
                <Image source={selected.image} style={{ width: '78%', height: '88%' }} contentFit="contain" transition={200} />
              )
            ) : (
              <View style={{ paddingHorizontal: 10, alignItems: 'center' }}>
                <TextSemi numberOfLines={2} style={{ textAlign: 'center', fontSize: 14 }} color={colors.flameDeep}>{selected.name}</TextSemi>
              </View>
            )}
          </View>
          {/* Top-left badge · boxed to stop short of the heart button (right: 44 =
              32px heart + 6px inset + 6px gap) so a long label can never overlap it. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 44, flexDirection: 'row' }}>
            {browseOnly || selected.outOfStock ? (
              <Pill small label="OUT OF STOCK" bg={colors.ink} color={colors.white} />
            ) : selected.mostOrdered ? (
              <Pill small label="MOST ORDERED" bg={colors.flameDeep} color={colors.white} />
            ) : pct ? (
              <Pill small label={`${pct}% OFF`} bg={colors.blue} color={colors.white} />
            ) : null}
          </View>
          {selected.packCount && selected.packCount >= 2 ? (
            <Pill small label="BULK" bg={colors.ink} color={colors.white} style={{ position: 'absolute', bottom: 8, left: 8 }} />
          ) : null}
          <Tap
            haptic={false}
            onPress={() => {
              haptics.press();
              // Favouriting stays on-device. Restock interest (name + phone to
              // the backend) is only ever sent from the product page's explicit
              // "Notify me" button — a heart tap must never upload personal
              // data the member didn't knowingly send (Play User Data policy,
              // the exact category the app was removed under).
              toggleFav(selected.id);
            }}
            style={{ position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={17} color={isFav ? colors.flameDeep : colors.inkMute} />
          </Tap>

          {/* Quick add-to-cart bag (SELECTED variant) → wallet-first checkout.
              Hidden in browse-only mode (out-of-zone showcase): the member can
              look, not order. */}
          {!browseOnly && !selected.outOfStock ? (
            <Tap
              haptic={false}
              onPress={drop}
              scaleTo={0.88}
              style={{ position: 'absolute', bottom: 6, right: 6, minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 16, backgroundColor: inCart > 0 ? colors.flameDeep : 'rgba(255,255,255,0.94)', borderWidth: inCart > 0 ? 0 : 1, borderColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3, ...shadow.soft }}
            >
              <Ionicons name="bag-add" size={16} color={inCart > 0 ? colors.white : colors.flameDeep} />
              {inCart > 0 ? <TextSemi color={colors.white} style={{ fontSize: 12, ...tabular }}>{inCart}</TextSemi> : null}
            </Tap>
          ) : null}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 4, paddingTop: 10 }}>
          <Serif style={{ fontSize: 17, lineHeight: 21 }} numberOfLines={1}>{selected.name}</Serif>

          {/* Size zone · FIXED height whether it holds the segmented selector, a
              plain variant label or nothing — no card ever grows past another. */}
          <View style={{ height: 30, marginTop: 5, justifyContent: 'center' }}>
            {vs.length > 1 ? (
              <VariantSelector variants={vs} selectedId={selectedId} onSelect={setSelectedId} compact />
            ) : (
              <TextBody style={{ fontSize: 12.5 }} numberOfLines={1}>{selected.variant}</TextBody>
            )}
          </View>

          {/* Rating zone · always reserved so rated and unrated cards line up. */}
          <View style={{ height: 18, justifyContent: 'center', marginTop: 2 }}>
            {selected.rating ? <Stars rating={selected.rating} count={selected.ratingCount} size={11} /> : null}
          </View>

          {/* Price on its own line · the struck MRP can never collide with the button */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6, marginBottom: 10, height: 24 }}>
            <Serif style={{ fontSize: 18, ...tabular }} color={colors.ink} numberOfLines={1}>{rupee(selected.price)}</Serif>
            {selected.mrp ? <TextBody style={{ fontSize: 12, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute} numberOfLines={1}>{rupee(selected.mrp)}</TextBody> : null}
          </View>

          {/* Full-width "Add" button, pinned to the card's bottom edge so every
              CTA in the grid sits on the same line. In browse-only mode it's a
              soft, non-ordering marker instead. */}
          {browseOnly || selected.outOfStock ? (
            <View style={{ marginTop: 'auto', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: radius.pill, backgroundColor: colors.wash, borderWidth: 1.5, borderColor: colors.line }}>
              <TextSemi color={colors.inkMute} style={{ fontSize: 13, letterSpacing: 0.5 }}>OUT OF STOCK</TextSemi>
            </View>
          ) : (
            <Tap
              onPress={open}
              scaleTo={0.95}
              style={{ marginTop: 'auto', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.flameDeep, ...shadow.soft }}
            >
              <TextSemi numberOfLines={1} color={colors.flameDeep} style={{ fontSize: 14, letterSpacing: 0.5 }}>{ctaLabel}</TextSemi>
            </Tap>
          )}
        </View>
      </Tap>
    </View>
  );
}
