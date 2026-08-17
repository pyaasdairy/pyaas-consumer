import React, { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../lib/haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from '../components/ui';
import { FloatingParticles, GlowPulse, useCountUp } from '../components/Fx';
import { resolveProduct } from '../lib/catalog';
import { formatWeekday } from '../lib/dates';

const GOLD = '#C9A24B';
const GOLD_BRIGHT = '#F4D061';
const INK = '#2A1018';

const FREQ_LABEL: Record<string, string> = { daily: 'Daily', alternate: 'Alternate', one_time: 'One Time', weekly: 'Weekly', custom: 'Custom' };

function CheckHero() {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(140, withSpring(1, { damping: 11, stiffness: 120 }));
    // Strong, unmistakable confirmation the moment the order screen lands.
    const h = setTimeout(() => haptics.confirm(), 240);
    return () => clearTimeout(h);
  }, [s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: s.value }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 124, height: 124 }}>
      <GlowPulse color={colors.flameDeep} radius={62} />
      <Animated.View style={[{ width: 98, height: 98, borderRadius: 49, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flameDeep, ...shadow.card }, st]}>
        <Ionicons name="checkmark" size={56} color="#fff" />
      </Animated.View>
    </View>
  );
}

export default function OrderConfirmed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, qty, freq, start, total, saved } = useLocalSearchParams<{ id: string; qty: string; freq: string; start: string; total: string; saved: string }>();
  const product = resolveProduct(String(id));
  const q = Number(qty) || 1;
  const totalN = Number(total) || 0;
  const savedN = Number(saved) || 0;
  const isOneTime = String(freq) === 'one_time';
  // Everything derives from the passed total + savings, so it always reconciles:
  // struck (pre-discount) = total + saved.
  const struckTotal = totalN + savedN;
  const savedCount = useCountUp(savedN, 1200);

  function close() {
    // Pop any pushed routes (product → confirmation) back to the tabs root.
    (router as any).dismissAll?.();
    router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <FloatingParticles count={16} height={420} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 120, paddingHorizontal: spacing.lg, gap: spacing.md }}>
        {/* Close */}
        <Tap haptic={false} onPress={close} style={{ alignSelf: 'flex-start', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
          <Ionicons name="close" size={22} color={INK} />
        </Tap>

        {/* Hero */}
        <View style={{ alignItems: 'center', gap: 8, marginTop: 4 }}>
          <CheckHero />
          <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ alignItems: 'center', gap: 4 }}>
            <Serif style={{ fontSize: 28 }} color={colors.flameDeep}>{isOneTime ? 'Order placed!' : 'Subscription set!'}</Serif>
            {start ? <TextMed style={{ fontSize: 15 }} color={INK}>Deliver on {formatWeekday(String(start))}</TextMed> : null}
          </Animated.View>
        </View>

        {/* Savings banner */}
        {savedN > 0 ? (
          <Animated.View entering={FadeInDown.duration(420).delay(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.goldSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: GOLD_BRIGHT, padding: spacing.md, ...shadow.soft }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldDeep, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="star" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <TextSemi style={{ fontSize: 15 }} color={INK}>
                You saved <TextSemi style={{ fontFamily: fonts.serifBlack, fontSize: 16, ...tabular }} color={colors.goldDeep}>{rupee(savedCount)}</TextSemi> on this order
              </TextSemi>
              <TextBody style={{ fontSize: 12.5 }}>with today’s offer</TextBody>
            </View>
          </Animated.View>
        ) : null}

        {/* Item */}
        {product ? (
          <Animated.View entering={FadeInDown.duration(420).delay(260)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={product.image} style={{ width: '82%', height: '82%' }} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <TextSemi style={{ fontSize: 15.5 }}>{product.name}</TextSemi>
                <TextBody style={{ fontSize: 12.5 }}>{product.variant} · x{q}</TextBody>
                <Pill label={isOneTime ? 'One-time order' : `${FREQ_LABEL[String(freq)] ?? 'Daily'} subscription`} bg={colors.flameSoft} color={colors.flameDeep} style={{ marginTop: 4 }} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {savedN > 0 ? <TextBody style={{ fontSize: 12.5, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(struckTotal)}</TextBody> : null}
                <Serif style={{ fontFamily: fonts.serifBlack, fontSize: 18, ...tabular }} color={GOLD}>{rupee(totalN)}</Serif>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* To Pay breakdown */}
        <Animated.View entering={FadeInDown.duration(420).delay(320)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
          <View style={{ padding: spacing.md, gap: 10 }}>
            <Row label="Items total (MRP)" value={rupee(struckTotal)} />
            {savedN > 0 ? <Row label="Savings" value={`- ${rupee(savedN)}`} valueColor={colors.blue} labelColor={colors.blue} /> : null}
            <View style={{ height: 1, backgroundColor: colors.line }} />
            <Row label="To pay" value={rupee(totalN)} bold />
          </View>
          <View style={{ backgroundColor: '#F3FBF6', paddingVertical: 10, paddingHorizontal: spacing.md }}>
            <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.blue}>Amount is only charged after your order is delivered.</TextBody>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(360)}>
          <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.blue}>Pause, skip or remove anytime · you're always in control.</TextBody>
        </Animated.View>
      </ScrollView>

      {/* CTAs */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, gap: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderTopWidth: 1, borderTopColor: colors.line }}>
        <Tap onPress={() => { (router as any).dismissAll?.(); router.push('/subscriptions'); }}>
          <View style={{ height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.flameDeep, ...shadow.card }}>
            <TextSemi color={colors.white} style={{ fontSize: 16 }}>View my subscriptions</TextSemi>
          </View>
        </Tap>
        <Tap onPress={close}>
          <View style={{ height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.flameDeep }}>
            <TextSemi color={colors.flameDeep} style={{ fontSize: 16 }}>Continue shopping</TextSemi>
          </View>
        </Tap>
      </View>
    </View>
  );
}

function Row({ label, value, bold, valueColor, labelColor }: { label: string; value: string; bold?: boolean; valueColor?: string; labelColor?: string }) {
  const L = bold ? TextSemi : TextBody;
  const V = bold ? Serif : TextMed;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <L style={{ fontSize: bold ? 16 : 14 }} color={labelColor ?? (bold ? INK : colors.inkSoft)}>{label}</L>
      <V style={{ fontSize: bold ? 19 : 14, fontFamily: bold ? fonts.serifBlack : fonts.sansSemi, ...tabular }} color={valueColor ?? INK}>{value}</V>
    </View>
  );
}
