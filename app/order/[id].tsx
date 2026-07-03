import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, Divider } from '../../components/ui';
import { getOrder, cancelOrder, simulateRiderAssignment, type Order } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { STATUS_FLOW, STATUS_LABEL, STATUS_SUB, statusIndex } from '../../lib/orderStatus';

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Realtime: reflect rider-app changes (status, assigned rider, live GPS)
  // instantly. Falls back to a slow poll if Realtime isn't enabled on the
  // tables yet (Supabase → Database → Replication: orders, riders).
  useFocusEffect(
    useCallback(() => {
      load();
      const channel = supabase
        .channel(`order-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => load())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders' }, () => load())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events', filter: `order_id=eq.${id}` }, () => load())
        .subscribe();
      pollRef.current = setInterval(load, 15000); // safety-net fallback
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        supabase.removeChannel(channel);
      };
    }, [load, id])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.roseDeep} />
      </View>
    );
  }
  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 12 }}>
        <TextBody>{error || 'Order not found.'}</TextBody>
        <Button title="Back" onPress={() => router.back()} />
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
        <Tap onPress={() => router.back()} style={iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Tap>
        <Serif style={{ fontSize: 24 }}>Track order</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        {/* Status hero */}
        <View
          style={{
            borderRadius: radius.xl,
            padding: spacing.lg,
            gap: 6,
            backgroundColor: cancelled ? colors.cream : delivered ? '#2A1018' : colors.roseDeep,
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

        {/* Live rider card */}
        {hasRider && order.riders ? (
          <Animated.View entering={FadeIn} style={{ backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.card }}>
            <LiveTrackStrip active={order.status === 'out_for_delivery'} />
            <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={26} color={colors.roseDeep} />
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
                style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}
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
              <Ionicons name="checkmark-circle" size={18} color={colors.sage} />
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
                        backgroundColor: done ? colors.roseDeep : colors.white,
                        borderWidth: 2,
                        borderColor: done ? colors.roseDeep : colors.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {done ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                    </View>
                    {!last ? <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: i < idx ? colors.roseDeep : colors.line }} /> : null}
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
            <TextMed color={order.delivery_fee === 0 ? colors.sage : colors.ink}>{order.delivery_fee === 0 ? 'FREE' : rupee(order.delivery_fee)}</TextMed>
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

        {error ? <TextBody color={colors.roseDeep} style={{ fontSize: 13 }}>{error}</TextBody> : null}

        {/* Actions */}
        {canCancel ? <Button title="Cancel order" variant="outline" onPress={onCancel} loading={busy} /> : null}

        {/* RIDER BACKDOOR (demo): visible until the real rider app is live. */}
        {canSimulate ? (
          <View style={{ gap: 8 }}>
            <Button title="Simulate rider pickup (demo)" variant="sage" onPress={onSimulate} loading={busy} />
            <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
              Demo only. The rider app will trigger this for real. Hidden once a real rider claims the order.
            </TextBody>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A stylised "live tracking" strip with a moving rider marker. No paid map API. */
function LiveTrackStrip({ active }: { active: boolean }) {
  const x = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (active) {
      x.value = withRepeat(withTiming(1, { duration: 3200 }), -1, true);
      pulse.value = withRepeat(withSequence(withTiming(1.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
    }
  }, [active, x, pulse]);

  const markerStyle = useAnimatedStyle(() => ({ left: `${8 + x.value * 78}%` }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));

  return (
    <View style={{ height: 88, justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.cream }}>
      {/* dashed route line */}
      <View style={{ position: 'absolute', left: '8%', right: '8%', top: 44, height: 2, backgroundColor: 'rgba(199,91,110,0.35)' }} />
      {/* store marker */}
      <View style={{ position: 'absolute', left: '6%', top: 34, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
        <Ionicons name="storefront" size={12} color={colors.sage} />
      </View>
      {/* home marker */}
      <View style={{ position: 'absolute', right: '6%', top: 34, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
        <Ionicons name="home" size={12} color={colors.roseDeep} />
      </View>
      {/* moving rider */}
      <Animated.View style={[{ position: 'absolute', top: 30 }, markerStyle]}>
        <Animated.View style={[{ position: 'absolute', top: -3, left: -3, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(199,91,110,0.25)' }, pulseStyle]} />
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.roseDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
          <Ionicons name="bicycle" size={16} color={colors.white} />
        </View>
      </Animated.View>
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
