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
import { listSubscriptions, createSubscription, setSubscriptionStatus, reconcileWithBalance, listVacations, upcomingDeliveries, type Subscription, type Frequency } from '../lib/subscriptions';
import { todayISO, formatWeekday } from '../lib/dates';
import { useWallet } from '../store/wallet';

const FREQS: { key: Frequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'alternate', label: 'Alternate' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'one_time', label: 'One time' },
];

export default function Subscriptions() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [upcoming, setUpcoming] = useState<{ date: string; count: number; items: Subscription[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lowBalance, setLowBalance] = useState(false);
  const refreshWallet = useWallet((s) => s.refresh);

  // new-subscription form
  const subscribable = PRODUCTS.filter((p) => p.subscribable && !p.outOfStock);
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
      const list = await listSubscriptions();
      setSubs(list);
      // Rolling preview: evaluate the next 10 days of demand on the fly from
      // cadence + pauses/skips (the note's "do not materialise the future").
      const vs = await listVacations();
      setUpcoming(upcomingDeliveries(list, vs, todayISO(), 10));
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="infinite" size={18} color={colors.blue} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.blue}>Fresh milk on autopilot. Pause anytime or set a vacation when you travel.</TextBody>
        </View>

        {lowBalance ? (
          <Tap onPress={() => router.push('/(tabs)/wallet')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.flameDeep }}>
            <Ionicons name="alert-circle" size={18} color={colors.flameDeep} />
            <TextMed style={{ flex: 1, fontSize: 12.5 }} color={colors.flameDeep}>Wallet balance is low, so deliveries are paused. Add money to resume them.</TextMed>
            <Ionicons name="chevron-forward" size={18} color={colors.flameDeep} />
          </Tap>
        ) : null}

        <Tap onPress={() => router.push('/vacations')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
          <Ionicons name="airplane-outline" size={20} color={colors.flameDeep} />
          <TextMed style={{ flex: 1, fontSize: 14.5 }}>Set a vacation</TextMed>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        {/* Rolling delivery preview · computed live from cadence + pauses/skips */}
        {upcoming.length ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10, ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar" size={16} color={colors.flameDeep} />
              <TextSemi style={{ fontSize: 15 }}>Upcoming deliveries</TextSemi>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {upcoming.map((d) => (
                <View key={d.date} style={{ minWidth: 96, alignItems: 'center', gap: 1, backgroundColor: colors.cream, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <TextBody style={{ fontSize: 10.5 }} color={colors.inkMute} numberOfLines={1}>{formatWeekday(d.date)}</TextBody>
                  <TextSemi style={{ fontSize: 18, ...tabular }} color={colors.flameDeep}>{d.count}</TextSemi>
                  <TextBody style={{ fontSize: 10 }}>pack{d.count === 1 ? '' : 's'}</TextBody>
                </View>
              ))}
            </ScrollView>
            <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>Computed live from your cadence, pauses and skips. Editable until 9 PM the night before.</TextBody>
          </View>
        ) : null}

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
            <TextBody>No active subscription.</TextBody>
            <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.inkMute}>
              Start your subscription on the home screen — pay 3 days, get 3 FREE, then it continues daily from your wallet.
            </TextBody>
            <Button title="Start your subscription" small style={{ marginTop: 4, paddingHorizontal: 24 }} onPress={() => router.replace('/(tabs)')} />
          </View>
        ) : (
          (() => {
            // Segregate recurring "Daily subscriptions" from one-off "Instant
            // deliveries" so each list reads clearly.
            const recurring = subs.filter((s) => s.frequency !== 'one_time');
            const instant = subs.filter((s) => s.frequency === 'one_time');
            const card = (s: (typeof subs)[number]) => {
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
                    <Pill label={s.status === 'active' ? 'ACTIVE' : 'PAUSED'} bg={s.status === 'active' ? colors.blueSoft : colors.cream} color={s.status === 'active' ? colors.blue : colors.inkMute} />
                  </View>
                  <Tap onPress={() => toggle(s)} disabled={busy} style={{ padding: 8 }}>
                    <Ionicons name={s.status === 'active' ? 'pause-circle' : 'play-circle'} size={30} color={colors.flameDeep} />
                  </Tap>
                </Animated.View>
              );
            };
            const sectionHeader = (label: string, sub: string) => (
              <View style={{ gap: 1, marginTop: 4 }}>
                <TextSemi style={{ fontSize: 15 }}>{label}</TextSemi>
                <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>{sub}</TextBody>
              </View>
            );
            return (
              <>
                {recurring.length > 0 ? (
                  <>
                    {sectionHeader('Daily subscriptions', 'Recurring deliveries, paid from your wallet')}
                    {recurring.map(card)}
                  </>
                ) : null}
                {instant.length > 0 ? (
                  <>
                    {sectionHeader('Instant deliveries', 'One-time orders')}
                    {instant.map(card)}
                  </>
                ) : null}
              </>
            );
          })()
        )}

        {/* New subscription form */}
        {adding ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 12, ...shadow.soft }}>
            <TextSemi style={{ fontSize: 16 }}>New subscription</TextSemi>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {subscribable.map((p) => (
                <Tap key={p.id} onPress={() => setPid(p.id)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: pid === p.id ? colors.action : colors.milk, borderWidth: 1, borderColor: pid === p.id ? colors.action : colors.line }}>
                  <TextMed color={pid === p.id ? colors.white : colors.inkSoft} style={{ fontSize: 13 }}>{p.name} {p.variant}</TextMed>
                </Tap>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FREQS.map((f) => (
                <Tap key={f.key} onPress={() => setFreq(f.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: freq === f.key ? colors.flameDeep : colors.milk, borderWidth: 1, borderColor: freq === f.key ? colors.flameDeep : colors.line }}>
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
