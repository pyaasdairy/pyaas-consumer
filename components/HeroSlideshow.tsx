import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Tap, Pill } from './ui';

/**
 * Auto-advancing hero slideshow of the PARAG brand creatives (replaces the old
 * static hero card). Swipeable + auto-plays every few seconds, with a pill
 * pagination indicator. Solid colours only, no gradients; effects stay inside
 * the clipped card. Founder can drop replacement banners into assets/creatives.
 * Each slide taps through to the product it advertises so you can buy it.
 *
 * PYAAS partner slides (pack shots, not banner art) are interleaved with the
 * PARAG creatives - PARAG first, then alternating while PYAAS slides last.
 * They render contained on a clean white tile with an OUT OF STOCK pill and tap
 * through to the out-of-stock SKU (wishlist tap captures a restock lead).
 */
const SLIDES: { img: ReturnType<typeof require>; product: string; pyaas?: boolean }[] = [
  // NOTE: creative-pyaas.png is retired — its artwork bakes a "Now on PARAG"
  // pill into the pixels (made for the cross-listing era). The pure PYAAS pack
  // shots below carry the brand slides instead.
  { img: require('../assets/creatives/creative-milk.png'), product: 'taaza-1l' },
  { img: require('../assets/products/pyaas-a2-1l.png'), product: 'pyaas-a2-1l', pyaas: true },
  { img: require('../assets/creatives/creative-dairy.png'), product: 'paneer-vac-200g' },
  { img: require('../assets/products/pyaas-toned-1l.png'), product: 'pyaas-toned-1l', pyaas: true },
  { img: require('../assets/creatives/creative-fullcream.png'), product: 'gold-1l' },
  { img: require('../assets/products/pyaas-a2-pouch.png'), product: 'pyaas-a2-pouch', pyaas: true },
  { img: require('../assets/creatives/creative-lassi.png'), product: 'lassi-200g' },
  { img: require('../assets/products/pyaas-toned-pouch.png'), product: 'pyaas-toned-pouch', pyaas: true },
  { img: require('../assets/creatives/creative-sweets.png'), product: 'gulab-jamun-200g' },
  { img: require('../assets/creatives/creative-butter.png'), product: 'butter-500g' },
  { img: require('../assets/creatives/creative-flavoured.png'), product: 'flavoured-milk-200ml' },
];

const CARD_H = 190;
const INTERVAL = 3600;

export function HeroSlideshow() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const cardW = width - spacing.lg * 2;
  const ref = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;

  // Auto-advance. Pauses nothing fancy; a manual swipe just resets the timer via
  // the momentum handler updating idx (next tick continues from there).
  useEffect(() => {
    if (cardW <= 0) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % SLIDES.length;
      ref.current?.scrollToOffset({ offset: next * cardW, animated: true });
      setIdx(next);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [cardW]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardW > 0) setIdx(Math.round(e.nativeEvent.contentOffset.x / cardW));
  };

  return (
    <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: 10 }}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream, ...shadow.card }}>
        <FlatList
          ref={ref}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onMomentumScrollEnd={onEnd}
          getItemLayout={(_, i) => ({ length: cardW, offset: cardW * i, index: i })}
          renderItem={({ item }) => (
            <Tap
              haptic={false}
              scaleTo={1}
              onPress={() => router.push(`/product/${item.product}`)}
              style={{ width: cardW, height: CARD_H, backgroundColor: item.pyaas ? colors.white : colors.cream }}
            >
              {item.pyaas ? (
                <>
                  {/* Square pack shot, contained on a clean tile (banner crop would clip it) */}
                  <Image source={item.img} style={{ width: cardW, height: CARD_H - 20, marginTop: 10 }} contentFit="contain" transition={220} />
                  <Pill small label="OUT OF STOCK" bg={colors.ink} color={colors.white} style={{ position: 'absolute', top: 10, right: 10 }} />
                </>
              ) : (
                <Image source={item.img} style={{ width: cardW, height: CARD_H }} contentFit="cover" transition={220} />
              )}
            </Tap>
          )}
        />
      </View>

      {/* pagination pills */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? colors.flameDeep : colors.line }}
          />
        ))}
      </View>
    </View>
  );
}
