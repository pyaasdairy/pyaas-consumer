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
// banner-1 and banner-2 are PULLED from rotation until the artwork is reissued:
// banner-1 claims "Your first 2 days are completely free" and banner-2 claims a
// "7-DAY SUBSCRIPTION" with "free milk packets on us" for days 3-7. The real
// offer is 2 PAID days first, then 2 free, then Rs 29/day until paused; art
// that promises the first days free while the app charges them is a false
// money claim (Play Deceptive Behavior — the takedown reason). Do not re-add
// the files, add corrected 2+2 art.
const SLIDES: ReturnType<typeof require>[] = [
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
  // HOLD TO READ: a finger on the creative pauses the auto-advance; it
  // resumes a beat after the touch lifts, so nobody loses their place mid-read.
  const heldRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHold = () => {
    heldRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  const onRelease = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { heldRef.current = false; }, 2500);
  };
  useEffect(() => {
    if (cardW <= 0 || SLIDES.length < 2) return;
    const t = setInterval(() => {
      if (heldRef.current) return; // reading — hold the slide
      const next = (idxRef.current + 1) % SLIDES.length;
      ref.current?.scrollToOffset({ offset: next * cardW, animated: true });
      setIdx(next);
    }, INTERVAL);
    return () => { clearInterval(t); if (resumeTimer.current) clearTimeout(resumeTimer.current); };
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

      {/* pagination pills (pointless for a single slide) */}
      {SLIDES.length > 1 ? <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? colors.flameDeep : colors.line }}
          />
        ))}
      </View> : null}
    </View>
  );
}
