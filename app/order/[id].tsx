import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Linking, TextInput, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts } from '../../lib/theme';
import { SkeletonBlock } from '../../components/Skeleton';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, Divider } from '../../components/ui';
import { RiderTrackMap } from '../../components/RiderTrackMap';
import { getOrder, cancelOrder, markOrderPaid, simulateRiderAssignment, simulateDelivered, reviewOrder, type Order } from '../../lib/api';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { checkoutHtml, isRazorpayConfigured, RAZORPAY_KEY_ID } from '../../lib/razorpay';
import { STATUS_FLOW, STATUS_LABEL, STATUS_SUB, statusIndex } from '../../lib/orderStatus';
import { isBackendConfigured } from '../../lib/apiClient';
import { WALLET_TEST_TOPUP } from '../../lib/razorpay';
import { debitWallet } from '../../lib/walletApi';

// Demo E2E tools (order → rider → delivered), backed by the dev endpoint
// /orders/:id/advance. NEVER gate these on the ABSENCE of a backend: a release
// build with no EXPO_PUBLIC_API_URL would then show "Simulate delivered (demo)"
// to real customers and to App Review, which rejects test/demo functionality
// outright (Guideline 2.1/2.2). __DEV__ is compiled out of any release bundle,
// so these cannot survive into a store build regardless of env.
const DEMO_TOOLS = __DEV__ && WALLET_TEST_TOPUP;
import { useWallet } from '../../store/wallet';
import { haptics } from '../../lib/haptics';

/** "06:00-07:00" → "7:00 AM" (the end of the window). Returns null for a
 *  malformed/blank window so the caller hides the ETA line instead of showing
 *  "Arriving by " with an empty or garbage time. */
function formatWindowEnd(win: string): string | null {
  const raw = win.split('-')[1]?.trim();
  const end = raw && raw.length ? raw : win.trim();
  const [h, m] = end.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

/** Local clock time ("6:32 PM") for an instant-lane ETA Date. */
function formatClock(d: Date): string {
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

/** Instant-lane ETA: server-minted etaAt when it's on the wire (either casing),
 *  else placed + 20 min. Null when nothing parses (hide the hero, never show
 *  "Arriving by Invalid Date"). */
function instantEtaOf(order: Order): Date | null {
  const wire = order.etaAt ?? order.eta_at;
  if (wire) {
    const d = new Date(wire);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const placed = new Date(order.placed_at);
  if (Number.isNaN(placed.getTime())) return null;
  return new Date(placed.getTime() + 20 * 60 * 1000);
}

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // >0 when this delivered order couldn't be charged (wallet too low) — surfaced so
  // the member can settle it instead of the charge being silently lost.
  const [owed, setOwed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshWallet = useWallet((s) => s.refresh);
  // Subscribe to the balance so an owed delivery re-attempts its debit after a top-up.
  const walletBalance = useWallet((s) => s.balance);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const debitedRef = useRef(false);
  // Pay-while-we-deliver checkout sheet (instant COD orders, local mode only).
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await getOrder(String(id));
      setOrder(o);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Poll while the screen is focused so rider-app status changes (status,
  // assigned rider, live GPS) show up without a manual refresh. When parag-api
  // is live this can be upgraded to a websocket/SSE push instead of polling.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const tick = () => {
        // Stop the moment the screen is torn down (e.g. an auth sign-out
        // redirect) so an in-flight poll never setStates on an unmounted
        // screen — the churn the root ErrorBoundary otherwise has to catch.
        if (active) void load();
      };
      tick();
      pollRef.current = setInterval(tick, 10000);
      return () => {
        active = false;
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load])
  );

  // Debit-on-delivery: when a backend-owned order becomes delivered, charge the
  // prepaid wallet exactly once (idempotent by ref), per the delivery note. If the
  // wallet can't cover it (a rare race — no reservation exists at placement yet),
  // we SURFACE the shortfall (owed banner + recharge) instead of silently losing
  // the charge, and allow a retry after the member tops up.
  // NOTE(backend): the durable fix is to RESERVE funds at POST /orders (available→held)
  // and settle held→spent on delivery, so a delivery can never outrun the balance.
  useEffect(() => {
    if (order?.status === 'delivered' && isBackendConfigured() && order.payment_method !== 'cod' && !debitedRef.current) {
      debitedRef.current = true;
      debitWallet(order.total, 'delivery', order.id)
        .then(() => { setOwed(0); refreshWallet(); })
        .catch(() => { debitedRef.current = false; setOwed(order.total); });
    }
    // walletBalance is a dep so that returning from a top-up (balance changed) with
    // debitedRef reset re-fires the delivery debit and clears the owed banner.
  }, [order?.status, order?.id, order?.total, order?.payment_method, walletBalance, refreshWallet]);

  /** Non-http(s) URLs inside checkout are UPI app deep links: hand them to the
   *  OS so the chosen app opens, keep the web flow inside the sheet. */
  function payNavGuard(req: { url?: string }): boolean {
    const url = req?.url ?? '';
    if (!url || /^(https?:|about:|data:|blob:)/i.test(url)) return true;
    Linking.openURL(url).catch(() => { /* no app for the scheme — stay in sheet */ });
    return false;
  }

  function onPayMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data ?? '{}');
      if (msg.type === 'success' && order) {
        // Client success is a HINT, not proof — but for an instant COD order it
        // only flips the collection method from "cash at the door" to "paid
        // online", the same trust level as a rider confirming cash. No stored
        // value is created. When the backend gains a payment endpoint with
        // signature verification, markOrderPaid routes through it instead.
        void markOrderPaid(order.id, String(msg.razorpay_payment_id ?? '')).then((ok) => {
          setPayOpen(false);
          if (ok) { haptics.confirm(); void load(); }
        });
      } else if (msg.type === 'dismiss') {
        setPayOpen(false);
      }
    } catch { /* not our message */ }
  }

  async function submitReview() {
    if (!order) return;
    setReviewBusy(true);
    try {
      await reviewOrder(order.id, reviewStars, reviewText.trim());
      haptics.success();
      setReviewed(true);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit your review.');
    } finally { setReviewBusy(false); }
  }

  async function onSimulateDelivered() {
    setBusy(true);
    try { await simulateDelivered(order!.id); await load(); }
    catch (e: any) { setError(e?.message ?? 'Could not simulate delivery.'); }
    finally { setBusy(false); }
  }

  if (loading) {
    // Tracking skeleton (not a blocking spinner) so the frame appears instantly
    // and the live status/rider/timeline swap in without a layout jump.
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ padding: spacing.lg, gap: spacing.md, paddingTop: insets.top + spacing.lg }}>
          <SkeletonBlock style={{ height: 116, borderRadius: radius.xl }} />
          <SkeletonBlock style={{ height: 60, borderRadius: radius.lg }} />
          <SkeletonBlock style={{ height: 96, borderRadius: radius.lg }} />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} style={{ height: 34, borderRadius: radius.md, width: `${88 - i * 12}%` }} />
          ))}
        </View>
      </View>
    );
  }
  if (!order) {
    // error set (timeout / network) => offer a retry; otherwise a genuine 404.
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 12 }}>
        <TextBody style={{ textAlign: 'center' }}>{error || 'Order not found.'}</TextBody>
        {error ? <Button title="Try again" onPress={() => { setLoading(true); load(); }} /> : null}
        <Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/orders'))} />
      </View>
    );
  }

  const idx = statusIndex(order.status);
  const cancelled = order.status === 'cancelled';
  const delivered = order.status === 'delivered';
  const hasRider = !!order.riders && (order.status === 'assigned' || order.status === 'out_for_delivery' || delivered);
  const canCancel = order.status === 'placed' || order.status === 'confirmed';
  const canSimulate = order.status === 'placed' || order.status === 'confirmed' || order.status === 'preparing';

  async function onCancel() {
    setBusy(true);
    try {
      await cancelOrder(order!.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  async function onSimulate() {
    setBusy(true);
    try {
      await simulateRiderAssignment(order!.id);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not simulate rider.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/orders'))} style={iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Tap>
        <Serif style={{ fontSize: 24 }}>Track order</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        {/* Unpaid-delivery notice — this order was delivered but the wallet couldn't
            cover it. Surface it (never silently lose the charge) + offer to settle. */}
        {owed > 0 ? (
          <Tap onPress={() => router.push(`/recharge?amount=${Math.max(100, Math.ceil(owed / 50) * 50)}&min=${Math.ceil(owed)}&returnTo=${encodeURIComponent(`/order/${order.id}`)}&reason=to settle this delivery`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.action, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, ...shadow.soft }}>
            <Ionicons name="alert-circle" size={20} color={colors.white} />
            <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.white}>This delivery couldn't be charged, your balance was low. Add {rupee(owed)} to settle it.</TextMed>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
          </Tap>
        ) : null}

        {/* Status hero */}
        <View
          style={{
            borderRadius: radius.xl,
            padding: spacing.lg,
            gap: 6,
            backgroundColor: cancelled ? colors.cream : delivered ? '#2A1018' : colors.flameDeep,
            borderWidth: cancelled ? 1 : 0,
            borderColor: colors.line,
            ...shadow.soft,
          }}
        >
          <TextSemi color={cancelled ? colors.inkSoft : colors.white} style={{ fontSize: 13, opacity: 0.9 }}>
            {delivered ? 'Delivered' : cancelled ? 'Cancelled' : 'Arriving soon'}
          </TextSemi>
          <Serif color={cancelled ? colors.ink : colors.white} style={{ fontSize: 28, lineHeight: 32 }}>
            {STATUS_LABEL[order.status]}
          </Serif>
          <TextBody color={cancelled ? colors.inkSoft : 'rgba(255,255,255,0.92)'} style={{ fontSize: 14 }}>
            {STATUS_SUB[order.status]}
          </TextBody>
        </View>

        {/* ETA hero — instant-lane orders get a big "Arriving by HH:MM · ⚡
            Instant" card (server etaAt when on the wire, else placed + 20 min);
            morning orders keep the window strip. Hidden when nothing parses. */}
        {(() => {
          const isInstantLane =
            order.lane === 'instant' || (order.delivery_window ?? '').trim().toLowerCase().startsWith('by ');
          if (isInstantLane && !delivered && !cancelled) {
            const eta = instantEtaOf(order);
            return eta ? (
              <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.flameDeep, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow.card }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flash" size={24} color={colors.flameDeep} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Serif style={{ fontSize: 22, lineHeight: 26 }} color={colors.flameDeep}>Arriving by {formatClock(eta)}</Serif>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pill label="⚡ INSTANT" bg={colors.flameSoft} color={colors.flameDeep} />
                    {/* flex:1 so the caption wraps INSIDE the card instead of leaking off the edge */}
                    <TextBody style={{ fontSize: 12, flex: 1 }} color={colors.inkSoft}>
                      {(order.status === 'assigned' || order.status === 'out_for_delivery'
                        ? 'On the way'
                        : 'Your order is being packed') +
                        ' · ' +
                        (order.paid
                          ? 'Paid online, nothing to pay at the door'
                          : order.payment_method === 'cod'
                            ? 'Pay on delivery: UPI or cash'
                            : order.payment_method === 'wallet' || order.payment_method === 'prepaid'
                              ? 'Paid from your PYAAS Wallet, nothing to pay at the door'
                              : '~20 min express delivery')}
                    </TextBody>
                  </View>
                </View>
              </View>
            ) : null;
          }
          const eta =
            !delivered && !cancelled && order.delivery_window
              ? formatWindowEnd(order.delivery_window)
              : null;
          return eta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameSoft, borderWidth: 1, borderColor: colors.flame, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14 }}>
              <Ionicons name="time-outline" size={22} color={colors.flameDeep} />
              <View style={{ flex: 1 }}>
                <TextSemi style={{ fontSize: 15 }} color={colors.ink}>Arriving by {eta}</TextSemi>
                <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>
                  {order.payment_method === 'cod' ? 'Cash on delivery · keep the amount ready' : 'Fresh at your door in the morning slot'}
                </TextBody>
              </View>
            </View>
          ) : null;
        })()}

        {/* Review-after-delivery */}
        {delivered ? (
          order.review ? (
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 8, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.blue} />
                <TextSemi style={{ fontSize: 15 }}>Thanks for rating</TextSemi>
              </View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons key={n} name={n <= order.review!.rating ? 'star' : 'star-outline'} size={20} color={colors.gold} />
                ))}
              </View>
              {order.review.comment ? <TextBody style={{ fontSize: 13.5 }}>{order.review.comment}</TextBody> : null}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 12, ...shadow.soft }}>
              <TextSemi style={{ fontSize: 16 }}>Rate your order</TextSemi>
              <TextBody style={{ fontSize: 13 }}>How was your PYAAS delivery?</TextBody>
              <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'center' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Tap key={n} haptic={false} onPress={() => { haptics.press(); setReviewStars(n); }}>
                    <Ionicons name={n <= reviewStars ? 'star' : 'star-outline'} size={34} color={colors.gold} />
                  </Tap>
                ))}
              </View>
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="Add a comment (optional)"
                placeholderTextColor={colors.inkMute}
                multiline
                style={{ backgroundColor: colors.milk, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, minHeight: 64, textAlignVertical: 'top', fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink }}
              />
              <Button title="Submit review" loading={reviewBusy} onPress={submitReview} />
            </View>
          )
        ) : null}

        {/* Live rider card · the member SEES the rider on a real map the moment
            one is assigned, gliding towards their door while out for delivery. */}
        {hasRider && order.riders ? (
          <Animated.View entering={FadeIn} style={{ backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.card }}>
            {!delivered ? (
              <RiderTrackMap
                riderLat={order.riders.current_lat}
                riderLng={order.riders.current_lng}
                active={order.status === 'out_for_delivery'}
              />
            ) : null}
            <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={26} color={colors.flameDeep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <TextSemi style={{ fontSize: 16 }}>{order.riders.full_name}</TextSemi>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextBody style={{ fontSize: 13 }}>{order.riders.vehicle ?? 'Your rider'}</TextBody>
                  {order.riders.rating ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Ionicons name="star" size={12} color="#E9A23B" />
                      <TextBody style={{ fontSize: 12.5 }}>{order.riders.rating.toFixed(1)}</TextBody>
                    </View>
                  ) : null}
                </View>
              </View>
              <Tap
                onPress={() => order.riders?.phone && Linking.openURL(`tel:${order.riders.phone}`)}
                style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}
              >
                <Ionicons name="call" size={20} color={colors.white} />
              </Tap>
            </View>
          </Animated.View>
        ) : null}

        {/* Delivery proof photo (from the rider app) */}
        {order.proof_photo_url ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.blue} />
              <TextSemi style={{ fontSize: 14.5 }}>Delivered · see photo</TextSemi>
            </View>
            <Image source={{ uri: order.proof_photo_url }} style={{ width: '100%', height: 200 }} contentFit="cover" />
          </View>
        ) : null}

        {/* Timeline */}
        {!cancelled ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
            <TextSemi style={{ fontSize: 16, marginBottom: spacing.md }}>Progress</TextSemi>
            {STATUS_FLOW.map((s, i) => {
              const done = i <= idx;
              const current = i === idx;
              const last = i === STATUS_FLOW.length - 1;
              return (
                <View key={s} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: done ? colors.flameDeep : colors.white,
                        borderWidth: 2,
                        borderColor: done ? colors.flameDeep : colors.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {done ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                    </View>
                    {!last ? <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: i < idx ? colors.flameDeep : colors.line }} /> : null}
                  </View>
                  <View style={{ paddingBottom: last ? 0 : spacing.sm, flex: 1 }}>
                    <TextMed color={done ? colors.ink : colors.inkMute} style={{ fontSize: 14.5, fontFamily: current ? undefined : undefined }}>
                      {STATUS_LABEL[s]}
                    </TextMed>
                    {current ? <TextBody style={{ fontSize: 12.5 }}>{STATUS_SUB[s]}</TextBody> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Items + summary */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <TextSemi style={{ fontSize: 16 }}>Order details</TextSemi>
            <Pill label={order.payment_method === 'cod' ? 'COD' : 'PREPAID'} bg={colors.cream} color={colors.inkSoft} />
          </View>
          {(order.order_items ?? []).map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <TextBody style={{ flex: 1 }} numberOfLines={1}>
                {it.qty} × {it.name} {it.variant}
              </TextBody>
              <TextMed style={{ fontSize: 14 }}>{rupee(it.price * it.qty)}</TextMed>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <TextBody>Subtotal</TextBody>
            <TextMed>{rupee(order.subtotal)}</TextMed>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <TextBody>Delivery</TextBody>
            <TextMed color={order.delivery_fee === 0 ? colors.blue : colors.ink}>{order.delivery_fee === 0 ? 'FREE' : rupee(order.delivery_fee)}</TextMed>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TextSemi style={{ fontSize: 16 }}>Total</TextSemi>
            <Serif style={{ fontSize: 22 }}>{rupee(order.total)}</Serif>
          </View>
          <Divider />
          <TextBody style={{ fontSize: 13 }}>
            <TextMed style={{ fontSize: 13 }}>{order.address_label}: </TextMed>
            {order.address_text}
          </TextBody>
        </View>

        {error ? <TextBody color={colors.flameDeep} style={{ fontSize: 13 }}>{error}</TextBody> : null}

        {/* Actions */}
        <Button title="View bill" variant="outline" onPress={() => router.push(`/invoice/${order.id}`)} />
        {canCancel ? <Button title="Cancel order" variant="outline" onPress={onCancel} loading={busy} /> : null}

        {/* RIDER BACKDOOR (demo): drives the full order → delivery-partner-assigned
            → delivered loop for testing. The real operator/rider app owns these
            transitions in production; hidden in a non-pilot prod build. */}
        {canSimulate && DEMO_TOOLS ? (
          <View style={{ gap: 8 }}>
            <Button title="Simulate rider pickup (demo)" variant="sage" onPress={onSimulate} loading={busy} />
            <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
              Demo only. Assigns a delivery partner so you can test tracking. The rider app does this for real; hidden once a real rider claims the order.
            </TextBody>
          </View>
        ) : null}
        {order.status === 'out_for_delivery' && DEMO_TOOLS ? (
          <Button title="Simulate delivered (demo)" variant="sage" onPress={onSimulateDelivered} loading={busy} />
        ) : null}
      </ScrollView>

      {/* PAY WHILE WE DELIVER — instant COD orders only, and only where an
          online payment can actually land: local mode (backend mode has no
          payment endpoint yet, so it stays honestly cash-or-UPI at the door)
          with a configured gateway key. Cash at delivery always works. */}
      {(() => {
        if (!order) return null;
        const instantLane = order.lane === 'instant' || (order.delivery_window ?? '').trim().toLowerCase().startsWith('by ');
        const canPayOnline =
          instantLane && order.payment_method === 'cod' && !order.paid &&
          order.status !== 'delivered' && order.status !== 'cancelled' &&
          !isBackendConfigured() && isRazorpayConfigured();
        if (!canPayOnline) return null;
        return (
          <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: insets.bottom + 12, gap: 10 }}>
            <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>You can pay online now, or in cash at delivery.</TextBody>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <TextBody style={{ fontSize: 11, letterSpacing: 0.4 }} color={colors.inkMute}>PAYING VIA</TextBody>
                <TextSemi style={{ fontSize: 15 }}>UPI · secure checkout</TextSemi>
              </View>
              <Tap onPress={() => setPayOpen(true)}>
                <View style={{ height: 48, minWidth: 140, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, ...shadow.soft }}>
                  <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>Pay {rupee(order.total)}</TextSemi>
                </View>
              </Tap>
            </View>
          </View>
        );
      })()}

      {/* Razorpay checkout sheet for the pay-while-we-deliver flow. */}
      <Modal visible={payOpen} animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.line }}>
            <Tap haptic={false} onPress={() => setPayOpen(false)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={20} color={colors.flameDeep} />
            </Tap>
            <TextSemi style={{ fontSize: 16 }}>Pay {order ? rupee(order.total) : ''}</TextSemi>
          </View>
          {payOpen && order ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: checkoutHtml({ keyId: RAZORPAY_KEY_ID, amountPaise: Math.round(order.total * 100), themeColor: colors.flameDeep }) }}
              onShouldStartLoadWithRequest={payNavGuard}
              onMessage={onPayMessage}
              startInLoadingState
              renderLoading={() => (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, gap: 12 }}>
                  <ActivityIndicator color={colors.flameDeep} size="large" />
                  <TextBody style={{ fontSize: 13 }} color={colors.inkSoft}>Loading secure payment…</TextBody>
                </View>
              )}
              style={{ flex: 1, backgroundColor: colors.cream }}
            />
          ) : null}
        </View>
      </Modal>
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
