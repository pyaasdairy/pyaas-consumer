import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { complianceFor, type Product } from '../constants/products';

/**
 * Y-axis flip card for the home hero carousel: FRONT is the existing pack-shot
 * card, BACK reads like the printed back panel of the pack (nutrition,
 * ingredients, veg mark, FSSAI licence, net quantity, shelf life). Auto-flips
 * every `flipEvery` ms; each card's timer is staggered by `index * 400ms` so a
 * row of cards never flips in unison, and flipping pauses while the user is
 * pressing/holding the card. Kept OFF list/grid cards on purpose (perf) — use
 * only for the small horizontal hero shelves.
 */
const FLIP_EVERY = 2500;
const STAGGER_MS = 400;
const FLIP_DURATION = 640;

export function FlipCard({
  front,
  back,
  index = 0,
  flipEvery = FLIP_EVERY,
  style,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  index?: number;
  flipEvery?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const flip = useSharedValue(0); // 0 = front facing, 1 = back facing
  const [showingBack, setShowingBack] = useState(false);
  const showingBackRef = useRef(false);
  const pausedRef = useRef(false);

  // Timer-driven flips run on the JS side (a slow 2.5s cadence, not a gesture),
  // so plain refs + state are enough and pointerEvents stays in sync for free.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const kickoff = setTimeout(() => {
      interval = setInterval(() => {
        if (pausedRef.current) return;
        const next = !showingBackRef.current;
        showingBackRef.current = next;
        setShowingBack(next);
        flip.value = withTiming(next ? 1 : 0, { duration: FLIP_DURATION, easing: Easing.inOut(Easing.cubic) });
      }, flipEvery);
    }, (index % 8) * STAGGER_MS);
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [flip, flipEvery, index]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const holdOff = () => { pausedRef.current = true; };
  const holdOn = () => { pausedRef.current = false; };

  return (
    <View
      style={style}
      onTouchStart={holdOff}
      onTouchEnd={holdOn}
      onTouchCancel={holdOn}
    >
      {/* Front defines the card's size; back absolutely fills the same box. */}
      <Animated.View pointerEvents={showingBack ? 'none' : 'auto'} style={[{ backfaceVisibility: 'hidden' }, frontStyle]}>
        {front}
      </Animated.View>
      <Animated.View
        pointerEvents={showingBack ? 'auto' : 'none'}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' }, backStyle]}
      >
        {back}
      </Animated.View>
    </View>
  );
}

/**
 * The "pack backside": what's printed on the reverse of the pouch, as a white
 * card in small type. Pulls per-SKU values with brand/category defaults via
 * complianceFor(), so any field a Product lacks falls back sensibly. Tapping it
 * opens the product page (same as the front card).
 */
export function PackBack({ product }: { product: Product }) {
  const router = useRouter();
  const c = complianceFor(product);
  return (
    <Tap
      haptic={false}
      onPress={() => router.push(`/product/${product.id}`)}
      style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm, ...shadow.soft }}
    >
      {/* Header row: name + the statutory green veg mark */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <TextSemi numberOfLines={2} style={{ flex: 1, fontSize: 12.5, lineHeight: 16 }}>{product.name}</TextSemi>
        {c.veg ? <VegMark /> : null}
      </View>
      <TextBody style={{ fontSize: 10, marginTop: 1 }} color={colors.inkMute}>{product.variant}</TextBody>

      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />

      <View style={{ flex: 1, gap: 5 }}>
        {c.nutrition ? <BackRow label="NUTRITION" value={c.nutrition} lines={2} /> : null}
        <BackRow label="INGREDIENTS" value={c.ingredients} lines={2} />
        <BackRow label="SHELF LIFE" value={c.shelfLife} lines={2} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <BackRow label="NET QTY" value={c.netQuantity} lines={1} />
          </View>
          <View style={{ flex: 1.4 }}>
            <BackRow label="FSSAI LIC. NO." value={c.fssaiLicense} lines={1} />
          </View>
        </View>
      </View>

      <TextBody numberOfLines={1} style={{ fontSize: 8.5, letterSpacing: 0.2, marginTop: 4 }} color={colors.inkMute}>
        {c.manufacturer} · {c.countryOfOrigin}
      </TextBody>
    </Tap>
  );
}

function BackRow({ label, value, lines }: { label: string; value: string; lines: number }) {
  return (
    <View>
      <TextMed style={{ fontSize: 8.5, letterSpacing: 0.6 }} color={colors.inkMute}>{label}</TextMed>
      <TextBody numberOfLines={lines} style={{ fontSize: 10.5, lineHeight: 13.5 }} color={colors.inkSoft}>{value}</TextBody>
    </View>
  );
}

/** FSSAI green-dot vegetarian mark (statutory colours, like the black QR viewport). */
function VegMark() {
  return (
    <View style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: '#1B8A3A', borderRadius: 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#1B8A3A' }} />
    </View>
  );
}
