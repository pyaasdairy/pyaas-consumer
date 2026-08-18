/**
 * PYAAS Plus - the loyalty membership tab. Plus is a paid membership whose core,
 * permanent value is service (priority slots, free delivery, member offers,
 * priority support). A "Price comparison ⇄ Monthly savings" toggle makes that
 * value concrete on a few PARAG milk SKUs (Plus member price vs regular), and a
 * sticky "₹99 / 30 days · Subscribe" bar joins straight from the wallet.
 * Membership state lives per-user in localStore via lib/vip. Gold is used only
 * as the membership foil/badge accent on the dark card; everything else stays on
 * the flame/blue identity. Motion comes from the shared, gradient-free
 * components/Fx primitives.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Text, Modal, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { isBackendConfigured } from '../../lib/apiClient';
import { getProfile } from '../../lib/session';
import { FloatingParticles, ShineSweep, GlowPulse } from '../../components/Fx';
import { VIP_MILK_DISCOUNT_PCT,
  getVip,
    purchaseMembership,
  cancelVip,
  InsufficientWalletError,
  vipActive,
  vipDaysLeft,
  vipOnTrial,
  vipPriceFor,
  PLUS_PRICE_MONTH,
  PLUS_PERIOD_DAYS,
  type VipMembership,
} from '../../lib/vip';
import { useCatalog } from '../../lib/catalog';
import { DELIVERY_FEE } from '../../lib/api';
import { useWallet } from '../../store/wallet';


// Membership accent colours. Gold is the foil/badge only; the card sits on the
// warm-ink surface so the gold reads as a real foil rather than a colour wash.
const INK = colors.ink;
const GOLD = colors.gold;
const GOLD_DEEP = colors.goldDeep;

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; color: string }[] = [
  { icon: 'flash', title: 'Priority slots', body: 'The first morning delivery window, reserved for you every day.', color: colors.flameDeep },
  { icon: 'bicycle', title: 'Free delivery', body: 'No delivery fee on any order, however small.', color: colors.blue },
  // The two perks below describe what the app ACTUALLY does. "Early access to
  // new launches and member-only drops" needed a member-only flag on the catalog
  // that does not exist, and "a faster line to the team" needed a support desk
  // that does not exist either (support is an email handoff). Selling either was
  // a claim the binary could not honour.
  { icon: 'pricetag', title: 'Member price on milk', body: `${VIP_MILK_DISCOUNT_PCT}% off every milk SKU, applied at checkout.`, color: colors.flame },
  { icon: 'wallet', title: 'One flat month', body: 'Thirty days of Plus. It does not auto-renew, so you are never billed by surprise.', color: GOLD_DEEP },
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
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: fonts.serif, letterSpacing: 1.5 }}>PYAAS PLUS</Text>
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
  // DB-driven: the in-stock milk SKUs (store-manager-controlled) for the Plus
  // price comparison — never a hardcoded id list, so it only shows what sells.
  const catalog = useCatalog();
  const COMPARE = useMemo(() => catalog.filter((p) => p.category === 'milk' && !p.outOfStock).slice(0, 4), [catalog]);
  const [m, setM] = useState<VipMembership | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [focused, setFocused] = useState(true);
  // Plus value section: compare member vs regular price, or the monthly saving.
  const [priceView, setPriceView] = useState<'price' | 'savings'>('price');
  // Paid (wallet-deduct) join flow.
  const [showBuy, setShowBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const walletBalance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  // RESUME AFTER RECHARGE: the shortfall path sends the member to /recharge
  // with returnTo=/(tabs)/vip?resume=plus. Landing back, re-open the join
  // sheet ONCE (never auto-charge — the confirm tap stays theirs), so "top up
  // to join Plus" actually finishes in a join instead of a dead tab.
  const { resume } = useLocalSearchParams<{ resume?: string }>();
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resume !== 'plus' || resumedRef.current) return;
    resumedRef.current = true;
    router.setParams({ resume: undefined });
    if (!vipActive(m)) setShowBuy(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, m]);

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
      void refreshWallet();
      bob.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
      return () => {
        setFocused(false);
        cancelAnimation(bob);
      };
    }, [bob, refreshWallet])
  );

  const active = vipActive(m);
  const days = vipDaysLeft(m);
  const onTrial = vipOnTrial(m);



  // Paid join: a Confirm dialog, then a wallet deduct (same path as an order).
  function openBuy() {
    haptics.press();
    // FOUNDER'S CALL (18 Aug): paid joins are LIVE. The ₹99 moves through the
    // wallet (Razorpay-funded, server-side ledger). KNOWN GAP owned by the
    // backend: the membership FLAG is still device-local until Daaku persists
    // memberships server-side — flagged in the handoff, accepted for launch.
    setBuyErr('');
    setShowBuy(true);
  }
  async function confirmBuy() {
    setBuying(true);
    setBuyErr('');
    try {
      const next = await purchaseMembership();
      await refreshWallet();
      setM(next);
      setShowBuy(false);
      haptics.success();
      setMsg(next.charged
        ? `You're a PYAAS Plus member. ${rupee(PLUS_PRICE_MONTH)} was deducted from your wallet.`
        : `You're already a PYAAS Plus member for this month.`);
    } catch (e) {
      if (e instanceof InsufficientWalletError) {
        // Wallet-first shortfall → recharge, then land back on this tab.
        setShowBuy(false);
        const snap = Math.max(100, Math.ceil(e.shortfall / 50) * 50);
        const qs = new URLSearchParams({
          min: String(Math.ceil(e.shortfall)),
          amount: String(snap),
          returnTo: '/(tabs)/vip?resume=plus',
          reason: 'to join Plus',
        }).toString();
        router.push(`/recharge?${qs}`);
      } else {
        setBuyErr('Could not complete the purchase. Please try again.');
      }
    } finally {
      setBuying(false);
    }
  }

  // Cancel — honours the "cancel anytime" promise. Cancel is IMMEDIATE
  // (founder's call): perks end the moment it's confirmed, no run-out period.
  function confirmCancel() {
    haptics.press();
    Alert.alert(
      'Cancel PYAAS Plus?',
      'Cancelling ends your Plus perks immediately. Unused days are not refunded. You can rejoin anytime.',
      [
        { text: 'Keep Plus', style: 'cancel' },
        {
          text: 'Cancel membership',
          style: 'destructive',
          onPress: async () => {
            try {
              const next = await cancelVip();
              setM(next);
              haptics.success();
              setMsg('Plus cancelled. Your perks have ended.');
            } catch {
              setMsg('Could not cancel just now. Please try again.');
            }
          },
        },
      ],
    );
  }

  // What the card shows adapts to membership state.
  const cardNum = active ? days : PLUS_PERIOD_DAYS;
  const cardL2 = active ? 'LEFT' : 'DAYS';
  const upperName = (name ?? 'PYAAS FAMILY').toUpperCase();
  const memberLine = active ? (onTrial ? 'TRIAL ACTIVE' : upperName) : upperName;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: active ? 130 : 176, paddingHorizontal: spacing.lg, gap: spacing.lg }}
      >
        {/* HERO */}
        <Animated.View style={[{ height: 360, alignItems: 'center', justifyContent: 'center' }, heroStyle]}>
          {focused ? <FloatingParticles count={14} height={360} /> : null}
          <Animated.View entering={enterUp(60)} style={{ alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: GOLD_DEEP, fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 4 }}>PYAAS PLUS MEMBERSHIP</Text>
          </Animated.View>
          <HoloCard scrollY={scrollY} num={cardNum} lineOne="DAYS" lineTwo={cardL2} memberLine={memberLine} />
          <Animated.View entering={enterUp(140)} style={{ marginTop: 22, alignItems: 'center' }}>
            <TextSemi style={{ fontSize: 15, textAlign: 'center' }} color={INK}>
              {active
                ? `You're a Plus member, ${days} day${days === 1 ? '' : 's'} left this period.`
                : 'Join PYAAS Plus'}
            </TextSemi>
            {!active ? (
              <TextBody style={{ fontSize: 13, textAlign: 'center', marginTop: 2 }}>
                {rupee(PLUS_PRICE_MONTH)}/month · member prices, free delivery, priority slots · cancel anytime
              </TextBody>
            ) : null}
          </Animated.View>
        </Animated.View>

        {/* TOP CTA — the ONE way in: pay ₹99/month. A short wallet routes
            through the Razorpay recharge and completes on return. */}
        {!active ? (
          <Animated.View entering={enterUp(50)} style={{ gap: 10, marginTop: -8 }}>
            <ShineButton title={`Become a Plus member · ${rupee(PLUS_PRICE_MONTH)}/mo`} onPress={openBuy} />
            <TextBody style={{ fontSize: 12, textAlign: 'center' }}>
              Paid securely via Razorpay through your PYAAS Wallet. Cancel anytime, no lock-in.
            </TextBody>
          </Animated.View>
        ) : null}

        {/* ACTIVE-member actions: renew early (extends the period; also where the
            "Renew Plus" home nudge lands) + a real Cancel that honours "cancel anytime". */}
        {active ? (
          <Animated.View entering={enterUp(50)} style={{ gap: 10, marginTop: -8 }}>
            {/* Renew only near expiry — it EXTENDS the period (adds a month on top of
                the remaining days), so it's shown when it's actually useful, not to a
                member with weeks left. */}
            {!onTrial && days <= 7 ? (
              <Tap onPress={openBuy} weight="medium">
                <View style={{ height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.flameDeep }}>
                  <Text style={{ color: colors.flameDeep, fontSize: 15, fontFamily: fonts.sansBold }}>Renew now · +30 days · {rupee(PLUS_PRICE_MONTH)} from wallet</Text>
                </View>
              </Tap>
            ) : null}
            <Tap haptic={false} onPress={confirmCancel} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Cancel membership</TextMed>
            </Tap>
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
                  : `${rupee(PLUS_PRICE_MONTH)} per month. Cancel anytime, no lock-in.`}
              </TextBody>
            </View>
          </View>
        </Animated.View>

        {/* PLUS VALUE · Price comparison ⇄ Monthly savings */}
        <Animated.View entering={enterUp(75)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 18 }} color={INK}>What Plus saves you</TextSemi>

          {/* Toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: 4, ...shadow.soft }}>
            {([['price', 'Price comparison'], ['savings', 'Monthly savings']] as const).map(([key, label]) => {
              const on = priceView === key;
              return (
                <Tap key={key} onPress={() => { haptics.press(); setPriceView(key); }} style={{ flex: 1 }}>
                  <View style={{ paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', backgroundColor: on ? colors.action : 'transparent' }}>
                    <Text style={{ color: on ? colors.onAction : colors.inkSoft, fontFamily: fonts.sansSemi, fontSize: 13.5 }}>{label}</Text>
                  </View>
                </Tap>
              );
            })}
          </View>

          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 12, ...shadow.soft }}>
            {COMPARE.map((p) => {
              const reg = p.price;
              const vip = vipPriceFor(reg);
              const monthly = (reg - vip) * PLUS_PERIOD_DAYS;
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {p.image ? <Image source={p.image} style={{ width: '80%', height: '80%' }} resizeMode="contain" /> : <Ionicons name="water" size={18} color={colors.flameDeep} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextSemi style={{ fontSize: 14 }} color={INK} numberOfLines={1}>{p.name}</TextSemi>
                    <TextBody style={{ fontSize: 11.5 }}>{p.variant}</TextBody>
                  </View>
                  {priceView === 'price' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: colors.inkMute, fontFamily: fonts.sansMed }}>Regular</Text>
                        <Text style={{ fontSize: 13, color: colors.inkMute, fontFamily: fonts.sansSemi, textDecorationLine: 'line-through', ...tabular }}>{rupee(reg)}</Text>
                      </View>
                      <View style={{ backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: GOLD, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 8.5, color: GOLD_DEEP, fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>PLUS</Text>
                        <Text style={{ fontSize: 14, color: INK, fontFamily: fonts.serifBlack, ...tabular }}>{rupee(vip)}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, color: colors.flameDeep, fontFamily: fonts.serifBlack, ...tabular }}>{rupee(monthly)}</Text>
                      <Text style={{ fontSize: 10, color: colors.inkMute, fontFamily: fonts.sansMed }}>saved / month</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {/* Free delivery — the always-on Plus value */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
              <Ionicons name="bicycle" size={16} color={colors.blue} />
              <TextBody style={{ flex: 1, fontSize: 12 }}>
                {priceView === 'price'
                  ? 'Plus members pay member price on milk, and delivery is always free.'
                  : `Plus a further ${rupee(DELIVERY_FEE * PLUS_PERIOD_DAYS)}/mo saved on delivery for a daily subscriber.`}
              </TextBody>
            </View>
          </View>
          <TextBody style={{ fontSize: 10.5, textAlign: 'center' }} color={colors.inkMute}>
            Member prices shown for a daily subscriber · savings compare {PLUS_PERIOD_DAYS} daily deliveries at member vs regular price.
          </TextBody>
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
              { n: '1', icon: 'card' as const, title: 'Join for ' + rupee(PLUS_PRICE_MONTH) + '/mo', body: 'Pay securely via Razorpay through your PYAAS Wallet. That is the only way in — nothing is free.' },
              { n: '2', icon: 'flash' as const, title: 'Enjoy the perks', body: 'Priority morning slots, free delivery and member price on milk, from day one.' },
              { n: '3', icon: 'refresh' as const, title: 'Renew or cancel', body: 'It never auto-renews. Cancel whenever you like; perks stop when you do, and there is no lock-in.' },
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
            delivery is always free, and you pay the member price on milk. Cancel anytime, no lock-in.
          </TextBody>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={enterUp(200)} style={{ gap: 10, marginTop: 4 }}>
          {active ? (
            <View style={{ borderRadius: radius.pill, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, ...shadow.card }}>
              <Text style={{ color: INK, fontSize: 16, fontFamily: fonts.sansBold, ...tabular }}>You're a Plus member, {days} day{days === 1 ? '' : 's'} left</Text>
            </View>
          ) : (
            <ShineButton title={`Become a Plus member · ${rupee(PLUS_PRICE_MONTH)}/mo`} onPress={openBuy} />
          )}
          {msg ? (
            <TextSemi style={{ fontSize: 12.5, textAlign: 'center' }} color={GOLD_DEEP}>{msg}</TextSemi>
          ) : (
            <TextBody style={{ fontSize: 12, textAlign: 'center' }}>
              {rupee(PLUS_PRICE_MONTH)}/month via Razorpay. Cancel anytime.
            </TextBody>
          )}
        </Animated.View>
      </Animated.ScrollView>

      {/* Sticky join bar — "₹99 / 30 days · Subscribe" (non-members). Sits above
          the floating tab pill and deducts straight from the wallet (openBuy). */}
      {!active ? (
        <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: insets.bottom + 82, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingLeft: spacing.lg, paddingRight: 6, height: 64, ...shadow.e3 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              <Text style={{ fontFamily: fonts.serifBlack, fontSize: 22, letterSpacing: -0.4, color: INK, ...tabular }}>{rupee(PLUS_PRICE_MONTH)}</Text>
              <Text style={{ fontFamily: fonts.sansSemi, fontSize: 12.5, color: colors.inkSoft }}>/ {PLUS_PERIOD_DAYS} days</Text>
            </View>
            <Text style={{ fontFamily: fonts.sansMed, fontSize: 11, color: colors.inkMute }}>From your wallet · cancel anytime</Text>
          </View>
          <Tap onPress={openBuy} weight="medium">
            <View style={{ height: 50, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <Text style={{ color: colors.white, fontFamily: fonts.sansBold, fontSize: 15.5 }}>Join for 30 days</Text>
            </View>
          </Tap>
        </View>
      ) : null}

      {/* Confirm wallet deduct for a paid month. */}
      <Modal visible={showBuy} transparent statusBarTranslucent animationType="fade" onRequestClose={() => !buying && setShowBuy(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
            <View style={{ backgroundColor: colors.flameDeep, padding: spacing.lg, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="wallet" size={24} color={colors.white} />
              </View>
              <Text style={{ color: colors.white, fontSize: 20, fontFamily: fonts.serif }}>Confirm purchase</Text>
            </View>
            <View style={{ padding: spacing.lg, gap: 14 }}>
              <Text style={{ fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: fonts.sansMed, color: colors.ink }}>
                {rupee(PLUS_PRICE_MONTH)} will be deducted from your wallet for one month of PYAAS Plus.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.cream, borderRadius: radius.md, padding: spacing.md }}>
                <TextBody style={{ fontSize: 13 }}>Wallet balance</TextBody>
                <TextSemi style={{ fontSize: 14, ...tabular }} color={walletBalance >= PLUS_PRICE_MONTH ? colors.blue : colors.danger}>{rupee(walletBalance)}</TextSemi>
              </View>
              {buyErr ? <TextBody color={colors.danger} style={{ fontSize: 12.5, textAlign: 'center' }}>{buyErr}</TextBody> : null}
              <Tap onPress={buying ? undefined : confirmBuy} weight="medium">
                <View style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: buying ? 0.85 : 1, ...shadow.soft }}>
                  {buying ? <ActivityIndicator color={colors.white} /> : null}
                  <Text style={{ color: colors.white, fontSize: 16, fontFamily: fonts.sansBold }}>{buying ? 'Deducting…' : `Pay ${rupee(PLUS_PRICE_MONTH)} from wallet`}</Text>
                </View>
              </Tap>
              <Tap haptic={false} onPress={() => !buying && setShowBuy(false)} style={{ alignItems: 'center', paddingVertical: 2 }}>
                <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Cancel</TextMed>
              </Tap>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
