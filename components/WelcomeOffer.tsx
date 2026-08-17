import React, { useEffect, useMemo } from 'react';
import { View, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { TRIAL_PAID_DAYS, TRIAL_FREE_DAYS } from '../lib/freePack';

const FREE_PACK_IMG = require('../assets/products/gold.png');
const SEEN_KEY_PREFIX = 'pyaas_welcome_offer_seen:';

/** Whether the welcome offer has already been shown to this user. */
export async function welcomeOfferSeen(uid: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(SEEN_KEY_PREFIX + uid)) === '1'; } catch { return false; }
}

/** Mark the welcome offer as shown for this user (it greets each login once). */
export async function markWelcomeOfferSeen(uid: string): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY_PREFIX + uid, '1'); } catch { /* best-effort */ }
}

const CONFETTI_COLORS = ['#F36CB5', '#D63C95', '#FBC9E6', '#C9A24B', '#7AC0F8', '#F4A25B'];
const CONFETTI_COUNT = 26;

/**
 * WELCOME OFFER — the animated greeting a member sees the moment they first log
 * in (reference: the "Welcome Offer 4+3" confetti screen). Full-screen white
 * sheet, falling confetti, the offer headline zooming in, and one clear CTA that
 * opens the subscription claim flow.
 */
export function WelcomeOffer({ visible, onClaim, onClose }: { visible: boolean; onClaim: () => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.white }}>
        {visible ? <ConfettiRain /> : null}

        {/* Close */}
        <View style={{ position: 'absolute', top: 54, right: 18, zIndex: 10 }}>
          <Tap haptic={false} onPress={onClose} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(46,35,41,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color={colors.white} />
          </Tap>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <Animated.View entering={FadeInDown.duration(420).delay(120)}>
            <Serif style={{ fontSize: 34, textAlign: 'center' }} color={colors.ink}>Welcome Offer</Serif>
          </Animated.View>

          {/* The big offer numeral, zooming in like the reference */}
          <Animated.View entering={ZoomIn.duration(520).delay(260)} style={{ alignItems: 'center' }}>
            <Serif style={{ fontSize: 96, lineHeight: 104, letterSpacing: -2 }} color={colors.flameDeep}>
              {TRIAL_PAID_DAYS}+{TRIAL_FREE_DAYS}
            </Serif>
          </Animated.View>

          <Animated.View entering={FadeIn.duration(420).delay(480)} style={{ borderWidth: 1.5, borderColor: colors.flameSoft, borderStyle: 'dashed', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white }}>
            <TextSemi style={{ fontSize: 16.5, textAlign: 'center', lineHeight: 24 }} color={colors.ink}>
              Your first {TRIAL_FREE_DAYS} days are FREE,{'\n'}then just {TRIAL_PAID_DAYS} paid days to finish
            </TextSemi>
          </Animated.View>

          <Animated.View entering={FadeIn.duration(420).delay(600)} style={{ alignItems: 'center' }}>
            <Image source={FREE_PACK_IMG} style={{ width: 150, height: 150 }} contentFit="contain" />
            <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.inkSoft}>PYAAS Gold Full Cream · 500 ml fresh every morning</TextBody>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(420).delay(720)} style={{ alignSelf: 'stretch', gap: 10, marginTop: spacing.sm }}>
            <Tap onPress={() => { haptics.confirm(); onClaim(); }} style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
              <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Claim my offer</TextSemi>
            </Tap>
            <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <TextBody color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextBody>
            </Tap>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/** A light confetti rain: small rotated rectangles falling on loop. Parameters
 *  are seeded per piece at mount so the shower looks organic without any
 *  per-frame JS work (everything runs on the UI thread via reanimated). */
function ConfettiRain() {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 1800,
        duration: 2600 + Math.random() * 2200,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: (Math.random() - 0.5) * 90,
        spin: Math.random() < 0.5 ? -1 : 1,
      })),
    [width],
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} fallHeight={height + 40} />
      ))}
    </View>
  );
}

function ConfettiPiece({ x, delay, duration, size, color, drift, spin, fallHeight }: { x: number; delay: number; duration: number; size: number; color: string; drift: number; spin: number; fallHeight: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 0 })), -1, false));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -30 + t.value * fallHeight },
      { translateX: t.value * drift },
      { rotate: `${t.value * spin * 540}deg` },
    ],
    opacity: t.value < 0.05 ? 0 : 1 - t.value * 0.35,
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, left: x, width: size, height: size * 0.55, borderRadius: 2, backgroundColor: color }, style]}
    />
  );
}
