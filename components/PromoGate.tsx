import React, { useCallback, useState } from 'react';
import { View, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { ShineSweep } from './Fx';
import { useWallet } from '../store/wallet';
import { useAuth } from '../lib/auth';
import { getVip, vipActive, vipDaysLeft, vipOnTrial, vipUpsellSnoozed, snoozeVipUpsell, PLUS_TRIAL_DAYS, VIP_EXPIRY_WARN_DAYS, type VipMembership } from '../lib/vip';
import { LOW_BALANCE_THRESHOLD } from '../lib/pricing';
import { PREPAID_TARGET, prepaidTier, shouldShowPrepaidFunnel } from '../lib/prepaid';
import { freePackShowEligible } from '../lib/freePack';
import { getLedger } from '../lib/walletApi';
import { listSubscriptions } from '../lib/subscriptions';

/**
 * PERSISTENT MONEY FUNNEL (Country-Delight discipline)
 * ----------------------------------------------------
 * Re-evaluates the Home money sheet on EVERY Home focus (useFocusEffect), so it
 * reappears each time the member returns — the reference app's re-render-on-focus
 * "recharge now" persistence.
 *
 * ONE sheet at a time, in strict priority (never stacked, never chained):
 *   1. Prepaid   — an existing/funded member below the prepaid target → "Go prepaid,
 *                  get ₹X free" (paused-delivery variant when a sub auto-paused).
 *   2. Plus expiring — an active Plus member ≤ VIP_EXPIRY_WARN_DAYS from lapsing →
 *                  "Add money to keep Plus".
 *   3. Become VIP — a WELL-FUNDED active subscriber who isn't a member (soft upsell).
 *
 * A brand-new ₹0 / not-yet-claimed member sees NONE of these — they get the 2+2
 * trial funnel instead (every gate is guarded by !trialShowable). Dismissing the
 * shown sheet sets ONE per-visit flag (dismissedMoney) that stands the rest down
 * for the visit, and RESETS on the next focus so the right sheet re-arms.
 */
export function PromoGate() {
  const router = useRouter();
  const { profile } = useAuth();
  const phone = profile?.phone ?? '';
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const [vip, setVip] = useState<VipMembership | null>(null);
  // True while the 2+2 TRIAL funnel is still on offer to this member — the prepaid
  // funnel must stand down then, so a not-yet-claimed member is never double-nagged
  // (trial pop-up + prepaid modal) on the same Home visit.
  const [trialShowable, setTrialShowable] = useState(false);
  // Persistent account signals that decide whether a low-wallet / VIP nag is even
  // appropriate: whether the member holds an ACTIVE subscription, and whether the
  // wallet has EVER been funded (a recharge / promo / refund credit ever landed).
  // A brand-new ₹0 account has neither, so it is never nagged (see below).
  const [hasActiveSub, setHasActiveSub] = useState(false);
  // A subscription auto-paused by a low wallet — the funnel must push a recharge to
  // RESUME it (this is exactly the "wallet low + delivery paused" case to cover).
  const [hasPausedSub, setHasPausedSub] = useState(false);
  const [everFunded, setEverFunded] = useState(false);
  // Whether the become-VIP soft upsell is snoozed (dismissed within the last few
  // days) — so it never nags a happy subscriber on every single Home visit.
  const [vipUpsellOff, setVipUpsellOff] = useState(true);
  // ONE money sheet per Home visit (the reference funnel's discipline): dismissing
  // whichever modal is showing stands the rest DOWN for this visit — no chained
  // nags where closing one instantly pops the next. Reset on every focus so the
  // right one re-arms on the next visit.
  const [dismissedMoney, setDismissedMoney] = useState(false);
  // Only evaluate once fresh wallet + membership signals are in, so a cold ₹0
  // balance never flashes the low-balance modal before the real balance loads.
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Re-arm: a sheet dismissed on a previous visit shows again this visit.
      setDismissedMoney(false);
      setReady(false);
      Promise.all([
        refreshWallet().catch(() => {}),
        getVip().then((m) => { if (active) setVip(m); }).catch(() => {}),
        listSubscriptions()
          .then((subs) => {
            if (!active) return;
            // Exclude one-time orders — they are not ongoing subscriptions.
            setHasActiveSub(subs.some((s) => s.status === 'active' && s.frequency !== 'one_time'));
            setHasPausedSub(subs.some((s) => s.status === 'paused' && s.frequency !== 'one_time'));
          })
          .catch(() => { if (active) { setHasActiveSub(false); setHasPausedSub(false); } }),
        // "Ever funded" = any incoming ledger credit (recharge / promo reward /
        // refund). A brand-new account's ledger is empty, so this stays false.
        getLedger()
          .then((rows) => { if (active) setEverFunded(rows.some((r) => r.type === 'credit' || r.type === 'reward' || r.type === 'refund')); })
          .catch(() => { if (active) setEverFunded(false); }),
        // Is the 2+2 trial still on offer? If so, this member gets the trial funnel,
        // not the prepaid one.
        freePackShowEligible(phone)
          .then((s) => { if (active) setTrialShowable(s); })
          .catch(() => { if (active) setTrialShowable(false); }),
        vipUpsellSnoozed()
          .then((v) => { if (active) setVipUpsellOff(v); })
          .catch(() => { if (active) setVipUpsellOff(true); }),
      ]).finally(() => { if (active) setReady(true); });
      return () => { active = false; };
    }, [refreshWallet, phone])
  );

  const lowEligible = balance < LOW_BALANCE_THRESHOLD;
  // PREPAID FUNNEL — the existing-member money funnel (Country-Delight style):
  // members with skin in the game (an active subscription OR an ever-funded
  // wallet) whose prepaid balance is below the target are nudged to top up and
  // collect the bonus. Brand-new ₹0 accounts are never nagged here — they get the
  // 2+2 trial funnel instead. This SUPERSEDES the old plain "low balance" nag
  // (balance < ₹200 ⊂ balance < target), folding urgency into the same modal.
  // Money-first, one sheet at a time (priority: prepaid → Plus-expiring → become-VIP).
  // Every one stands down while the 2+2 trial is still on offer (trial owns the
  // not-yet-claimed member) and once ANY money sheet is dismissed this visit.
  const showPrepaid = ready && !trialShowable && !dismissedMoney && shouldShowPrepaidFunnel({ balance, hasActiveSub, everFunded });
  const tier = prepaidTier();
  const critical = lowEligible; // balance so low tomorrow's delivery could pause
  const daysLeft = vipDaysLeft(vip);
  // PLUS EXPIRING — an ACTIVE Plus member whose period ends within the warning
  // window. Push a recharge so it renews (keeps free delivery + member prices)
  // instead of silently lapsing.
  const showVipExpiring =
    ready && !trialShowable && !dismissedMoney && !showPrepaid && vipActive(vip) && daysLeft <= VIP_EXPIRY_WARN_DAYS;
  // Become-VIP is a soft UPSELL for a WELL-FUNDED active subscriber who isn't a
  // member — NOT a low-balance case (that gets the prepaid recharge modal, which
  // would always out-prioritise it and left this permanently unreachable before).
  const showVip =
    ready && !trialShowable && !dismissedMoney && !showPrepaid && !showVipExpiring && !vipUpsellOff &&
    !vipActive(vip) && hasActiveSub && balance >= PREPAID_TARGET;
  // A LAPSED member (Plus record exists but expired/cancelled) is asked to RENEW,
  // not to "start a free trial" — that copy is only right for a never-joined user.
  const lapsedVip = !!vip && !vipActive(vip);

  return (
    <>
      <PromoModal
        visible={showPrepaid}
        onClose={() => setDismissedMoney(true)}
        accent={colors.flameDeep}
        icon="wallet"
        badge={hasPausedSub ? 'DELIVERY PAUSED' : 'GO PREPAID'}
        title={hasPausedSub ? 'Your delivery is paused' : 'Go prepaid for one-tap mornings'}
        body={
          hasPausedSub
            ? `Balance ${rupee(balance)}. Your daily milk is PAUSED because the wallet ran low. Add ${rupee(PREPAID_TARGET)} and it resumes from tomorrow.`
            : critical
              ? `Balance ${rupee(balance)}. Add ${rupee(PREPAID_TARGET)} to your PYAAS Wallet so tomorrow's morning delivery never pauses.`
              : `Add ${rupee(PREPAID_TARGET)} to your PYAAS Wallet. Prepaid means one-tap mornings, no daily payments.`
        }
        cta={hasPausedSub ? `Add ${rupee(PREPAID_TARGET)} · resume delivery` : `Add ${rupee(PREPAID_TARGET)} to wallet`}
        onAccept={() => { setDismissedMoney(true); router.push(`/recharge?amount=${PREPAID_TARGET}&reason=${hasPausedSub ? 'resume your paused delivery' : 'go prepaid for one-tap mornings'}`); }}
      />
      <PromoModal
        visible={showVipExpiring}
        onClose={() => setDismissedMoney(true)}
        accent={colors.blue}
        icon="star"
        badge={`${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`}
        title={vipOnTrial(vip) ? 'Your free Plus trial is ending' : 'Your PYAAS Plus is ending'}
        body={`Your PYAAS Plus ${vipOnTrial(vip) ? 'trial ' : ''}ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew it to keep free delivery and member prices, it won't renew on its own.`}
        cta="Renew Plus"
        onAccept={() => { setDismissedMoney(true); router.push('/(tabs)/vip'); }}
      />
      <PromoModal
        visible={showVip}
        onClose={() => { setDismissedMoney(true); void snoozeVipUpsell(); }}
        accent={colors.blue}
        icon="star"
        badge={lapsedVip ? 'MEMBER PERKS' : `${PLUS_TRIAL_DAYS} DAYS FREE`}
        title={lapsedVip ? 'Renew PYAAS Plus' : 'Become a PYAAS VIP'}
        body={
          lapsedVip
            ? 'Priority morning slots, free delivery and member-only offers. Renew your PYAAS Plus and keep the perks. Cancel anytime.'
            : 'Priority morning slots, free delivery and member-only offers. Start your free trial. No card needed, cancel anytime.'
        }
        cta={lapsedVip ? 'Renew Plus' : 'Become VIP'}
        onAccept={() => { setDismissedMoney(true); void snoozeVipUpsell(); router.push('/(tabs)/vip'); }}
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
