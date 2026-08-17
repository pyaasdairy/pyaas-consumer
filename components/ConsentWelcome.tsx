import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { ShineSweep } from './Fx';
import { haptics } from '../lib/haptics';
import { FLOWS } from './DataDisclosure';

const LOGO = require('../assets/pyaas-logo.png');

/**
 * CONSENT WELCOME — the full-screen, first-run consent moment.
 *
 * This is the PROMINENT DISCLOSURE that fixes the Play removal ("uploading
 * users' phone number information without a prominent disclosure"), promoted
 * from a modal to a screen of its own so it cannot read as fine print. The
 * compliance shape is identical to components/DataDisclosure.tsx and every
 * rule still holds:
 *
 *   · The disclosed flows are the SAME `FLOWS` list (single source of truth).
 *   · Shown in normal usage, before the sign-in field exists (rule 2), full
 *     text on screen, not just policy links (rule 3), sign-in data only, no
 *     marketing bundled in (rule 4).
 *   · One button, one meaning; nothing proceeds without the tap (consent
 *     rules 1-2). There is no dismissal, no timer, and Android back simply
 *     leaves the app — navigation away is never consent (rules 3-4).
 *   · onAgree fires BEFORE any collection is possible: the caller renders the
 *     login form only after the acceptance is recorded (rule 5).
 *
 * The animation is presentation only — nothing here may ever auto-advance,
 * auto-accept, or expire the screen.
 */

export function ConsentWelcome({ onAgree }: { onAgree: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // One-shot guard: the tap records consent exactly once even if double-tapped
  // while the exit transition plays.
  const [agreed, setAgreed] = useState(false);

  // The CTA breathes — a slow, subtle scale loop that reads as an invitation.
  // It stops the moment the member agrees (motion must never imply urgency).
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withDelay(
      1200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(breath);
  }, [breath]);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.018 }],
  }));

  // Agree: confirm haptic, settle the button with a spring press, then hand
  // over. The parent unmounts this screen; the FadeOut below plays the exit.
  const settle = useSharedValue(0);
  const settleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - settle.value * 0.04 }],
  }));
  const agree = () => {
    if (agreed) return;
    setAgreed(true);
    cancelAnimation(breath);
    breath.value = 0;
    settle.value = withSequence(withSpring(1, { damping: 18, stiffness: 380 }), withSpring(0));
    haptics.confirm();
    // Small beat so the press lands visually before the cross-fade to login.
    setTimeout(onAgree, 220);
  };

  return (
    <Animated.View entering={FadeIn.duration(320)} exiting={FadeOut.duration(260)} style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingBottom: 200, paddingHorizontal: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand — big, warm, unmistakably PYAAS. */}
        <Animated.View entering={FadeInDown.duration(480)} style={{ alignItems: 'center', gap: spacing.md }}>
          <Image source={LOGO} style={{ width: 240, height: 72 }} contentFit="contain" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(480).delay(120)} style={{ alignItems: 'center', gap: 8, marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <Serif style={{ fontSize: 30, textAlign: 'center', lineHeight: 36 }}>Fresh milk,{'\n'}nothing hidden</Serif>
          <TextBody color={colors.inkMute} style={{ fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 330 }}>
            Before you sign in, here is exactly what PYAAS collects, what we use it for, and who else sees it.
          </TextBody>
        </Animated.View>

        {/* The disclosure itself — the same seven flows as the modal, staggered
            in so the eye is walked down the list. */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.md, ...shadow.card }}>
          {FLOWS.map((f, i) => (
            <Animated.View
              key={f.what}
              entering={FadeInDown.duration(420).delay(240 + i * 90)}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Ionicons name={f.icon} size={17} color={colors.flameDeep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <TextSemi style={{ fontSize: 15 }}>{f.what}</TextSemi>
                <TextBody color={colors.inkMute} style={{ fontSize: 13, lineHeight: 18.5 }}>{f.why}</TextBody>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={FadeInDown.duration(420).delay(240 + FLOWS.length * 90)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: spacing.md }}>
          <Ionicons name="shield-checkmark" size={15} color={colors.flameDeep} />
          <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }}>We never sell your data · delete your account anytime</TextBody>
        </Animated.View>
      </ScrollView>

      {/* Pinned CTA — the ONLY path that grants consent. No timer, no dismissal. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.milk, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 }}>
        <Animated.View entering={FadeInDown.duration(460).delay(500)} style={[breathStyle, settleStyle]}>
          <Tap onPress={agree} accessibilityRole="button" accessibilityLabel="Agree and continue to sign in">
            <View style={{ height: 58, borderRadius: radius.pill, backgroundColor: colors.flameDeep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
              {/* Slow sheen — premium, not urgent. Clipped inside the pill. */}
              <ShineSweep dur={3600} delay={1400} travel={480} bandWidth={80} />
              <TextSemi color={colors.white} style={{ fontSize: 17 }}>Agree and continue</TextSemi>
              <Ionicons name="arrow-forward" size={19} color={colors.white} />
            </View>
          </Tap>
        </Animated.View>
        {/* Policy links are an ADDITION to the on-screen disclosure, never the
            substitute (rule 3). Both routes are public — readable signed out. */}
        <Animated.View entering={FadeIn.duration(420).delay(700)}>
          <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.inkMute}>
            Full details in our{' '}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/privacy-policy')}>Privacy Policy</TextMed>
            {' '}and{' '}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/terms')}>Terms</TextMed>.
          </TextBody>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
