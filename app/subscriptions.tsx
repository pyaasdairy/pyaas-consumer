import React, { useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../lib/haptics';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, Stepper, BackButton } from '../components/ui';
import { SkeletonBlock } from '../components/Skeleton';
import { PRODUCTS, getProduct } from '../constants/products';
import { listSubscriptions, createSubscription, setSubscriptionStatus, reconcileWithBalance, type Subscription, type Frequency } from '../lib/subscriptions';
import { useWallet } from '../store/wallet';

const FREQS: { key: Frequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'alternate', label: 'Alternate' },
  { key: 'one_time', label: 'One time' },
];

export default function Subscriptions() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lowBalance, setLowBalance] = useState(false);
  const refreshWallet = useWallet((s) => s.refresh);

  // new-subscription form
  const subscribable = PRODUCTS.filter((p) => p.subscribable);
  const [pid, setPid] = useState(subscribable[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [freq, setFreq] = useState<Frequency>('daily');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sync subscriptions with the wallet: pause any the balance can no longer
      // fund, resume any we auto-paused once it is topped up again.
      await refreshWallet();
      const r = await reconcileWithBalance(useWallet.getState().balance);
      setLowBalance(r.lowBalance);
      setSubs(await listSubscriptions());
    } catch { /* keep last-known list */ }
    finally { setLoading(false); }
  }, [refreshWallet]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    const p = getProduct(pid);
    if (!p) return;
    setBusy(true); setErr('');
    try {
      // The wallet must cover at least the first delivery.
      await refreshWallet();
      const cost = p.price * qty;
      const bal = useWallet.getState().balance;
      if (bal < cost) {
        setErr(`Your wallet has ${rupee(bal)}. Add ${rupee(cost - bal)} to start this subscription.`);
        setBusy(false);
        return;
      }
      await createSubscription({ productId: p.id, variant: p.variant, qty, unitPrice: p.price, frequency: freq });
      haptics.confirm();
      setAdding(false); setQty(1); setFreq('daily');
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Could not start the subscription. Please try again.'); }
    finally { setBusy(false); }
  }

  async function toggle(s: Subscription) {
    setBusy(true); setErr('');
    try {
      await setSubscriptionStatus(s.id, s.status === 'active' ? 'paused' : 'active');
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Could not update the subscription.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>My subscriptions</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="infinite" size={18} color={colors.sage} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.sage}>Fresh milk on autopilot. Pause anytime or set a vacation when you travel.</TextBody>
        </View>

        {lowBalance ? (
          <Tap onPress={() => router.push('/(tabs)/wallet')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.roseSoft, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.roseDeep }}>
            <Ionicons name="alert-circle" size={18} color={colors.roseDeep} />
            <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.roseDeep}>Wallet balance is low, so deliveries are paused. Add money to resume them.</TextMed>
            <Ionicons name="chevron-forward" size={18} color={colors.roseDeep} />
          </Tap>
        ) : null}

        <Tap onPress={() => router.push('/vacations')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
          <Ionicons name="airplane-outline" size={20} color={colors.roseDeep} />
          <TextMed style={{ flex: 1, fontSize: 14.5 }}>Set a vacation</TextMed>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}

        {loading ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, ...shadow.soft }}>
                <SkeletonBlock style={{ width: 56, height: 56, borderRadius: radius.md }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <SkeletonBlock style={{ width: '70%', height: 14 }} />
                  <SkeletonBlock style={{ width: '50%', height: 11 }} />
                  <SkeletonBlock style={{ width: 64, height: 18, borderRadius: radius.pill }} />
                </View>
              </View>
            ))}
          </View>
        ) : subs.length === 0 && !adding ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: 8 }}>
            <Ionicons name="infinite-outline" size={40} color={colors.inkMute} />
            <TextBody>No subscriptions yet.</TextBody>
          </View>
        ) : (
          subs.map((s) => {
            const p = getProduct(s.product_id);
            return (
              <Animated.View
                key={s.id}
                layout={LinearTransition.springify().damping(18).stiffness(200)}
                entering={FadeInDown.duration(260)}
                exiting={FadeOutUp.duration(180)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, ...shadow.soft }}
              >
                <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                  {p ? <Image source={p.image} style={{ width: '80%', height: '80%' }} contentFit="contain" /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <TextSemi style={{ fontSize: 14.5 }}>{s.qty} × {p?.name ?? s.product_id}</TextSemi>
                  <TextBody style={{ fontSize: 12.5, ...tabular }}>{FREQS.find((f) => f.key === s.frequency)?.label} · {rupee(s.unit_price * s.qty)}/delivery</TextBody>
                  <Pill label={s.status === 'active' ? 'ACTIVE' : 'PAUSED'} bg={s.status === 'active' ? colors.sageSoft : colors.cream} color={s.status === 'active' ? colors.sage : colors.inkMute} />
                </View>
                <Tap onPress={() => toggle(s)} disabled={busy} style={{ padding: 8 }}>
                  <Ionicons name={s.status === 'active' ? 'pause-circle' : 'play-circle'} size={30} color={colors.roseDeep} />
                </Tap>
              </Animated.View>
            );
          })
        )}

        {/* New subscription form */}
        {adding ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 12, ...shadow.soft }}>
            <TextSemi style={{ fontSize: 16 }}>New subscription</TextSemi>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {subscribable.map((p) => (
                <Tap key={p.id} onPress={() => setPid(p.id)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: pid === p.id ? colors.ink : colors.milk, borderWidth: 1, borderColor: pid === p.id ? colors.ink : colors.line }}>
                  <TextMed color={pid === p.id ? colors.white : colors.inkSoft} style={{ fontSize: 13 }}>{p.name} {p.variant}</TextMed>
                </Tap>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FREQS.map((f) => (
                <Tap key={f.key} onPress={() => setFreq(f.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: freq === f.key ? colors.roseDeep : colors.milk, borderWidth: 1, borderColor: freq === f.key ? colors.roseDeep : colors.line }}>
                  <TextMed color={freq === f.key ? colors.white : colors.inkSoft} style={{ fontSize: 12.5 }}>{f.label}</TextMed>
                </Tap>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TextMed style={{ fontSize: 14 }}>Quantity per delivery</TextMed>
              <Stepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} />
            </View>
            <Button title="Start subscription" loading={busy} onPress={create} />
            <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        ) : (
          <Button title="+ New subscription" variant="outline" onPress={() => setAdding(true)} />
        )}
      </ScrollView>
    </View>
  );
}
