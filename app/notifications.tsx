import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { useNotifications, noticeIcon, type Notice } from '../lib/notificationCenter';
import { permissionState, requestPermission, registerForPush, notificationsSupported, type PermissionState } from '../lib/notifications';
import { haptics } from '../lib/haptics';
import { rescheduleTaglines } from '../lib/taglines';

/**
 * NOTIFICATIONS — one place for everything the app has told the member, and the
 * one place that asks for notification permission.
 *
 * The feed merges the app's own events (an order moving, a delivery landing, a
 * wallet under the floor, a complaint registered) with the backend's campaign
 * messages, so a member never has to remember which of two inboxes a thing
 * landed in. Opening the screen marks what it shows as read, which clears the
 * header bell.
 *
 * PERMISSION IS ASKED HERE, NEVER AT LAUNCH: the banner explains what we would
 * send before the OS dialog appears, so a member can say yes for a reason. With
 * permission off, every row still lands in this list — the in-app feed is the
 * source of truth and the OS layer is the convenience.
 */
export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rows = useNotifications((s) => s.rows);
  const loading = useNotifications((s) => s.loading);
  const refresh = useNotifications((s) => s.refresh);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const [asking, setAsking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void permissionState().then(setPerm);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await refresh();
        if (!alive) return;
        // Everything on screen counts as seen.
        await markAllRead();
      })();
      return () => { alive = false; };
    }, [refresh, markAllRead]),
  );

  async function turnOn() {
    setAsking(true);
    try {
      const granted = await requestPermission();
      setPerm(granted ? 'granted' : 'denied');
      if (granted) {
        haptics.confirm();
        // Hand the token to the backend for closed-app pushes (silent no-op
        // until that endpoint is live).
        void registerForPush();
        // Permission is the last gate for the 2-hourly taglines.
        void rescheduleTaglines();
      }
    } finally {
      setAsking(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }} numberOfLines={1}>Notifications</Serif>
        <Tap haptic={false} onPress={() => router.push('/message-preferences')} accessibilityLabel="Message preferences" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="options-outline" size={20} color={colors.flameDeep} />
        </Tap>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.flameDeep} colors={[colors.flameDeep]} />}
      >
        {/* Permission primer — shown only while updates are actually off. */}
        {notificationsSupported() && perm !== 'granted' ? (
          <Animated.View entering={FadeInDown.duration(380)}>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, gap: 10, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="notifications" size={19} color={colors.flameDeep} />
                </View>
                <TextSemi style={{ fontSize: 15.5, flex: 1 }}>Get updates as they happen</TextSemi>
              </View>
              <TextBody style={{ fontSize: 13, lineHeight: 19, textAlign: 'justify' }} color={colors.inkSoft}>
                We will tell you when your order is packed, when the rider is on the way, when it reaches your door, and when your wallet is running low. Offers stay separate and you can turn those off on their own.
              </TextBody>
              {perm === 'denied' ? (
                <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>
                  Updates are switched off for PYAAS in your phone settings. Turn them on there and they start arriving.
                </TextBody>
              ) : (
                <Tap onPress={asking ? undefined : turnOn}>
                  <View style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                    {asking ? <ActivityIndicator color={colors.white} /> : null}
                    <TextSemi color={colors.white} style={{ fontSize: 15 }}>Turn on updates</TextSemi>
                  </View>
                </Tap>
              )}
            </View>
          </Animated.View>
        ) : null}

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: 10, marginTop: 8, ...shadow.soft }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="notifications-outline" size={20} color={colors.flameDeep} />
            </View>
            <TextSemi style={{ fontSize: 15 }}>Nothing yet</TextSemi>
            <TextBody style={{ fontSize: 13, textAlign: 'center', lineHeight: 19 }} color={colors.inkSoft}>
              Order updates, delivery news, wallet alerts and offers land here.
            </TextBody>
          </View>
        ) : (
          rows.map((n, i) => <NoticeRow key={n.id} notice={n} index={i} />)
        )}
      </ScrollView>
    </View>
  );
}

function NoticeRow({ notice, index }: { notice: Notice; index: number }) {
  const router = useRouter();
  const fresh = !notice.read_at;
  const body = notice.body && notice.body !== notice.title ? notice.body : null;
  return (
    <Animated.View entering={FadeInDown.duration(380).delay(Math.min(index, 6) * 40)}>
      <Tap
        haptic={false}
        onPress={notice.href ? () => router.push(notice.href as never) : undefined}
        style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: fresh ? colors.flame : colors.line, padding: spacing.md, ...shadow.soft }}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={noticeIcon(notice.kind) as never} size={18} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TextSemi style={{ fontSize: 14.5, flex: 1 }} numberOfLines={2}>{notice.title}</TextSemi>
            {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.flameDeep }} /> : null}
          </View>
          {body ? (
            <TextBody style={{ fontSize: 13, lineHeight: 19 }} color={colors.inkSoft}>{body}</TextBody>
          ) : null}
          <TextMed style={{ fontSize: 11 }} color={colors.inkMute}>{formatWhen(notice.created_at)}</TextMed>
        </View>
        {notice.href ? <Ionicons name="chevron-forward" size={16} color={colors.inkMute} style={{ alignSelf: 'center' }} /> : null}
      </Tap>
    </Animated.View>
  );
}

/** "Just now" / "Today, 7:05 am" / "21 Aug" — light, no library. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
