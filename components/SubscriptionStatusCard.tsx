import React, { useCallback, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, radius, rupee, shadow, spacing, tabular } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { resolveProduct } from '../lib/catalog';
import { listSubscriptions, listVacations, upcomingDeliveries, perDeliveryCost, type Subscription } from '../lib/subscriptions';
import { useTrial, trialLabel } from '../lib/trial';
import { todayISO, formatWeekday } from '../lib/dates';

/**
 * Live subscription status, shown on the HOME feed and pinned above the ORDERS
 * list so "is my subscription live or not" is answered at a glance:
 *   - any ACTIVE subscription → a green-dot "सदस्यता LIVE / Subscription LIVE"
 *     pill with product, qty, next delivery day and daily price, linking to
 *     /subscriptions to manage (pause / cancel).
 *   - paused-only → an amber-ish paused state linking to /subscriptions.
 *   - none → "Start your subscription, first 2 days FREE", linking to the
 *     claim flow (onClaim) — unless the host screen already shows its own claim
 *     card (showEmpty=false), to avoid saying it twice.
 *   - during the 3+3 trial the LIVE card shows the phase chip ("Day 2 of 3 ·
 *     paid" / "Day 5 of 6 · FREE 🎉") driven by lib/trial.
 * Self-loading on focus; renders nothing until the first load resolves so it
 * never flashes the empty state at a subscribed member.
 */
const LIVE_GREEN = '#1B8A3A'; // status green, dot + LIVE pill only (not a brand fill)

export function SubscriptionStatusCard({ onClaim, showEmpty = true, style }: { onClaim?: () => void; showEmpty?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { trial } = useTrial();
  const [loaded, setLoaded] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [nextDay, setNextDay] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      (async () => {
        try {
          const list = await listSubscriptions();
          let next: string | null = null;
          const active = list.filter((s) => s.status === 'active' && s.frequency !== 'one_time');
          if (active.length) {
            const vacs = await listVacations().catch(() => []);
            next = upcomingDeliveries(active, vacs, todayISO(), 14)[0]?.date ?? null;
          }
          if (on) { setSubs(list); setNextDay(next); setLoaded(true); }
        } catch {
          if (on) { setSubs([]); setNextDay(null); setLoaded(true); } // signed out — treat as none
        }
      })();
      return () => { on = false; };
    }, [])
  );

  if (!loaded) return null;

  // Newest first — the free-pack auto-subscription should lead the card even
  // when an older subscription is also live.
  const byNewest = (a: Subscription, b: Subscription) =>
    String(b.created_at ?? b.start_date ?? '').localeCompare(String(a.created_at ?? a.start_date ?? ''));
  const active = subs.filter((s) => s.status === 'active' && s.frequency !== 'one_time').sort(byNewest);
  const paused = subs.filter((s) => s.status === 'paused' && s.frequency !== 'one_time').sort(byNewest);

  // ── No subscription at all ─────────────────────────────────────────────────
  if (!active.length && !paused.length) {
    if (!showEmpty) return null;
    return (
      <Tap
        onPress={onClaim ?? (() => router.push('/(tabs)'))}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }, style]}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="gift" size={19} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <TextSemi style={{ fontSize: 14 }}>Start your subscription</TextSemi>
          <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>Your first 2 days are FREE 🎉 · fresh milk every morning</TextBody>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.flameDeep} />
      </Tap>
    );
  }

  // ── Paused only ────────────────────────────────────────────────────────────
  if (!active.length) {
    return (
      <Tap
        onPress={() => router.push('/subscriptions')}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }, style]}
      >
        <StatusPill label="PAUSED" dot={colors.gold} bg={colors.goldSoft} color={colors.goldDeep} />
        <TextMed style={{ flex: 1, fontSize: 13 }} color={colors.inkSoft}>
          {paused.length === 1 ? 'Your subscription is paused' : `${paused.length} subscriptions are paused`} · resume anytime
        </TextMed>
        <TextMed style={{ fontSize: 13 }} color={colors.flameDeep}>Manage</TextMed>
      </Tap>
    );
  }

  // ── LIVE ───────────────────────────────────────────────────────────────────
  const s = active[0];
  const p = resolveProduct(s.product_id);
  const daily = perDeliveryCost(s);
  return (
    <Tap
      onPress={() => router.push('/subscriptions')}
      style={[{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10, ...shadow.soft }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusPill label="Subscription LIVE" dot={LIVE_GREEN} bg="rgba(27,138,58,0.1)" color={LIVE_GREEN} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TextMed style={{ fontSize: 12.5 }} color={colors.flameDeep}>Manage</TextMed>
          <Ionicons name="chevron-forward" size={14} color={colors.flameDeep} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {p?.image ? <Image source={p.image} style={{ width: '80%', height: '80%' }} contentFit="contain" /> : <Ionicons name="water" size={20} color={colors.flameDeep} />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <TextSemi numberOfLines={1} style={{ fontSize: 14 }}>
            {s.qty} × {p?.name ?? s.product_id}{active.length > 1 ? `  +${active.length - 1} more` : ''}
          </TextSemi>
          {trial.active && /^gold-/.test(s.product_id) ? (
            /* 2+2 trial phase, driven by lib/trial: "Day 2 of 2 · paid" (blue) /
               "Day 3 of 4 · FREE 🎉" (green). Paid days still carry the ₹/day.
               FULL-CREAM (gold-*) ONLY — the backend counts trial days for the
               offer SKU alone, so the chip must never ride a Taaza/other sub
               and imply free days that will never arrive. */
            <TextSemi style={{ fontSize: 12, ...tabular }} color={trial.phase === 'free' ? LIVE_GREEN : colors.blue}>
              {trialLabel(trial)}{trial.phase === 'paid' ? ` · ${rupee(daily)}/day` : ''}
            </TextSemi>
          ) : (
            <TextBody style={{ fontSize: 12, ...tabular }} color={colors.inkSoft}>
              {nextDay ? `Next delivery ${formatWeekday(nextDay)}` : 'Delivers every morning'} · {rupee(daily)}/day
            </TextBody>
          )}
        </View>
      </View>
    </Tap>
  );
}

function StatusPill({ label, dot, bg, color }: { label: string; dot: string; bg: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      <TextSemi style={{ fontSize: 10.5, letterSpacing: 0.4 }} color={color}>{label}</TextSemi>
    </View>
  );
}
