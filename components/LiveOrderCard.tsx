import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  interpolate,
  Easing,
  ReduceMotion,
} from 'react-native-reanimated';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { spring } from '../lib/motion';
import type { Order } from '../lib/api';
import { etaText, isInstantOrder, trackSteps } from '../lib/orderTracking';
import { STATUS_LABEL } from '../lib/orderStatus';

/**
 * LIVE ORDER CARD — the "where is my milk" surface, in the shape members
 * already know from every quick-commerce app: one line of status, a countdown,
 * and a step rail that visibly ADVANCES as the order moves.
 *
 * It is driven entirely by the order row (lib/orderTracking maps the backend's
 * statuses onto four displayed steps), so it stays honest: nothing here
 * animates ahead of what the store has actually reported.
 */
export function LiveOrderCard({ order, now, compact }: { order: Order; now: Date; compact?: boolean }) {
  const router = useRouter();
  const steps = trackSteps(order);
  const instant = isInstantOrder(order);
  const eta = etaText(order, now);
  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.max(0, Math.min(1, (doneCount - 1) / (steps.length - 1)));

  // The filled rail springs to the new progress whenever a step completes.
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withSpring(progress, spring.layout);
  }, [progress, p]);
  const railStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  // A slow breathing dot marks the live step — the one visual cue that says
  // "this is moving right now" without faking motion on the rail itself.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.15]) }],
  }));

  return (
    <Tap
      scaleTo={0.985}
      onPress={() => router.push(`/order/${order.id}`)}
      accessibilityLabel={`${STATUS_LABEL[order.status]}${eta ? `, ${eta}` : ''}. Open order tracking`}
      style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: 13, gap: 11, ...shadow.card }}
    >
      {/* Status row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={instant ? 'flash' : 'bicycle'} size={19} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live }, pulseStyle]} />
            <TextSemi style={{ fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
              {STATUS_LABEL[order.status]}
            </TextSemi>
          </View>
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute} numberOfLines={1}>
            {eta ?? (instant ? 'Your store is on it' : order.delivery_window ?? 'Morning delivery, 5-7:30 AM')}
          </TextBody>
        </View>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={16} color={colors.white} />
        </View>
      </View>

      {/* Step rail */}
      {compact ? null : (
        <View style={{ gap: 7 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: colors.flameDeep }, railStyle]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {steps.map((s, i) => (
              <TextMed
                key={s.key}
                style={{
                  fontSize: 10,
                  flex: 1,
                  textAlign: i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center',
                }}
                color={s.current ? colors.flameDeep : s.done ? colors.inkSoft : colors.inkMute}
                numberOfLines={1}
              >
                {s.label}
              </TextMed>
            ))}
          </View>
        </View>
      )}
    </Tap>
  );
}

export default LiveOrderCard;
