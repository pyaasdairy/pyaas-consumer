import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, Tap, Stepper, Divider } from '../../components/ui';
import { Glass } from '../../components/Glass';
import { ShineSweep, GlowPulse } from '../../components/VipFx';
import { StartDatePicker } from '../../components/StartDatePicker';
import { getProduct, discountPct } from '../../constants/products';
import { vipPrice } from '../../lib/pricing';
import { getVip, vipActive } from '../../lib/vip';
import { createSubscription, type Frequency } from '../../lib/subscriptions';
import { tomorrowISO, formatShort } from '../../lib/dates';
import { useWallet } from '../../store/wallet';

const GOLD = '#C9A24B';
const GOLD_BRIGHT = '#F4D061';

const SUB_TYPES: { key: Frequency; label: string; sub: string }[] = [
  { key: 'daily', label: 'Daily', sub: 'Every morning' },
  { key: 'alternate', label: 'Alternate', sub: 'Every 2nd day' },
  { key: 'one_time', label: 'One Time', sub: 'Just once' },
];

// ── Top banner: "Order by midnight · Delivery by 7 AM" ────────────────────────
function DeliveryBanner({ topInset }: { topInset: number }) {
  return (
    <View style={{ overflow: 'hidden', backgroundColor: colors.roseDeep, paddingTop: topInset + 7, paddingBottom: 9, paddingHorizontal: spacing.lg, alignItems: 'center' }}>
      <TextSemi color={colors.white} style={{ fontSize: 12.5, letterSpacing: 0.5 }}>Order by midnight · Delivery by 7 AM</TextSemi>
      <ShineSweep dur={3200} travel={520} bandWidth={90} delay={700} />
    </View>
  );
}

// ── Subscription-type card (radio + label, animated select) ───────────────────
function SubTypeCard({ label, sub, active, onPress, index }: { label: string; sub: string; active: boolean; onPress: () => void; index: number }) {
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    s.value = withTiming(active ? 1 : 0, { duration: 220, easing: Easing.out(Easing.ease) });
  }, [active, s]);
  // A subtle lift (not a scale) so the selected card never overflows its slot.
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * s.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View entering={FadeInDown.duration(360).delay(index * 70)} style={{ flex: 1 }}>
      <Tap onPress={onPress}>
        <Animated.View style={[{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: active ? colors.roseDeep : colors.line, backgroundColor: active ? '#FFF1F8' : colors.white, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 6, ...shadow.soft }, cardStyle]}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.roseDeep : colors.inkMute, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.roseDeep }, dotStyle]} />
          </View>
          <TextSemi style={{ fontSize: 14 }} color={active ? colors.roseDeep : colors.ink}>{label}</TextSemi>
          <TextBody style={{ fontSize: 10.5, textAlign: 'center' }}>{sub}</TextBody>
        </Animated.View>
      </Tap>
    </Animated.View>
  );
}

export default function ProductDetail() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const product = getProduct(String(id));

  const [qty, setQty] = useState(1);
  // Milk defaults to a Daily subscription; non-subscribable items (ghee) are a
  // one-time order · both go through the same Proceed → order flow (no cart).
  const [freq, setFreq] = useState<Frequency>(product?.subscribable === false ? 'one_time' : 'daily');
  // Honour a start date passed in (e.g. the day chosen in the home delivery strip),
  // but never earlier than tomorrow.
  const [startDate, setStartDate] = useState(start && start > tomorrowISO() ? start : tomorrowISO());
  const [showCal, setShowCal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [shortfall, setShortfall] = useState(0);
  const refreshWallet = useWallet((s) => s.refresh);

  useEffect(() => {
    getVip().then((m) => setIsMember(vipActive(m)));
  }, []);
  // Changing qty/frequency changes the cost, so re-arm the wallet gate.
  useEffect(() => { setShortfall(0); setErr(''); }, [qty, freq]);

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
        <TextBody>Product not found.</TextBody>
      </View>
    );
  }

  const pct = discountPct(product);
  // Only members pay the member price; everyone else pays the normal price. We
  // never show a struck "MRP" that doesn't exist (no-MRP pouches for non-members).
  const hasMrp = !!product.mrp && product.mrp > product.price;
  const unit = isMember ? vipPrice(product) : product.price;
  const strike = isMember ? (product.mrp ?? product.price) : hasMrp ? (product.mrp as number) : 0;
  const savedPer = strike > unit ? strike - unit : 0;
  const total = unit * qty;
  const headlineColor = isMember ? GOLD : colors.roseDeep;
  const subscribable = product.subscribable;

  async function proceed() {
    if (!product) return;
    setBusy(true); setErr('');
    try {
      // Deliveries are paid from the prepaid wallet, so the wallet must cover
      // this order before it can be placed.
      await refreshWallet();
      const bal = useWallet.getState().balance;
      if (bal < total) {
        setShortfall(total - bal);
        setErr(`Your wallet has ${rupee(bal)}. Add ${rupee(total - bal)} to place this order.`);
        return;
      }
      await createSubscription({ productId: product.id, variant: product.variant, qty, unitPrice: unit, frequency: freq, startDate });
      // The order-confirmed screen fires the strong confirmation haptic on mount.
      router.push({
        pathname: '/order-confirmed',
        params: { id: product.id, qty: String(qty), freq, start: startDate, total: String(total), saved: String(savedPer * qty), member: isMember ? '1' : '0' },
      });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not set up your subscription. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <DeliveryBanner topInset={insets.top} />

        {/* Image header */}
        <View style={{ backgroundColor: colors.cream, paddingBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 12 }}>
            <Tap onPress={() => router.back()} style={iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Tap>
          </View>
          <Image source={product.image} style={{ width: '100%', height: 280 }} contentFit="contain" transition={250} />
        </View>

        {/* Body */}
        <View style={{ padding: spacing.lg, gap: 12 }}>
          <Animated.View entering={FadeInDown.duration(420)} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pill label={product.tag} bg={colors.sageSoft} color={colors.sage} />
              {pct ? <Pill label={`${pct}% OFF`} bg="rgba(199,91,110,0.12)" color={colors.roseDeep} /> : null}
            </View>

            <Serif style={{ fontSize: 28, lineHeight: 32 }}>{product.name}</Serif>
            <TextMed color={colors.inkSoft} style={{ fontSize: 14.5 }}>{product.variant} · {product.unit}</TextMed>

            {/* Price (member price + crown shown only to members) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {isMember ? <CrownBadge /> : null}
              {strike > unit ? <TextBody style={{ fontSize: 16, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(strike)}</TextBody> : null}
              <Serif style={{ fontFamily: fonts.serifBlack, fontSize: 30, letterSpacing: -0.5, ...tabular }} color={headlineColor}>{rupee(unit)}</Serif>
              {savedPer > 0 ? <Pill label={`SAVE ${rupee(savedPer)}`} bg={isMember ? colors.goldSoft : 'rgba(199,91,110,0.12)'} color={headlineColor} /> : null}
            </View>
          </Animated.View>

          {/* Quantity */}
          <Animated.View entering={FadeInDown.duration(420).delay(60)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TextSemi style={{ fontSize: 15 }}>Quantity</TextSemi>
            <Stepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} max={10} />
          </Animated.View>

          <Divider />

          {/* Subscription type (milk) · or a one-time note (ghee) */}
          {subscribable ? (
            <Animated.View entering={FadeInDown.duration(420).delay(90)} style={{ gap: 10 }}>
              <TextSemi style={{ fontSize: 16 }}>Select your subscription type</TextSemi>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SUB_TYPES.map((t, i) => (
                  <SubTypeCard key={t.key} label={t.label} sub={t.sub} index={i} active={freq === t.key} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFreq(t.key); }} />
                ))}
              </View>
              <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.sage}>Pause or remove anytime!</TextBody>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(420).delay(90)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: 12 }}>
              <Ionicons name="cube-outline" size={18} color={GOLD} />
              <TextMed style={{ flex: 1, fontSize: 13.5 }} color={colors.inkDeep}>One-time delivery · no subscription, just this order.</TextMed>
            </Animated.View>
          )}

          {/* Start / delivery date */}
          <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ gap: 8 }}>
            <TextSemi style={{ fontSize: 16 }}>{subscribable ? 'Start date' : 'Delivery date'}</TextSemi>
            <Tap haptic={false} onPress={() => setShowCal(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.rose, borderRadius: radius.md, paddingHorizontal: 16, height: 56, backgroundColor: colors.white, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="calendar-outline" size={20} color={colors.roseDeep} />
                <TextSemi style={{ fontSize: 16 }}>{formatShort(startDate)}</TextSemi>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <TextMed color={colors.roseDeep} style={{ fontSize: 13 }}>Edit</TextMed>
                <Ionicons name="pencil" size={14} color={colors.roseDeep} />
              </View>
            </Tap>
          </Animated.View>

          <Divider />

          <Animated.View entering={FadeInDown.duration(420).delay(150)} style={{ gap: 6 }}>
            <TextSemi style={{ fontSize: 16 }}>About this product</TextSemi>
            <TextBody style={{ fontSize: 14.5, lineHeight: 22 }}>{product.description}</TextBody>
          </Animated.View>

          <Divider />

          {/* Trust row */}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {[
              { icon: 'leaf-outline', label: '100% traceable' },
              { icon: 'snow-outline', label: 'Cold chain' },
              { icon: 'time-outline', label: 'Fresh by 7 AM' },
            ].map((t) => (
              <View key={t.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={t.icon as any} size={20} color={colors.roseDeep} />
                </View>
                <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>{t.label}</TextBody>
              </View>
            ))}
          </View>

          {err ? <TextBody color={colors.danger} style={{ fontSize: 13, textAlign: 'center' }}>{err}</TextBody> : null}
        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <Glass
        glass="regular"
        intensity={70}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, borderTopWidth: 1, borderTopColor: colors.line, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Serif style={{ fontFamily: fonts.serifBlack, fontSize: 24, letterSpacing: -0.5, ...tabular }} color={headlineColor}>{rupee(total)}</Serif>
            {strike * qty > total ? <TextBody style={{ fontSize: 13, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(strike * qty)}</TextBody> : null}
          </View>
          <TextBody style={{ fontSize: 11 }}>Charged after delivery</TextBody>
        </View>
        <View style={{ flex: 1 }}>
          {shortfall > 0 ? (
            <ProceedButton title="Add money to wallet" loading={false} onPress={() => router.push('/(tabs)/wallet')} />
          ) : (
            <ProceedButton title="Proceed" loading={busy} onPress={proceed} />
          )}
        </View>
      </Glass>

      {showCal ? (
        <StartDatePicker
          value={startDate}
          minISO={tomorrowISO()}
          onConfirm={(iso) => { setStartDate(iso); setShowCal(false); }}
          onClose={() => setShowCal(false)}
        />
      ) : null}
    </View>
  );
}

// Small gold "crown" badge built from views (member-price marker).
function CrownBadge() {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.inkDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: GOLD_BRIGHT }}>
      <Ionicons name="star" size={13} color={GOLD_BRIGHT} />
    </View>
  );
}

// Glowing, shining PROCEED button.
function ProceedButton({ title, loading, onPress }: { title: string; loading: boolean; onPress: () => void }) {
  return (
    <View>
      <GlowPulse color="#F36CB5" radius={radius.pill} />
      <Tap onPress={loading ? undefined : onPress}>
        <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.roseDeep, height: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
          <Text style={{ color: '#fff', fontSize: 16.5, fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>{loading ? 'Setting up…' : title}</Text>
          {!loading ? <Ionicons name="arrow-forward" size={18} color="#fff" /> : null}
          <ShineSweep dur={2400} travel={300} bandWidth={64} angle="16deg" delay={400} />
        </View>
      </Tap>
    </View>
  );
}

const iconBtn = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.white,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  ...shadow.soft,
};
