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
// BRAND creatives — permanent marketing. Deliberately NOT funnel-gated: the
// slides stay for everyone, always (the claim popup/card have their own
// eligibility; the carousel is the billboard).
//
// banner-2 is PULLED from rotation until the artwork is reissued: it still
// claims a "7-DAY SUBSCRIPTION" and "free milk packets on us" for days 3-7,
// neither of which the product does (the real offer is 2 free days then
// Rs 29/day until paused). Showing it is a false money claim (Play Deceptive
// Behavior) — do not re-add the file, add the corrected art.
const SLIDES: ReturnType<typeof require>[] = [
  require('../assets/banners/home-banner-1.png'),
  require('../assets/banners/home-banner-3.png'),
];

const BANNER_RATIO = 941 / 1672; // h/w of the banner art
const INTERVAL = 3600;

export function HeroSlideshow() {
  const { width } = useWindowDimensions();
  const cardW = width - spacing.lg * 2;
  const cardH = Math.round(cardW * BANNER_RATIO);
  const ref = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;

  // Auto-advance. A manual swipe just resets the timer via the momentum handler
  // updating idx (next tick continues from there).
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
            <Image source={item} style={{ width: cardW, height: cardH }} contentFit="cover" transition={220} />
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
