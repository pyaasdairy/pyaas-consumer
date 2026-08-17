import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Modal, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../lib/haptics';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { todayISO, addDaysISO, parseISO } from '../lib/dates';
import { listSubscriptions, deliveriesForDay, type Subscription } from '../lib/subscriptions';
import { getMergedProducts, resolveProduct } from '../lib/catalog';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Top "your deliveries" tile. Shows the next 7 mornings; each day reflects the
 * user's REAL scheduled deliveries (frequency-aware), so the count is never a
 * fabricated lump sum.
 *
 * Layout: a thin day-chip selector (TODAY selected by default) sits above a
 * single FULL-WIDTH card for the selected day. The card is its own row — not
 * inside the horizontal scroll — so it always renders in full and never gets
 * clipped at the screen edge. The prompt leads with the current day; tapping
 * "Add" opens a product picker so the user chooses exactly what to subscribe to.
 */
export function DeliveryStrip() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState(0); // 0 = today — the order prompt is always for the current day first
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [picking, setPicking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listSubscriptions().then(setSubs).catch(() => {});
    }, [])
  );

  // Keyed on the CURRENT date so an app left open across midnight relabels —
  // memoised on [] it froze "Today" at mount and offered a start date in the past.
  const today = todayISO();
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const iso = addDaysISO(today, i);
        const d = parseISO(iso);
        return { i, iso, dow: WD[d.getDay()], date: d.getDate(), rel: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : WD_FULL[d.getDay()] };
      }),
    [today]
  );

  const selDay = days[sel];
  const selDelivery = deliveriesForDay(subs, selDay.iso);
  const selNames = selDelivery.items.map((s) => resolveProduct(s.product_id)?.name ?? 'Item');
  const isToday = sel === 0;

  function pickProduct(productId: string) {
    setPicking(false);
    // Carry the chosen day through as the subscription's start date.
    router.push({ pathname: '/product/[id]', params: { id: productId, start: selDay.iso } });
  }

  return (
    <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextSemi style={{ fontSize: 16 }}>Your deliveries</TextSemi>
        <TextBody style={{ fontSize: 12 }} color={colors.flameDeep}>Order today · get it by 7 AM</TextBody>
      </View>

      {/* Day selector — small chips; TODAY is selected by default. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 6 }}>
        {days.map((d) => {
          const selected = d.i === sel;
          const today = d.i === 0;
          const dayCount = deliveriesForDay(subs, d.iso).count;
          return (
            <Tap
              key={d.i}
              haptic={false}
              onPress={() => { haptics.select(); setSel(d.i); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${d.rel}, ${d.date}, ${dayCount > 0 ? `${dayCount} ${dayCount === 1 ? 'delivery' : 'deliveries'} scheduled` : 'no deliveries scheduled'}`}
              style={{
                width: 54,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 9,
                borderRadius: radius.lg,
                backgroundColor: selected ? colors.flameDeep : colors.white,
                borderWidth: 1.5,
                borderColor: selected ? colors.flameDeep : today ? colors.blue : colors.line,
                ...shadow.soft,
              }}
            >
              <TextBody style={{ fontSize: 10.5 }} color={selected ? 'rgba(255,255,255,0.92)' : today ? colors.blue : colors.inkMute}>
                {today ? 'Today' : d.dow}
              </TextBody>
              <Serif style={{ fontSize: 19 }} color={selected ? colors.white : today ? colors.blue : colors.ink}>{d.date}</Serif>
              {/* a small marker on days that already have a delivery scheduled */}
              <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: dayCount > 0 ? (selected ? colors.white : colors.flameDeep) : 'transparent' }} />
            </Tap>
          );
        })}
      </ScrollView>

      {/* Full-width card for the selected day — always fully visible (its own row, not the scroll). */}
      <Animated.View key={selDay.iso} entering={FadeIn.duration(200)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flameDeep, paddingVertical: 12, paddingHorizontal: 14, ...shadow.soft }}>
          <View style={{ alignItems: 'center', minWidth: 34 }}>
            <TextBody style={{ fontSize: 11 }}>{selDay.dow}</TextBody>
            <Serif style={{ fontSize: 24 }} color={colors.flameDeep}>{selDay.date}</Serif>
          </View>
          <View style={{ flex: 1 }}>
            {selDelivery.count > 0 ? (
              <>
                <TextSemi style={{ fontSize: 14 }}>{selDelivery.count} item{selDelivery.count === 1 ? '' : 's'} · {selDay.rel}</TextSemi>
                <TextBody style={{ fontSize: 12 }} numberOfLines={1}>{selNames.join(', ')}</TextBody>
              </>
            ) : (
              <>
                <TextSemi style={{ fontSize: 14 }}>{isToday ? 'Add more subscription' : `No delivery · ${selDay.rel}`}</TextSemi>
                <TextBody style={{ fontSize: 12 }}>{isToday ? 'Fresh milk every morning, 5-7:30 AM' : 'Tap add to schedule it'}</TextBody>
              </>
            )}
          </View>
          <Tap weight="medium" onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.flameDeep, ...shadow.soft }}>
            <Ionicons name="add" size={16} color={colors.white} />
            <TextSemi color={colors.white} style={{ fontSize: 13.5 }}>Add</TextSemi>
          </Tap>
        </View>
      </Animated.View>

      {/* Product picker · the user chooses what to subscribe to (no preselected SKU) */}
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,10,16,0.45)' }} onPress={() => setPicking(false)} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.milk, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 8, paddingBottom: insets.bottom + 12, maxHeight: '78%' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: 8 }}>
            <View>
              <Serif style={{ fontSize: 20 }}>What would you like delivered?</Serif>
              <TextBody style={{ fontSize: 12.5 }}>Starting {selDay.rel.toLowerCase()}</TextBody>
            </View>
            <Tap haptic={false} onPress={() => setPicking(false)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
            {getMergedProducts().filter((p) => !p.outOfStock).map((p) => (
              <Tap key={p.id} onPress={() => pickProduct(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10, ...shadow.soft }}>
                <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Image source={p.image} style={{ width: '82%', height: '82%' }} contentFit="contain" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 14.5 }} numberOfLines={1}>{p.name}</TextSemi>
                  <TextBody style={{ fontSize: 12 }} numberOfLines={1}>{p.variant} · {p.subscribable ? 'subscription or one-time' : 'one-time'}</TextBody>
                </View>
                <TextSemi style={{ fontSize: 15 }} color={colors.flameDeep}>{rupee(p.price)}</TextSemi>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
              </Tap>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
