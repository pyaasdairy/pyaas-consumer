import React, { useCallback, useState } from 'react';
import { View, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { ShineSweep } from './Fx';
import { useWallet } from '../store/wallet';
import { getVip, vipActive, PLUS_TRIAL_DAYS, type VipMembership } from '../lib/vip';
import { LOW_BALANCE_THRESHOLD } from '../lib/pricing';
import { getLedger } from '../lib/walletApi';
import { listSubscriptions } from '../lib/subscriptions';

/**
 * PERSISTENT PROMO LOOP
 * ---------------------
 * Re-evaluates the Home promo modals on EVERY Home focus (useFocusEffect), so a
 * dismissed banner reappears the next time the user returns to Home — matching
 * the reference app's re-render-on-focus behaviour.
 *
 * Two gates, in priority order:
 *   (i)  Low wallet  — wallet.available < LOW_BALANCE_THRESHOLD → "Low balance ·
 *        Recharge" modal.
 *   (ii) Become VIP  — VIP-eligible and not currently subscribed → "Become VIP".
 *
 * Dismissal sets a per-SESSION, in-memory flag (NOT persisted) that RESETS on the
 * next focus, so the modal shows again on the next Home visit. Within one visit,
 * dismissing the low-balance modal lets the VIP modal surface (if eligible).
 */
export function PromoGate() {
  const router = useRouter();
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const [vip, setVip] = useState<VipMembership | null>(null);
  // Persistent account signals that decide whether a low-wallet / VIP nag is even
  // appropriate: whether the member holds an ACTIVE subscription, and whether the
  // wallet has EVER been funded (a recharge / promo / refund credit ever landed).
  // A brand-new ₹0 account has neither, so it is never nagged (see below).
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [everFunded, setEverFunded] = useState(false);
  // Session dismissals — reset to false on every focus (see below).
  const [dismissedLow, setDismissedLow] = useState(false);
  const [dismissedVip, setDismissedVip] = useState(false);
  // Only evaluate once fresh wallet + membership signals are in, so a cold ₹0
  // balance never flashes the low-balance modal before the real balance loads.
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Re-arm: a banner dismissed on a previous visit shows again this visit.
      setDismissedLow(false);
      setDismissedVip(false);
      setReady(false);
      Promise.all([
        refreshWallet().catch(() => {}),
        getVip().then((m) => { if (active) setVip(m); }).catch(() => {}),
        listSubscriptions()
          .then((subs) => { if (active) setHasActiveSub(subs.some((s) => s.status === 'active')); })
          .catch(() => { if (active) setHasActiveSub(false); }),
        // "Ever funded" = any incoming ledger credit (recharge / promo reward /
        // refund). A brand-new account's ledger is empty, so this stays false.
        getLedger()
          .then((rows) => { if (active) setEverFunded(rows.some((r) => r.type === 'credit' || r.type === 'reward' || r.type === 'refund')); })
          .catch(() => { if (active) setEverFunded(false); }),
      ]).finally(() => { if (active) setReady(true); });
      return () => { active = false; };
    }, [refreshWallet])
  );

  const lowEligible = balance < LOW_BALANCE_THRESHOLD;
  // Low-wallet nag is only appropriate once the member has skin in the game: an
  // active subscription OR a wallet that has ever held funds. A brand-new ₹0
  // account that has never recharged is NOT nagged on first sign-in.
  const showLow = ready && lowEligible && (hasActiveSub || everFunded) && !dismissedLow;
  // Become-VIP upsell targets an EXISTING member whose wallet is running low while
  // a subscription is live (an active subscription means they have purchased, so
  // this never fires for a brand-new / never-purchased user). Not shown alongside
  // the higher-priority low-balance modal.
  const showVip = ready && !vipActive(vip) && hasActiveSub && lowEligible && !dismissedVip && !showLow;

  return (
    <>
      <PromoModal
        visible={showLow}
        onClose={() => setDismissedLow(true)}
        accent={colors.flameDeep}
        icon="wallet"
        badge="LOW BALANCE"
        title="Your wallet is running low"
        body={`Balance ${rupee(balance)}. Recharge now so tomorrow's morning delivery isn't paused.`}
        cta="Recharge wallet"
        onAccept={() => { setDismissedLow(true); router.push('/recharge'); }}
      />
      <PromoModal
        visible={showVip}
        onClose={() => setDismissedVip(true)}
        accent={colors.blue}
        icon="star"
        badge={`${PLUS_TRIAL_DAYS} DAYS FREE`}
        title="Become a PYAAS VIP"
        body="Priority morning slots, free delivery and member-only offers. Start your free trial — no card needed, cancel anytime."
        cta="Become VIP"
        onAccept={() => { setDismissedVip(true); router.push('/(tabs)/vip'); }}
      />
    </>
  );
}

function PromoModal({
  visible, onClose, onAccept, accent, icon, badge, title, body, cta,
}: {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge: string;
  title: string;
  body: string;
  cta: string;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(200)}
        style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
      >
        <Animated.View
          entering={FadeInDown.duration(340)}
          style={{ width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}
        >
          {/* Pink header medallion + brand foil badge. */}
          <View style={{ backgroundColor: accent, padding: spacing.lg, alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={26} color={colors.white} />
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
              <TextSemi color={colors.white} style={{ fontSize: 11.5, letterSpacing: 1 }}>{badge}</TextSemi>
            </View>
            <Serif color={colors.white} style={{ fontSize: 21, textAlign: 'center' }}>{title}</Serif>
            <ShineSweep dur={3200} travel={360} bandWidth={90} delay={500} />
          </View>

          <View style={{ padding: spacing.lg, gap: 16 }}>
            <TextBody style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }} color={colors.inkSoft}>{body}</TextBody>

            <Tap onPress={onAccept} weight="medium">
              <View style={{ height: 54, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: accent, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>{cta}</TextSemi>
                <ShineSweep dur={2400} travel={340} bandWidth={64} angle="16deg" delay={500} />
              </View>
            </Tap>

            <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextMed>
            </Tap>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
