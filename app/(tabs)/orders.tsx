import React, { useCallback, useState } from 'react';
import { View, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill } from '../../components/ui';
import { listOrders, type Order } from '../../lib/api';
import { STATUS_LABEL, statusColor } from '../../lib/orderStatus';
import { SubscriptionStatusCard } from '../../components/SubscriptionStatusCard';
import { useTabBarClearance } from '../../components/PyaasTabBar';

// Status green for the 2+2 "FREE" badge (matches SubscriptionStatusCard / cart).
const FREE_GREEN = '#1B8A3A';

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function Orders() {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await listOrders();
      setOrders(data);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Serif style={{ fontSize: 30 }}>Your orders</Serif>
      </View>

      {/* Subscription live status pinned above the list, so "is my subscription
          live or not" is answered before a single order row. The empty state
          links back to the home claim flow. */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SubscriptionStatusCard style={{ marginBottom: spacing.sm }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 40 }} />
      ) : (
        <Animated.FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          itemLayoutAnimation={LinearTransition.springify().damping(18).stiffness(200)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabClearance, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.flameDeep} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Ionicons name="receipt-outline" size={56} color={colors.inkMute} />
              <Serif style={{ fontSize: 22 }}>No orders yet.</Serif>
              <TextBody style={{ textAlign: 'center' }}>{error || 'Your delivered and active orders show up here.'}</TextBody>
              <Button title="Order milk" onPress={() => router.replace('/(tabs)')} style={{ marginTop: 6, paddingHorizontal: 28 }} />
            </View>
          }
          renderItem={({ item, index }) => {
            const itemsText = (item.order_items ?? []).map((i) => `${i.qty}× ${i.name}`).join(', ');
            const active = !['delivered', 'cancelled'].includes(item.status);
            return (
              <Animated.View entering={FadeInDown.duration(260).delay(index * 50)} exiting={FadeOutUp.duration(180)}>
                <Tap
                  haptic={false}
                  onPress={() => router.push(`/order/${item.id}`)}
                  style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8, ...shadow.soft }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Pill
                      label={STATUS_LABEL[item.status]}
                      bg={active ? 'rgba(199,91,110,0.12)' : item.status === 'delivered' ? colors.blueSoft : colors.line}
                      color={statusColor(item.status)}
                    />
                    <TextBody style={{ fontSize: 12, ...tabular }}>{fmtDate(item.placed_at)}</TextBody>
                  </View>
                  <TextMed numberOfLines={1} style={{ fontSize: 14.5 }}>
                    {itemsText || 'Order'}
                  </TextMed>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {item.trial_free ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextBody style={{ fontSize: 12.5, textDecorationLine: 'line-through', ...tabular }} color={colors.inkMute}>{rupee(item.total)}</TextBody>
                        <View style={{ backgroundColor: FREE_GREEN, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <TextMed color={colors.white} style={{ fontSize: 11 }}>FREE 🎉</TextMed>
                        </View>
                      </View>
                    ) : (
                      <TextSemi color={colors.flameDeep} style={tabular}>{rupee(item.total)}</TextSemi>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <TextMed color={colors.flameDeep} style={{ fontSize: 13 }}>
                        {active ? 'Track' : 'View'}
                      </TextMed>
                      <Ionicons name="chevron-forward" size={15} color={colors.flameDeep} />
                    </View>
                  </View>
                </Tap>
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}
