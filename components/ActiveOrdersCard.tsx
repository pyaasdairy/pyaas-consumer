import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, interpolate, Easing, ReduceMotion } from 'react-native-reanimated';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { spring } from '../lib/motion';
import type { Order } from '../lib/api';
import { arrivalLine, isInstantOrder, trackSteps } from '../lib/orderTracking';
import { STATUS_LABEL } from '../lib/orderStatus';

/**
 * ONE BOX FOR EVERY ACTIVE ORDER (founder call, 21 Sep): the home screen used
 * to stack a separate tracking card per order, so two morning orders meant two
 * identical "Scheduled" boxes. Now a single card lists each active order as its
 * own row (status, what is in it, when it arrives, a progress bar) and each row
 * opens that order's tracking.
 */
export function ActiveOrdersCard({ orders, now }: { orders: Order[]; now: Date }) {
  const router = useRouter();
  if (orders.length === 0) return null;
  const instant = orders.some(isInstantOrder);
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, ...shadow.card, overflow: 'hidden' }}>
      <Tap
        haptic={false}
        onPress={() => router.push('/(tabs)/orders')}
        accessibilityLabel={`Your orders, ${orders.length} active. Open orders`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: spacing.md, paddingVertical: 12 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={instant ? 'flash' : 'bicycle'} size={18} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextSemi style={{ fontSize: 15 }}>Your orders</TextSemi>
          <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>
            {orders.length === 1 ? '1 order on its way' : `${orders.length} orders on their way`}
          </TextBody>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.flameDeep} />
      </Tap>
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} now={now} onPress={() => router.push(`/order/${o.id}`)} />
      ))}
    </View>
  );
}

function OrderRow({ order, now, onPress }: { order: Order; now: Date; onPress: () => void }) {
  const steps = trackSteps(order);
  const done = steps.filter((s) => s.done).length;
  const progress = Math.max(0, Math.min(1, (done - 1) / (steps.length - 1)));
  const p = useSharedValue(progress);
  useEffect(() => { p.value = withSpring(progress, spring.layout); }, [progress, p]);
  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0.04, p.value) * 100}%` }));
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }), -1, true);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.35, 1]) }));
  const items = (order.order_items ?? []).map((i) => `${i.qty}× ${i.name}`).join(', ');
  return (
    <Tap
      haptic={false}
      onPress={onPress}
      accessibilityLabel={`${STATUS_LABEL[order.status]}, ${arrivalLine(order, now)}. Track this order`}
      style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: 11, gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live }, dot]} />
        <TextSemi style={{ fontSize: 13.5 }}>{STATUS_LABEL[order.status]}</TextSemi>
        <TextMed style={{ fontSize: 12, flex: 1, textAlign: 'right' }} color={colors.inkSoft} numberOfLines={1}>{arrivalLine(order, now)}</TextMed>
        <Ionicons name="chevron-forward" size={15} color={colors.inkMute} />
      </View>
      {items ? <TextBody style={{ fontSize: 12 }} color={colors.inkMute} numberOfLines={1}>{items}</TextBody> : null}
      <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: colors.flameDeep }, bar]} />
      </View>
    </Tap>
  );
}

export default ActiveOrdersCard;
