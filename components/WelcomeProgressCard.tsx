import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap, Pill } from './ui';
import { getCrmOffer, type CrmOfferView } from '../lib/crm';

/**
 * Welcome Litre PROGRESS card — the `already_enrolled` face of the funnel
 * (FE handoff item 4). Pack-1/pack-2 state comes from GET /crm/offer on every
 * focus and is never persisted; render decisions are the server's alone.
 *
 * Copy rules from the campaign doc this card must keep honoring:
 * - Pack 2 "rides the next real delivery" — NEVER promise "tomorrow" (a paused
 *   plan attaches it later, ≤ 14 days).
 * - The recharge nudge quotes the terms (₹500+ in ONE recharge, within 7 days
 *   of the first delivery) and routes to the recharge screen with no forced
 *   minimum — §6.4 keeps every amount tile at equal weight there.
 * - Once the offer is settled (pack 2 delivered/expired, or pack 1 forfeited)
 *   the card celebrates once or disappears — an ended offer must never keep
 *   pitching.
 */

type PackRow = { icon: string; iconColor: string; title: string; sub?: string };

function rows(o: NonNullable<CrmOfferView['offer']>): PackRow[] | null {
  const done = { icon: 'checkmark-circle', iconColor: colors.flameDeep };
  const wait = { icon: 'time-outline', iconColor: colors.inkMute };
  const lock = { icon: 'lock-closed', iconColor: colors.inkMute };

  const p1: PackRow =
    o.pack1_state === 'delivered'
      ? { ...done, title: 'Pack 1 delivered', sub: '500 ml Full Cream, free with our compliments' }
      : { ...wait, title: 'Pack 1 · on its way', sub: 'Arrives free with your first delivery' };

  switch (o.pack2_state) {
    case 'locked':
      return [p1, { ...lock, title: 'Pack 2 · unlock it free', sub: 'Add ₹500 or more in one recharge within 7 days of your first delivery' }];
    case 'pending':
      return [p1, { ...wait, title: 'Pack 2 unlocked', sub: 'It rides along free with your next delivery' }];
    case 'delivered':
      return [p1, { ...done, title: 'Pack 2 delivered', sub: 'Your full free litre is complete. Thank you for choosing PYAAS' }];
    default:
      // expired / unknown / pack1 forfeited → the offer is settled; no pitch.
      return null;
  }
}

export function WelcomeProgressCard() {
  const router = useRouter();
  const [offer, setOffer] = useState<CrmOfferView | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getCrmOffer().then((v) => { if (on) setOffer(v); }).catch(() => { /* keep last */ });
      return () => { on = false; };
    }, []),
  );

  const o = offer?.enrolled ? offer.offer : undefined;
  if (!o || o.pack1_state === 'forfeited') return null;
  const packRows = rows(o);
  if (!packRows) return null;

  const needsRecharge = o.pack2_state === 'locked';

  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, gap: 12, ...shadow.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill small label="WELCOME LITRE" bg={colors.flameSoft} color={colors.flameDeep} />
        <TextBody color={colors.inkMute} style={{ fontSize: 11 }}>Your free first litre</TextBody>
      </View>

      <View style={{ gap: 10 }}>
        {packRows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Ionicons name={r.icon as never} size={18} color={r.iconColor} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <TextSemi style={{ fontSize: 13.5 }}>{r.title}</TextSemi>
              {r.sub ? <TextBody color={colors.inkMute} style={{ fontSize: 11.5, lineHeight: 15 }}>{r.sub}</TextBody> : null}
            </View>
          </View>
        ))}
      </View>

      {needsRecharge ? (
        <Tap
          onPress={() => router.push('/recharge?amount=500&reason=to unlock your free second pack')}
          style={{ height: 46, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}
        >
          <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>Recharge · second pack free</TextSemi>
          <Ionicons name="arrow-forward" size={16} color={colors.white} />
        </Tap>
      ) : null}
    </View>
  );
}
