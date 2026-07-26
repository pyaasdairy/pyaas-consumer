/**
 * PARAG Plus - the loyalty membership tab. Plus is a paid membership whose value
 * is service (priority slots, free delivery, member offers, priority support),
 * NOT a per-SKU discount, so this screen never shows member prices, a savings
 * table or an "X% off" claim. Membership state lives per-user in localStore via
 * lib/vip. Gold is used only as the membership foil/badge accent on the dark
 * card; everything else stays on the flame/blue identity. Motion comes from the
 * shared, gradient-free components/Fx primitives.
 */
import React, { useCallback, useState } from 'react';
import { View, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from '../../components/ui';
import { enterUp } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { getProfile } from '../../lib/session';
import { FloatingParticles, ShineSweep, GlowPulse } from '../../components/Fx';
import { VipTrialModal } from '../../components/VipTrialModal';
import { ClaimPackFlow } from '../../components/ClaimPackFlow';
import {
  getVip,
  startTrial,
  vipActive,
  vipDaysLeft,
  vipOnTrial,
  PLUS_TRIAL_DAYS,
  PLUS_PRICE_MONTH,
  type VipMembership,
} from '../../lib/vip';

// Membership accent colours. Gold is the foil/badge only; the card sits on the
// warm-ink surface so the gold reads as a real foil rather than a colour wash.
const INK = colors.ink;
const GOLD = colors.gold;
const GOLD_DEEP = colors.goldDeep;

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; color: string }[] = [
  { icon: 'flash', title: 'Priority slots', body: 'The first morning delivery window, reserved for you every day.', color: colors.flameDeep },
  { icon: 'bicycle', title: 'Free delivery', body: 'No delivery fee on any order, however small.', color: colors.blue },
  { icon: 'gift', title: 'Member perks', body: 'Early access to new launches and member-only drops.', color: colors.flame },
  { icon: 'headset', title: 'Priority support', body: 'A faster line to the team whenever you need it.', color: GOLD_DEEP },
];

// Foil number: an engraved gold number with a soft white shimmer band. Built
// from doubled Views only (no gradient), clipped by its parent.
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
        {/* dark engraved copy underneath the gold face */}
        <Text style={{ position: 'absolute', top: 2, left: 0, fontSize: 60, fontFamily: fonts.serifBlack, color: 'rgba(0,0,0,0.5)', letterSpacing: -2, ...tabular }}>{num}</Text>
        <Text style={{ fontSize: 60, fontFamily: fonts.serifBlack, color: GOLD, letterSpacing: -2, ...tabular }}>{num}</Text>
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
function HoloCard({ scrollY, num, lineOne, lineTwo, memberLine }: { scrollY: SharedValue<number>; num: number; lineOne: string; lineTwo: string; memberLine: string }) {
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
            <Image source={require('../../assets/parag-logo.png')} style={{ width: 34, height: 34 }} resizeMode="contain" />
            <View style={{ width: 34, height: 26, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: GOLD }}>
              <View style={{ flex: 1, margin: 4, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
            </View>
          </View>

          {/* foil number */}
          <FoilNumber num={num} lineOne={lineOne} lineTwo={lineTwo} />

          {/* bottom row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: fonts.sansBold, letterSpacing: 2 }}>MEMBER</Text>
              <Text style={{ color: colors.white, fontSize: 13, fontFamily: fonts.sansBold, letterSpacing: 1.5 }}>{memberLine}</Text>
            </View>
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: fonts.serif, letterSpacing: 1.5 }}>PARAG PLUS</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// Perk marker: a solid icon badge with a gentle bob. No emoji, no gradient.
function PerkGem({ perk, bob, phase }: { perk: (typeof PERKS)[number]; bob: SharedValue<number>; phase: number }) {
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
function ShineButton({ title, onPress }: { title: string; onPress: () => void }) {
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

export default function Vip() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [m, setM] = useState<VipMembership | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [msg, setMsg] = useState('');
  const [focused, setFocused] = useState(true);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // Hero dissolves as you scroll into the details (looks intentional + stops the
  // looping hero work mattering once it is off screen).
  const heroStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 300], [1, 0], 'clamp') }));
  const bob = useSharedValue(0); // single driver for all four perk gems

  // Refresh membership + name, run the gem driver and mount the looping
  // decorations ONLY while focused; everything stops when the user leaves.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      getVip().then(setM);
      getProfile().then((p) => setName(p?.full_name ?? null));
      bob.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
      return () => {
        setFocused(false);
        cancelAnimation(bob);
      };
    }, [bob])
  );

  const active = vipActive(m);
  const days = vipDaysLeft(m);
  const onTrial = vipOnTrial(m);

  function openTrial() {
    haptics.press();
    setShowModal(true);
  }
  async function acceptTrial() {
    setShowModal(false);
    // Create a real membership row: the card flips to member state and Plus
    // perks apply immediately across the app.
    try {
      const next = await startTrial();
      setM(next);
      haptics.success();
      setMsg(`Your ${PLUS_TRIAL_DAYS}-day Plus trial is live. Priority slots and free delivery are on.`);
      // Members who just launched their trial get the Taaza claim-pack flow.
      // Delay presenting so VipTrialModal's native Modal has fully dismissed
      // first (presenting a second RN Modal mid-dismiss is swallowed on iOS).
      setTimeout(() => setShowClaim(true), 350);
    } catch {
      setMsg('Could not start your trial just now. Please try again.');
    }
  }

  // What the card shows adapts to membership state.
  const cardNum = active ? days : PLUS_TRIAL_DAYS;
  const cardL2 = active ? 'LEFT' : 'FREE';
  const upperName = (name ?? 'PARAG FAMILY').toUpperCase();
  const memberLine = active ? (onTrial ? 'TRIAL ACTIVE' : upperName) : upperName;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 130, paddingHorizontal: spacing.lg, gap: spacing.lg }}
      >
        {/* HERO */}
        <Animated.View style={[{ height: 360, alignItems: 'center', justifyContent: 'center' }, heroStyle]}>
          {focused ? <FloatingParticles count={14} height={360} /> : null}
          <Animated.View entering={enterUp(60)} style={{ alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: GOLD_DEEP, fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 4 }}>PARAG PLUS MEMBERSHIP</Text>
          </Animated.View>
          <HoloCard scrollY={scrollY} num={cardNum} lineOne="DAYS" lineTwo={cardL2} memberLine={memberLine} />
          <Animated.View entering={enterUp(140)} style={{ marginTop: 22, alignItems: 'center' }}>
            <TextSemi style={{ fontSize: 15, textAlign: 'center' }} color={INK}>
              {active
                ? (onTrial ? `Your free trial is live, ${days} day${days === 1 ? '' : 's'} of Plus left.` : `You're a Plus member, renews in ${days} days.`)
                : 'Join PARAG Plus'}
            </TextSemi>
            {!active ? (
              <TextBody style={{ fontSize: 13, textAlign: 'center', marginTop: 2 }}>
                {PLUS_TRIAL_DAYS} days on us, no card needed, cancel anytime
              </TextBody>
            ) : null}
          </Animated.View>
        </Animated.View>

        {/* TOP CTA - start the free trial, above the fold (non-members only) */}
        {!active ? (
          <Animated.View entering={enterUp(50)} style={{ gap: 8, marginTop: -8 }}>
            <ShineButton title={`Start my ${PLUS_TRIAL_DAYS}-day free trial`} onPress={openTrial} />
            <TextBody style={{ fontSize: 12, textAlign: 'center' }}>
              No card needed. Cancel anytime.
            </TextBody>
          </Animated.View>
        ) : null}

        {/* MEMBERSHIP SUMMARY (honest: price + trial, no savings claim) */}
        <Animated.View entering={enterUp(70)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.goldSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: GOLD, padding: spacing.lg, ...shadow.soft }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: GOLD }}>
              <Ionicons name="star" size={24} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: GOLD_DEEP, fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 1.4 }}>PLUS MEMBERSHIP</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 1 }}>
                <Text style={{ fontFamily: fonts.serifBlack, fontSize: 30, letterSpacing: -0.5, color: INK, ...tabular }}>{rupee(PLUS_PRICE_MONTH)}</Text>
                <Text style={{ fontFamily: fonts.sansSemi, fontSize: 14, color: colors.inkSoft, marginBottom: 5 }}>/ month</Text>
              </View>
              <TextBody style={{ fontSize: 12.5, marginTop: 1 }}>
                {active
                  ? (onTrial ? `Free for ${days} more day${days === 1 ? '' : 's'}, then ${rupee(PLUS_PRICE_MONTH)}/mo.` : 'Priority slots and free delivery are active.')
                  : `First ${PLUS_TRIAL_DAYS} days free, then ${rupee(PLUS_PRICE_MONTH)}/mo.`}
              </TextBody>
            </View>
          </View>
        </Animated.View>

        {/* BENEFITS */}
        <Animated.View entering={enterUp(80)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 18 }} color={INK}>What Plus unlocks</TextSemi>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 14, ...shadow.soft }}>
            {PERKS.map((p, i) => (
              <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <PerkGem perk={p} bob={bob} phase={i * 0.25} />
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 15 }} color={INK}>{p.title}</TextSemi>
                  <TextBody style={{ fontSize: 12.5, lineHeight: 17 }}>{p.body}</TextBody>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* HOW PLUS WORKS */}
        <Animated.View entering={enterUp(120)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 18 }} color={INK}>How Plus works</TextSemi>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.card }}>
            {[
              { n: '1', icon: 'gift' as const, title: 'Start free', body: `Your first ${PLUS_TRIAL_DAYS} days of Plus are on us. No card needed to begin.` },
              { n: '2', icon: 'flash' as const, title: 'Enjoy the perks', body: 'Priority morning slots, free delivery and member-only offers, from day one.' },
              { n: '3', icon: 'card' as const, title: 'Then just ' + rupee(PLUS_PRICE_MONTH) + '/mo', body: 'Billed monthly after the trial. Cancel anytime, no lock-in.' },
            ].map((row, i) => (
              <View key={row.n} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.md, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
                  <Ionicons name={row.icon} size={16} color={colors.flameDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 14.5 }} color={INK}>{row.title}</TextSemi>
                  <TextBody style={{ fontSize: 12.5, lineHeight: 17 }}>{row.body}</TextBody>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* WHY */}
        <Animated.View entering={enterUp(160)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 16, marginBottom: 6 }} color={INK}>Why members love Plus</TextSemi>
          <TextBody style={{ fontSize: 13.5, lineHeight: 21 }}>
            Plus is about getting looked after first. Your milk arrives in the earliest slot each morning,
            delivery is always free, and you get offers and new launches before anyone else, with a faster
            line to the team when you need it. No card to start, and you can cancel anytime.
          </TextBody>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={enterUp(200)} style={{ gap: 10, marginTop: 4 }}>
          {active ? (
            <View style={{ borderRadius: radius.pill, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, ...shadow.card }}>
              <Text style={{ color: INK, fontSize: 16, fontFamily: fonts.sansBold, ...tabular }}>You're a Plus member, {days} day{days === 1 ? '' : 's'} left</Text>
            </View>
          ) : (
            <ShineButton title={`Start my ${PLUS_TRIAL_DAYS}-day free trial`} onPress={openTrial} />
          )}
          {msg ? (
            <TextSemi style={{ fontSize: 12.5, textAlign: 'center' }} color={GOLD_DEEP}>{msg}</TextSemi>
          ) : (
            <TextBody style={{ fontSize: 12, textAlign: 'center' }}>
              Free for {PLUS_TRIAL_DAYS} days, then {rupee(PLUS_PRICE_MONTH)}/mo. Cancel anytime.
            </TextBody>
          )}
        </Animated.View>
      </Animated.ScrollView>

      <VipTrialModal visible={showModal} onAccept={acceptTrial} onDeny={() => setShowModal(false)} />
      <ClaimPackFlow
        visible={showClaim}
        onClose={() => setShowClaim(false)}
        onStartShopping={() => { setShowClaim(false); router.replace('/(tabs)'); }}
      />
    </View>
  );
}
