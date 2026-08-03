import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius, spacing, shadow } from '../lib/theme';

/**
 * Auto-advancing hero slideshow of the PYAAS home banners (assets/banners).
 * PYAAS brand creatives only — partner products live in the catalogue grid, not
 * here. Swipeable + auto-plays, with a pill pagination indicator. Effects stay
 * inside the clipped card. Founder can drop replacement art into assets/banners.
 */
type Slide = { src: ReturnType<typeof require>; trialOffer?: boolean };
const SLIDES: Slide[] = [
  { src: require('../assets/banners/home-banner-1.png') },
  // The 2+2 "HOW IT WORKS" creative — shown until the offer is REDEEMED
  // (2 paid days completed), then gone from the carousel for good.
  { src: require('../assets/banners/home-banner-2.png'), trialOffer: true },
  { src: require('../assets/banners/home-banner-3.png') },
];

const BANNER_RATIO = 941 / 1672; // h/w of the banner art
const INTERVAL = 3600;

export function HeroSlideshow({ showTrialOffer = true }: { showTrialOffer?: boolean }) {
  const slides = SLIDES.filter((s) => !s.trialOffer || showTrialOffer);
  const { width } = useWindowDimensions();
  const cardW = width - spacing.lg * 2;
  const cardH = Math.round(cardW * BANNER_RATIO);
  const ref = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;

  // If the trial slide just left the deck, never point past the end.
  useEffect(() => {
    if (idx >= slides.length) {
      setIdx(0);
      ref.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [slides.length, idx]);

  // Auto-advance. A manual swipe just resets the timer via the momentum handler
  // updating idx (next tick continues from there).
  useEffect(() => {
    if (cardW <= 0 || slides.length < 2) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % slides.length;
      ref.current?.scrollToOffset({ offset: next * cardW, animated: true });
      setIdx(next);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [cardW, slides.length]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardW > 0) setIdx(Math.round(e.nativeEvent.contentOffset.x / cardW));
  };

  return (
    <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: 10 }}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream, ...shadow.card }}>
        <FlatList
          ref={ref}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onMomentumScrollEnd={onEnd}
          getItemLayout={(_, i) => ({ length: cardW, offset: cardW * i, index: i })}
          renderItem={({ item }) => (
            <Image source={item.src} style={{ width: cardW, height: cardH }} contentFit="cover" transition={220} />
          )}
        />
      </View>

      {/* pagination pills */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? colors.flameDeep : colors.line }}
          />
        ))}
      </View>
    </View>
  );
}
