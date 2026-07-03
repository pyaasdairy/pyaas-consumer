import React, { useCallback, useState } from 'react';
import { View, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from '../../components/ui';
import { enterUp } from '../../lib/motion';
import { PRODUCTS } from '../../constants/products';
import { VIP_DISCOUNT, VIP_PRICE_PER_MONTH, VIP_TRIAL_DAYS, vipPrice } from '../../lib/pricing';
import { getVip, startVipTrial, vipActive, vipDaysLeft, type VipMembership } from '../../lib/vip';
import { VipTrialModal } from '../../components/VipTrialModal';
import { FloatingParticles, ShineSweep, GlowPulse, useCountUp } from '../../components/VipFx';

const INK = '#2A1018';
const GOLD = '#F4D061';
const GOLD_DEEP = '#C9A24B';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; color: string }[] = [
  { icon: 'pricetags', title: 'Member prices', body: `Up to ${Math.round(VIP_DISCOUNT * 100)}% off across milk, ghee and more.`, color: GOLD_DEEP },
  { icon: 'flash', title: 'Priority slots', body: 'First morning delivery window, every day.', color: colors.roseDeep },
  { icon: 'gift', title: 'Member offers', body: 'Exclusive coupons and founding-family drops.', color: colors.rose },
  { icon: 'rocket', title: 'Free upgrades', body: 'Free delivery and surprise add-ons.', color: GOLD_DEEP },
];

// ── Foil "120 DAYS FREE" · engraved (doubled-View) + a white shimmer band ─────
function FoilNumber({ num, lineOne, lineTwo }: { num: number; lineOne: string; lineTwo: string }) {
  const sh = useSharedValue(0);
  // Run the shimmer only while the tab is focused; cancel on blur so the loop
  // doesn't keep ticking on the UI thread from other tabs.
  useFocusEffect(
    useCallback(() => {
      sh.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, false);
      return () => cancelAnimation(sh);
    }, [sh])
  );
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sh.value, [0, 1], [-90, 230]) }, { rotate: '20deg' }],
    opacity: interpolate(sh.value, [0, 0.25, 0.75, 1], [0, 0.85, 0.85, 0]),
  }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' }}>
      <View>
        {/* dark engraved copy underneath */}
        <Text style={{ position: 'absolute', top: 2, left: 0, fontSize: 60, fontFamily: fonts.serifBlack, color: 'rgba(0,0,0,0.5)', letterSpacing: -2, ...tabular }}>{num}</Text>
        <Text style={{ fontSize: 60, fontFamily: fonts.serifBlack, color: GOLD, letterSpacing: -2, ...tabular }}>{num}</Text>
      </View>
      <View style={{ marginBottom: 12, marginLeft: 9 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontFamily: fonts.sansBold, letterSpacing: 2 }}>{lineOne}</Text>
        <Text style={{ color: GOLD, fontSize: 15, fontFamily: fonts.sansBold, letterSpacing: 2 }}>{lineTwo}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -12, bottom: -12, left: 0, width: 44 }, band]}>
        <LinearGradient colors={['transparent', 'rgba(255,255,255,0.9)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

// ── The holographic membership card (hero) ───────────────────────────────────
function HoloCard({ scrollY, num, lineOne, lineTwo, memberLine }: { scrollY: SharedValue<number>; num: number; lineOne: string; lineTwo: string; memberLine: string }) {
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const sheen = useSharedValue(0);
  const entered = useSharedValue(0);

  // Signature: the card flips up to face you each time the tab is focused, then
  // idles. Loops start on focus and are cancelled on blur so nothing keeps
  // ticking on the UI thread from other tabs.
  useFocusEffect(
    useCallback(() => {
      entered.value = 0;
      entered.value = withDelay(160, withSpring(1, { damping: 14, stiffness: 90 }));
      tiltY.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, true);
      tiltX.value = withRepeat(withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.ease) }), -1, true);
      sheen.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
      const h = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 330);
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
    opacity: interpolate(sheen.value, [0, 0.1, 0.9, 1], [0, 0.9, 0.9, 0]),
  }));

  return (
    <Animated.View style={[{ width: 320, height: 200, borderRadius: 22, shadowColor: '#F36CB5', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 22 } }, cardStyle]}>
      <View style={{ flex: 1, borderRadius: 22, overflow: 'hidden' }}>
        <LinearGradient colors={[INK, '#4A2030', INK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}>
          {/* edge highlight + thickness shadow */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.5)' }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: 'rgba(0,0,0,0.30)' }} />

          {/* iridescent sheen */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -40, bottom: -40, width: 130 }, sheenStyle]}>
            <LinearGradient colors={['transparent', 'rgba(244,208,97,0.0)', 'rgba(255,255,255,0.85)', 'rgba(244,145,204,0.6)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
          </Animated.View>

          {/* top row: issuer + chip */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Image source={require('../../assets/pyaas-logo-white-trim.png')} style={{ width: 92, height: 92 / 3.555 }} resizeMode="contain" />
            <LinearGradient colors={[GOLD, GOLD_DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 34, height: 26, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
              <View style={{ flex: 1, margin: 4, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
            </LinearGradient>
          </View>

          {/* foil number */}
          <FoilNumber num={num} lineOne={lineOne} lineTwo={lineTwo} />

          {/* bottom row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: fonts.sansBold, letterSpacing: 2 }}>MEMBER</Text>
              <Text style={{ color: '#fff', fontSize: 13, fontFamily: fonts.sansBold, letterSpacing: 1.5 }}>{memberLine}</Text>
            </View>
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: fonts.serif, letterSpacing: 1.5 }}>PYAAS VIP</Text>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

// ── Perk marker · solid icon badge (no emoji, no gradient) ───────────────────
function PerkGem({ perk, bob, phase }: { perk: (typeof PERKS)[number]; bob: SharedValue<number>; phase: number }) {
  const st = useAnimatedStyle(() => {
    const v = (bob.value + phase) % 1;
    return { transform: [{ scale: interpolate(v, [0, 0.5, 1], [1, 1.05, 1]) }] };
  });
  return (
    <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 46, height: 46, borderRadius: 14, backgroundColor: perk.color, alignItems: 'center', justifyContent: 'center', ...shadow.soft }, st]}>
        <Ionicons name={perk.icon} size={22} color="#fff" />
      </Animated.View>
    </View>
  );
}

// ── Glowing, shining CTA pill ─────────────────────────────────────────────────
function ShineButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={{ marginHorizontal: 4 }}>
      <GlowPulse color="#F36CB5" radius={radius.pill} />
      <Tap onPress={onPress}>
        <View style={{ borderRadius: radius.pill, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.roseDeep, ...shadow.card }}>
          <Text style={{ color: '#fff', fontSize: 16.5, fontFamily: fonts.sansBold, letterSpacing: 0.3 }}>{title}</Text>
          <ShineSweep dur={2400} travel={360} bandWidth={70} angle="16deg" delay={400} />
        </View>
      </Tap>
    </View>
  );
}

export default function Vip() {
  const insets = useSafeAreaInsets();
  const [m, setM] = useState<VipMembership | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [focused, setFocused] = useState(true);
  const compare = PRODUCTS.slice(0, 5);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // Hero dissolves as you scroll into the tiers (looks intentional + lets the
  // looping hero work stop mattering once it is off-screen).
  const heroStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 300], [1, 0], 'clamp') }));
  const bob = useSharedValue(0); // single driver for all four perk gems

  // Refresh membership, run the gem driver, and mount the looping decorations
  // ONLY while focused · everything stops when the user leaves the tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      getVip().then(setM);
      bob.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
      return () => {
        setFocused(false);
        cancelAnimation(bob);
      };
    }, [bob])
  );

  const active = vipActive(m);
  const days = vipDaysLeft(m);
  const onTrial = m?.status === 'trial' && active;

  const saved = useCountUp(m?.total_saved ?? 0, 1100, m != null);

  // Honest free-trial flow: open the existing VIP trial modal (no fake purchase).
  function startTrial() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowModal(true);
  }
  async function acceptTrial() {
    setShowModal(false);
    // Create a real membership row · the card flips to TRIAL ACTIVE and member
    // pricing applies immediately across the app.
    try {
      const m = await startVipTrial();
      setM(m);
      await AsyncStorage.setItem('pyaas_vip_prompt_seen', '1');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMsg(`Your ${VIP_TRIAL_DAYS}-day VIP trial is live. Member pricing is on across the app.`);
    } catch (e: any) {
      setMsg('Could not start your trial just now. Please try again.');
    }
  }

  // What the card displays adapts to membership state.
  const cardNum = active ? days : VIP_TRIAL_DAYS;
  const cardL2 = active ? 'LEFT' : 'FREE';
  const memberLine = active ? (onTrial ? 'TRIAL ACTIVE' : 'FOUNDING FAMILY') : 'FOUNDING FAMILY';

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
            <Text style={{ color: GOLD_DEEP, fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 4 }}>PYAAS VIP MEMBERSHIP</Text>
          </Animated.View>
          <HoloCard scrollY={scrollY} num={cardNum} lineOne="DAYS" lineTwo={cardL2} memberLine={memberLine} />
          <Animated.View entering={enterUp(140)} style={{ marginTop: 22, alignItems: 'center' }}>
            <TextSemi style={{ fontSize: 15, textAlign: 'center' }} color={INK}>
              {active
                ? (onTrial ? `Your free trial is live · ${days} day${days === 1 ? '' : 's'} of VIP left.` : `You're VIP · renews in ${days} days.`)
                : 'Founding-family launch offer'}
            </TextSemi>
            {!active ? (
              <TextBody style={{ fontSize: 13, textAlign: 'center', marginTop: 2 }}>
                {VIP_TRIAL_DAYS} days on us · no card needed · cancel anytime
              </TextBody>
            ) : null}
          </Animated.View>
        </Animated.View>

        {/* MONEY SAVED WITH VIP · headline savings number (counts up on load) */}
        <Animated.View entering={enterUp(70)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.goldSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: GOLD, padding: spacing.lg, ...shadow.soft }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: GOLD }}>
              <Text style={{ color: GOLD, fontSize: 25, fontFamily: fonts.serif }}>₹</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: GOLD_DEEP, fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 1.4 }}>MONEY SAVED WITH VIP</Text>
              <Text style={{ fontFamily: fonts.serifBlack, fontSize: 34, letterSpacing: -0.5, marginTop: 1, color: INK, ...tabular }}>{rupee(saved)}</Text>
              <TextBody style={{ fontSize: 12.5, marginTop: 1 }}>
                {active && saved > 0
                  ? 'Across every order you place as a member.'
                  : `Members save ~${Math.round(VIP_DISCOUNT * 100)}% on every single order`}
              </TextBody>
            </View>
          </View>
        </Animated.View>

        {/* BENEFITS · bespoke gems */}
        <Animated.View entering={enterUp(80)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 18 }} color={INK}>What VIP unlocks</TextSemi>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(243,108,181,0.25)', padding: spacing.md, gap: 14, ...shadow.soft }}>
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

        {/* NORMAL vs VIP */}
        <Animated.View entering={enterUp(120)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 18 }} color={INK}>Normal vs VIP</TextSemi>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: GOLD, overflow: 'hidden', ...shadow.card }}>
            <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.goldSoft }}>
              <TextSemi style={{ flex: 1, fontSize: 13 }}>Product</TextSemi>
              <TextSemi style={{ width: 76, fontSize: 13, textAlign: 'right' }} color={colors.inkMute}>Normal</TextSemi>
              <TextSemi style={{ width: 76, fontSize: 13, textAlign: 'right' }} color={GOLD_DEEP}>VIP</TextSemi>
            </View>
            {compare.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <TextMed style={{ fontSize: 14 }} numberOfLines={1}>{p.name}</TextMed>
                  <TextBody style={{ fontSize: 12 }}>{p.variant}</TextBody>
                </View>
                <TextBody style={{ width: 76, fontSize: 14, textAlign: 'right', textDecorationLine: 'line-through' }} color={colors.inkMute}>{rupee(p.price)}</TextBody>
                <TextSemi style={{ width: 76, fontSize: 15, textAlign: 'right' }} color={GOLD_DEEP}>{rupee(vipPrice(p))}</TextSemi>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: colors.goldSoft }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD_DEEP }} />
              <TextSemi color={GOLD_DEEP} style={{ fontSize: 13 }}>
                {active && saved > 0
                  ? `You've saved ${rupee(saved)} as a VIP so far`
                  : `VIPs save ~${Math.round(VIP_DISCOUNT * 100)}% on every single order`}
              </TextSemi>
            </View>
          </View>
        </Animated.View>

        {/* WHY */}
        <Animated.View entering={enterUp(160)} style={{ backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(243,108,181,0.25)', padding: spacing.lg, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 16, marginBottom: 6 }} color={INK}>Why members love VIP</TextSemi>
          <TextBody style={{ fontSize: 13.5, lineHeight: 21 }}>
            For the next {VIP_TRIAL_DAYS} days, VIP is completely free · member pricing on every order, the first
            delivery slot each morning, and offers reserved for our founding families. No card, no commitment;
            your savings are yours to keep, and you can cancel anytime.
          </TextBody>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={enterUp(200)} style={{ gap: 10, marginTop: 4 }}>
          {active ? (
            <View style={{ borderRadius: radius.pill, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, ...shadow.card }}>
              <Text style={{ color: INK, fontSize: 16, fontFamily: fonts.sansBold, ...tabular }}>You're a VIP · {days} day{days === 1 ? '' : 's'} left</Text>
            </View>
          ) : (
            <ShineButton title={`Start my ${VIP_TRIAL_DAYS} days free`} onPress={startTrial} />
          )}
          {msg ? (
            <TextSemi style={{ fontSize: 12.5, textAlign: 'center' }} color={GOLD_DEEP}>{msg}</TextSemi>
          ) : (
            <TextBody style={{ fontSize: 12, textAlign: 'center' }}>
              Free for {VIP_TRIAL_DAYS} days, then {rupee(VIP_PRICE_PER_MONTH)}/mo. Cancel anytime.
            </TextBody>
          )}
        </Animated.View>
      </Animated.ScrollView>

      <VipTrialModal visible={showModal} onAccept={acceptTrial} onDeny={() => setShowModal(false)} />
    </View>
  );
}
