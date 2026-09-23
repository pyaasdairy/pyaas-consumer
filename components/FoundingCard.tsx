/**
 * THE MEMBER CARD — the animated card with the customer's name on it, kept
 * exactly as it was on the PYAAS Plus screen (founder call, 21 Sep: "I love the
 * card animation with customer name on it, do not remove that"). Only the
 * label changed, PYAAS PLUS → FOUNDING FAMILY. On the member screen the foil
 * number is the member's place in line.
 */
import React, { useCallback } from 'react';
import { View, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, radius, shadow, fonts, tabular } from '../lib/theme';
import { Tap } from './ui';
import { haptics } from '../lib/haptics';
import { ShineSweep, GlowPulse } from './Fx';

const INK = colors.ink;
const GOLD = colors.gold;

function FoilNumber({ num, lineOne, lineTwo }: { num: number; lineOne: string; lineTwo: string }) {
  const sh = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      sh.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, false);
      return () => cancelAnimation(sh);
    }, [sh])
  );
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sh.value, [0, 1], [-90, 230]) }, { rotate: '20deg' }],
    opacity: interpolate(sh.value, [0, 0.25, 0.75, 1], [0, 0.7, 0.7, 0]),
  }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' }}>
      <View>
        {/* dark engraved copy underneath the gold face. Explicit lineHeight on
            BOTH copies (identical, to keep them registered): without it Android
            sizes the line from the font bbox (~93pt at 60pt — Bricolage's
            includeFontPadding box) and the active-member stack overflows the
            fixed 200pt card; the multiplier cap protects the same fixed box
            from large OS font scales. */}
        <Text maxFontSizeMultiplier={1.2} style={{ position: 'absolute', top: 2, left: 0, fontSize: 60, lineHeight: 62, fontFamily: fonts.serifBlack, color: 'rgba(0,0,0,0.5)', letterSpacing: -2, ...tabular }}>{num}</Text>
        <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 60, lineHeight: 62, fontFamily: fonts.serifBlack, color: GOLD, letterSpacing: -2, ...tabular }}>{num}</Text>
      </View>
      <View style={{ marginBottom: 12, marginLeft: 9 }}>
        <Text style={{ color: colors.white, fontSize: 15, fontFamily: fonts.sansBold, letterSpacing: 2 }}>{lineOne}</Text>
        <Text style={{ color: GOLD, fontSize: 15, fontFamily: fonts.sansBold, letterSpacing: 2 }}>{lineTwo}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -12, bottom: -12, left: 0, width: 44 }, band]}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
      </Animated.View>
    </View>
  );
}

// The membership card (hero). Faked depth via perspective + idle tilt + a
// specular sheen. Flips up to face you each time the tab is focused, then idles.
export function HoloCard({ scrollY, num, lineOne, lineTwo, memberLine }: { scrollY: SharedValue<number>; num: number | null; lineOne: string; lineTwo: string; memberLine: string }) {
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const sheen = useSharedValue(0);
  const entered = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      entered.value = 0;
      entered.value = withDelay(160, withSpring(1, { damping: 14, stiffness: 90 }));
      tiltY.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, true);
      tiltX.value = withRepeat(withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.ease) }), -1, true);
      sheen.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
      const h = setTimeout(() => haptics.heavy(), 330);
      return () => {
        clearTimeout(h);
        cancelAnimation(tiltX);
        cancelAnimation(tiltY);
        cancelAnimation(sheen);
        cancelAnimation(entered);
      };
    }, [entered, tiltX, tiltY, sheen])
  );

  const cardStyle = useAnimatedStyle(() => {
    const e = entered.value;
    const idleRotY = interpolate(tiltY.value, [0, 1], [-9, 9]);
    const idleRotX = interpolate(tiltX.value, [0, 1], [6, -6]);
    const floatY = interpolate(tiltX.value, [0, 1], [-5, 5]);
    const enterRotX = interpolate(e, [0, 1], [90, 0]);
    const enterScale = interpolate(e, [0, 1], [0.7, 1]);
    const sScale = interpolate(scrollY.value, [0, 260], [1, 0.86], 'clamp');
    const sRotZ = interpolate(scrollY.value, [0, 300], [0, -4], 'clamp');
    const sTransY = interpolate(scrollY.value, [0, 300], [0, -34], 'clamp');
    return {
      opacity: e,
      transform: [
        { perspective: 900 },
        { rotateX: `${idleRotX + enterRotX}deg` },
        { rotateY: `${idleRotY}deg` },
        { rotateZ: `${sRotZ}deg` },
        { translateY: floatY + sTransY },
        { scale: enterScale * sScale },
      ],
    };
  });

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-230, 250]) }, { rotate: '32deg' }],
    opacity: interpolate(sheen.value, [0, 0.1, 0.9, 1], [0, 0.5, 0.5, 0]),
  }));

  return (
    <Animated.View style={[{ width: 320, height: 200, borderRadius: 22, ...shadow.e3 }, cardStyle]}>
      <View style={{ flex: 1, borderRadius: 22, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: INK, padding: 18, justifyContent: 'space-between' }}>
          {/* edge highlight + thickness shadow, kept inside the card */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.5)' }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: 'rgba(0,0,0,0.30)' }} />

          {/* specular sheen: a solid low-opacity white band, clipped by the card */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -40, bottom: -40, width: 130 }, sheenStyle]}>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
          </Animated.View>

          {/* top row: issuer logo + gold chip */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Image source={require('../assets/parag-logo.png')} style={{ width: 52, height: 52 }} resizeMode="contain" />
            <View style={{ width: 34, height: 26, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: GOLD }}>
              <View style={{ flex: 1, margin: 4, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
            </View>
          </View>

          {/* foil number — members only (their days-left countdown). Prospects
              get no number: Plus is sold, so the card must not flash "30 DAYS"
              as if a free period were included. */}
          {num != null ? <FoilNumber num={num} lineOne={lineOne} lineTwo={lineTwo} /> : null}

          {/* bottom row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: fonts.sansBold, letterSpacing: 2 }}>MEMBER</Text>
              <Text style={{ color: colors.white, fontSize: 13, fontFamily: fonts.sansBold, letterSpacing: 1.5 }}>{memberLine}</Text>
            </View>
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: fonts.serif, letterSpacing: 1.5 }}>FOUNDING FAMILY</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// Perk marker: a solid icon badge with a gentle bob. No emoji, no gradient.
export function PerkGem({ perk, bob, phase }: { perk: { icon: keyof typeof Ionicons.glyphMap; color: string }; bob: SharedValue<number>; phase: number }) {
  const st = useAnimatedStyle(() => {
    const v = (bob.value + phase) % 1;
    return { transform: [{ scale: interpolate(v, [0, 0.5, 1], [1, 1.05, 1]) }] };
  });
  return (
    <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 46, height: 46, borderRadius: 14, backgroundColor: perk.color, alignItems: 'center', justifyContent: 'center', ...shadow.soft }, st]}>
        <Ionicons name={perk.icon} size={22} color={colors.white} />
      </Animated.View>
    </View>
  );
}

// Glowing, shining CTA pill.
export function ShineButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={{ marginHorizontal: 4 }}>
      <GlowPulse color={colors.action} radius={radius.pill} />
      <Tap onPress={onPress} weight="medium">
        <View style={{ borderRadius: radius.pill, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flameDeep, ...shadow.card }}>
          <Text style={{ color: colors.white, fontSize: 16.5, fontFamily: fonts.sansBold, letterSpacing: 0.3 }}>{title}</Text>
          <ShineSweep dur={2400} travel={360} bandWidth={70} angle="16deg" delay={400} />
        </View>
      </Tap>
    </View>
  );
}

