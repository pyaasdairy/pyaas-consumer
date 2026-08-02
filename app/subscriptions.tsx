import React, { useCallback, useState } from 'react';
import { View, ScrollView, Modal } from 'react-native';
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
import { listSubscriptions, createSubscription, setSubscriptionStatus, reconcileWithBalance, listVacations, upcomingDeliveries, minWalletToStart, perDeliveryCost, NEEDS_EXACT_LOCATION, type Subscription, type Frequency } from '../lib/subscriptions';
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
  const [detailSub, setDetailSub] = useState<Subscription | null>(null);
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
      // Same prepaid floor as the product/claim flows: the wallet must cover at
      // least 2 days before a subscription can start; otherwise route to recharge.
      await refreshWallet();
      const need = minWalletToStart(p.price * qty);
      const bal = useWallet.getState().balance;
      if (bal < need) {
        setAdding(false);
        setBusy(false);
        const qs = new URLSearchParams({
          min: String(Math.ceil(need - bal)),
          amount: String(Math.max(100, Math.ceil((need - bal) / 50) * 50)),
          returnTo: '/subscriptions',
          reason: 'to start your subscription',
        }).toString();
        router.push(`/recharge?${qs}`);
        return;
      }
      await createSubscription({ productId: p.id, variant: p.variant, qty, unitPrice: p.price, frequency: freq });
      haptics.confirm();
      setAdding(false); setQty(1); setFreq('daily');
      await load();
    } catch (e: any) {
      // No exact delivery point yet → send them to add one on the map (address
      // screen) instead of surfacing the raw gate code, then they can retry.
      if (e?.code === NEEDS_EXACT_LOCATION || e?.message === NEEDS_EXACT_LOCATION) {
        setErr('Set your delivery location on the map first.');
        router.push('/address');
      } else {
        setErr(e?.message ?? 'Could not start the subscription. Please try again.');
      }
    }
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
              Start your subscription on the home screen: pay 2 days, get 2 FREE, then it continues daily from your wallet.
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
                  {/* Tapping the card opens the detail/manage sheet (status, resume,
                      recharge-if-low, cancel). The pause/resume icon stays a shortcut. */}
                  <Tap onPress={() => setDetailSub(s)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                      {p ? <Image source={p.image} style={{ width: '80%', height: '80%' }} contentFit="contain" /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <TextSemi style={{ fontSize: 14.5 }}>{s.qty} × {p?.name ?? s.product_id}</TextSemi>
                      <TextBody style={{ fontSize: 12.5, ...tabular }}>{FREQS.find((f) => f.key === s.frequency)?.label} · {rupee(s.unit_price * s.qty)}/delivery</TextBody>
                      <Pill label={s.status === 'active' ? 'ACTIVE' : 'PAUSED'} bg={s.status === 'active' ? colors.blueSoft : colors.cream} color={s.status === 'active' ? colors.blue : colors.inkMute} />
                    </View>
                  </Tap>
                  <Tap
                    onPress={() => {
                      // Resuming a paused-but-underfunded sub would just be auto-paused
                      // again by reconcile — the tap would look dead. Open the manage
                      // sheet instead so we can guide them to recharge.
                      if (s.status !== 'active' && useWallet.getState().balance < perDeliveryCost(s)) { setDetailSub(s); return; }
                      toggle(s);
                    }}
                    disabled={busy}
                    style={{ padding: 8 }}
                  >
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

      {/* Subscription detail / manage sheet — opens on card tap so the row is never
          a dead end. Shows ACTIVE, or PAUSED with the right reason (low wallet ->
          recharge, else -> resume), plus vacation + cancel. */}
      {detailSub ? (() => {
        const d = detailSub;
        const p = getProduct(d.product_id);
        const cost = perDeliveryCost(d);
        const bal = useWallet.getState().balance;
        const underfunded = d.status === 'paused' && bal < cost;
        const close = () => setDetailSub(null);
        const goRecharge = () => {
          close();
          const need = minWalletToStart(cost);
          const short = Math.max(cost, need) - bal;
          const qs = new URLSearchParams({
            min: String(Math.ceil(Math.max(cost, short))),
            amount: String(Math.max(100, Math.ceil(short / 50) * 50)),
            returnTo: '/subscriptions',
            reason: 'to resume your subscription',
          }).toString();
          router.push(`/recharge?${qs}`);
        };
        const cancelSub = async () => {
          close(); setBusy(true); setErr('');
          try { await setSubscriptionStatus(d.id, 'cancelled'); await load(); }
          catch (e: any) { setErr(e?.message ?? 'Could not cancel the subscription.'); }
          finally { setBusy(false); }
        };
        return (
          <Modal visible transparent animationType="slide" onRequestClose={close}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Tap haptic={false} onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}><View /></Tap>
              <View style={{ backgroundColor: colors.milk, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
                <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 2 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                    {p ? <Image source={p.image} style={{ width: '80%', height: '80%' }} contentFit="contain" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Serif style={{ fontSize: 20 }}>{p?.name ?? d.product_id}</Serif>
                    <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>{d.qty} × {p?.variant ?? ''} · {FREQS.find((f) => f.key === d.frequency)?.label} · {rupee(d.unit_price * d.qty)}/delivery</TextBody>
                  </View>
                </View>

                {/* Status + reason */}
                {d.status === 'active' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.blue} />
                    <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.blue}>Active. Fresh milk arrives every morning, paid from your wallet.</TextMed>
                  </View>
                ) : underfunded ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.flameDeep }}>
                    <Ionicons name="alert-circle" size={20} color={colors.flameDeep} />
                    <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.flameDeep}>Paused. Your wallet ({rupee(bal)}) is too low for a {rupee(cost)} delivery. Add money to resume.</TextMed>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream, borderRadius: radius.md, padding: 12 }}>
                    <Ionicons name="pause-circle" size={20} color={colors.inkSoft} />
                    <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.inkSoft}>Paused. Resume whenever you are ready.</TextMed>
                  </View>
                )}

                {/* Primary action */}
                {d.status === 'active' ? (
                  <Button title="Pause deliveries" variant="outline" loading={busy} onPress={() => { close(); toggle(d); }} />
                ) : underfunded ? (
                  <Button title={`Add money to resume`} loading={busy} onPress={goRecharge} />
                ) : (
                  <Button title="Resume deliveries" loading={busy} onPress={() => { close(); toggle(d); }} />
                )}

                <Tap onPress={() => { close(); router.push('/vacations'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <Ionicons name="airplane-outline" size={18} color={colors.flameDeep} />
                  <TextMed style={{ flex: 1, fontSize: 14 }}>Set a vacation</TextMed>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkMute} />
                </Tap>
                <Tap onPress={cancelSub} style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <TextMed color={colors.danger} style={{ fontSize: 13.5 }}>Cancel subscription</TextMed>
                </Tap>
              </View>
            </View>
          </Modal>
        );
      })() : null}
    </View>
  );
}
