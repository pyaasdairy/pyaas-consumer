import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeModal } from './SafeModal';
import { getFoundingFamily } from '../lib/foundingFamily';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { ShineSweep } from './Fx';
import { useWallet } from '../store/wallet';
import { useAuth } from '../lib/auth';
import { getVip, vipActive, vipDaysLeft, vipOnTrial, vipUpsellSnoozed, snoozeVipUpsell, PLUS_PRICE_MONTH, VIP_EXPIRY_WARN_DAYS, type VipMembership } from '../lib/vip';
import { LOW_BALANCE_THRESHOLD } from '../lib/pricing';
import { PREPAID_TARGET, prepaidTier, shouldShowPrepaidFunnel } from '../lib/prepaid';
import { getLedger } from '../lib/walletApi';
import { listSubscriptions } from '../lib/subscriptions';
import { useAutoPopup } from '../lib/popupGate';

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
 * Welcome Litre funnel instead (its surfaces own acquisition). Dismissing the
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
  const [ffOpen, setFfOpen] = useState(false);
  const [ffMember, setFfMember] = useState(false);
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
        vipUpsellSnoozed()
          .then((v) => { if (active) setVipUpsellOff(v); })
          .catch(() => { if (active) setVipUpsellOff(true); }),
        // Is Founding Family open on the backend, and is this member already in?
        getFoundingFamily()
          .then((v) => {
            if (!active) return;
            setFfOpen(!!v);
            setFfMember(!!v?.member && v.member.status !== 'stopped');
          })
          .catch(() => { if (active) setFfOpen(false); }),
      ]).finally(() => { if (active) setReady(true); });
      return () => { active = false; };
    }, [refreshWallet, phone])
  );

  const lowEligible = balance < LOW_BALANCE_THRESHOLD;
  // PREPAID FUNNEL — the existing-member money funnel (Country-Delight style):
  // members with skin in the game (an active subscription OR an ever-funded
  // wallet) whose prepaid balance is below the target are nudged to top up and
  // collect it. Brand-new ₹0 accounts are never nagged here (shouldShowPrepaidFunnel
  // requires skin in the game). This SUPERSEDES the old plain "low balance" nag
  // (balance < ₹200 ⊂ balance < target), folding urgency into the same modal.
  // Money-first, one sheet at a time (priority: prepaid → Plus-expiring → become-VIP).
  // Every one stands down once ANY money sheet is dismissed this visit.
  // ONE POPUP AT A TIME: the money nudges are the lowest-priority popups —
  // they stand down whenever anything else (out-of-zone, welcome, claim) is up.
  // Claim-based (useAutoPopup): the old read-then-register pattern saw its OWN
  // slot as "another popup" and cancelled itself in an open/close loop.
  const wantPrepaid = ready && !dismissedMoney && shouldShowPrepaidFunnel({ balance, hasActiveSub, everFunded });
  const tier = prepaidTier();
  const critical = lowEligible; // balance so low tomorrow's delivery could pause
  // FOUNDING FAMILY UPSELL (replaces "Become a PYAAS VIP", founder call 21 Sep):
  // a soft invitation for a WELL-FUNDED active subscriber, shown only when the
  // backend actually offers Founding Family (ffOpen) and they are not already
  // in it. The old "Plus is ending / Renew Plus" sheets are gone with the old
  // one-month local membership; Founding Family billing is server-side.
  const wantVip =
    ready && !dismissedMoney && !wantPrepaid && !vipUpsellOff &&
    ffOpen && !ffMember && hasActiveSub && balance >= PREPAID_TARGET;

  const showAny = useAutoPopup(wantPrepaid || wantVip);
  const showPrepaid = showAny && wantPrepaid;
  const showVip = showAny && wantVip;

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
        visible={showVip}
        onClose={() => { setDismissedMoney(true); void snoozeVipUpsell(); }}
        accent={colors.blue}
        icon="star"
        badge="FOUNDING FAMILY"
        title="Join the Founding Family"
        body={`Whole milk from one farm you choose. Free delivery every morning and ₹2 off every litre of PYAAS milk. ${rupee(PLUS_PRICE_MONTH)} a month, starts when your farm opens · stop any month.`}
        cta="Pick your farm"
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
  // Always-mounted, visibility-driven: a focus re-evaluation that flips one
  // promo off and another on in the same commit becomes a queued
  // dismiss-then-present instead of an unserialized native swap.
  return (
    <SafeModal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
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
    </SafeModal>
  );
}
