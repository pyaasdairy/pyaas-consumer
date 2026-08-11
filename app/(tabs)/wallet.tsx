import React, { useCallback, useState } from 'react';
import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill } from '../../components/ui';
import { FloatingParticles, ShineSweep, useCountUp } from '../../components/Fx';
import { useTabBarClearance } from '../../components/PyaasTabBar';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { useWallet } from '../../store/wallet';
import { rechargeBonus, LOW_BALANCE_THRESHOLD } from '../../lib/pricing';
import { getAutopay, setupAutopay, cancelAutopay, approveAutopay, getSpendSummary, type AutopayMandate } from '../../lib/walletApi';

// Quick recharge packs surfaced on the dashboard (bonus resolved from pricing).
const QUICK_PACKS = [500, 1000, 2000];
// Auto top-up presets (threshold to trip at · amount to add).
const TOPUP_THRESHOLDS = [100, 200, 300];
const TOPUP_AMOUNTS = [500, 1000, 2000];

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const router = useRouter();
  const balance = useWallet((s) => s.balance);
  const cash = useWallet((s) => s.cash);
  const promo = useWallet((s) => s.promo);
  const lowBalance = useWallet((s) => s.lowBalance);
  const refresh = useWallet((s) => s.refresh);
  const [autopay, setAutopay] = useState<AutopayMandate | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [burn, setBurn] = useState(0);
  const [amount, setAmount] = useState('');
  const [threshold, setThreshold] = useState(TOPUP_THRESHOLDS[1]);
  const [topupAmt, setTopupAmt] = useState(TOPUP_AMOUNTS[1]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const onScroll = useHideTabBarOnScroll();

  const load = useCallback(async () => {
    await refresh();
    const [ap, spend] = await Promise.all([getAutopay(), getSpendSummary()]);
    setAutopay(ap && ap.status !== 'cancelled' ? ap : null);
    setDays(spend.daysRemaining);
    setBurn(spend.dailyBurn);
    if (ap && ap.status !== 'cancelled') {
      if (ap.threshold) setThreshold(ap.threshold);
      if (ap.recharge_amount) setTopupAmt(ap.recharge_amount);
    }
  }, [refresh]);

  // Loops only run while the tab is focused (nothing ticks in the background).
  useFocusEffect(useCallback(() => {
    setFocused(true);
    load();
    return () => setFocused(false);
  }, [load]));

  const shownBalance = useCountUp(balance, 1000, focused); // count-up on load
  const amt = Number(amount) || 0;
  const bonus = rechargeBonus(amt);
  const autopayOn = !!autopay;

  function doRecharge(value: number) {
    if (value <= 0) return;
    setAmount('');
    router.push(`/recharge?amount=${value}`);
  }

  async function saveTopup() {
    setBusy(true);
    try {
      await setupAutopay({ maxAmount: topupAmt, threshold, rechargeAmount: topupAmt, upiId: autopay?.upi_id ?? undefined });
      await load();
    } finally { setBusy(false); }
  }
  // The customer approving the mandate in their Paytm app (in production this
  // opens the Paytm deeplink; the PSP webhook then activates the mandate).
  async function approveInPaytm() {
    if (!autopay) return;
    setBusy(true);
    try { await approveAutopay(autopay.id); await load(); }
    finally { setBusy(false); }
  }
  async function turnOffTopup() {
    if (!autopay) return;
    setBusy(true);
    try { await cancelAutopay(autopay.id); await load(); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Serif style={{ fontSize: 30 }}>PYAAS Wallet</Serif>
        <Tap onPress={() => router.push('/wallet-statement')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="receipt-outline" size={16} color={colors.flameDeep} />
          <TextMed color={colors.flameDeep} style={{ fontSize: 13 }}>Statement</TextMed>
        </Tap>
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: tabClearance }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Balance · solid card, motion does the work: count-up + sparks + shine.
            Effects stay INSIDE the clipped card (no glow halo bleeding outside). */}
        <Animated.View entering={FadeInDown.duration(460)}>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.flameDeep, ...shadow.card }}>
            {focused ? <FloatingParticles count={12} height={168} /> : null}
            <View style={{ padding: spacing.lg, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="wallet" size={13} color={colors.white} />
                </View>
                <TextMed color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>Available balance</TextMed>
              </View>
              <Serif color={colors.white} style={{ fontFamily: fonts.serifBlack, fontSize: 44, letterSpacing: -0.5, ...tabular }}>{rupee(shownBalance)}</Serif>

              {/* Cash vs promo split */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <SplitChip label="Cash" value={cash} />
                <SplitChip label="Rewards" value={promo} />
              </View>

              {days != null ? (
                <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5, marginTop: 8 }}>
                  About {days} {days === 1 ? 'day' : 'days'} of milk left at ~{rupee(burn)}/day.
                </TextBody>
              ) : (
                <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5, marginTop: 8 }}>Every payment & cashback reflects here.</TextBody>
              )}
            </View>
            {focused ? <ShineSweep dur={3400} travel={420} bandWidth={100} delay={500} /> : null}
          </View>
        </Animated.View>

        {/* Low-balance warning */}
        {lowBalance ? (
          <Animated.View entering={FadeIn.duration(260)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.flameSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.flame, padding: spacing.md }}>
              <Ionicons name="alert-circle" size={20} color={colors.flameDeep} />
              <TextMed color={colors.flameDeep} style={{ flex: 1, fontSize: 13 }}>
                Low balance (under {rupee(LOW_BALANCE_THRESHOLD)}). Top up so your deliveries never pause.
              </TextMed>
            </View>
          </Animated.View>
        ) : null}

        {/* AutoPay · Paytm UPI mandate (real lifecycle: setup → approve in Paytm → active) */}
        <Animated.View entering={FadeInDown.duration(460).delay(80)}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.lg, gap: 12, ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flash" size={18} color={colors.flameDeep} />
              <TextSemi style={{ flex: 1, fontSize: 16 }}>AutoPay · Paytm UPI</TextSemi>
              <Pill
                label={autopay?.status === 'pending' ? 'APPROVE' : autopay?.status === 'paused' ? 'PAUSED' : autopayOn ? 'ON' : 'OFF'}
                bg={autopayOn ? colors.flameSoft : colors.cream}
                color={autopayOn ? colors.flameDeep : colors.inkMute}
              />
            </View>

            {autopay?.status === 'pending' ? (
              <>
                <TextBody style={{ fontSize: 13 }}>
                  Your UPI AutoPay mandate (cap {rupee(autopay.max_amount)}/debit) is waiting for your approval in Paytm.
                </TextBody>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Approve in Paytm" small style={{ flex: 1 }} loading={busy} onPress={approveInPaytm} />
                  <Button title="Cancel" variant="outline" small style={{ flex: 1 }} onPress={turnOffTopup} />
                </View>
              </>
            ) : autopayOn ? (
              <>
                <TextBody style={{ fontSize: 13 }}>
                  When your balance drops below {rupee(autopay?.threshold ?? threshold)}, Paytm AutoPay adds {rupee(autopay?.recharge_amount ?? topupAmt)} automatically, and settles deliveries if the wallet runs short.
                </TextBody>
                {autopay?.umn ? (
                  <TextBody color={colors.inkMute} style={{ fontSize: 11 }} numberOfLines={1}>Mandate (UMN): {autopay.umn}</TextBody>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Manage" variant="outline" small style={{ flex: 1 }} onPress={() => router.push('/autopay')} />
                  <Button title="Turn off" variant="outline" small style={{ flex: 1 }} loading={busy} onPress={turnOffTopup} />
                </View>
              </>
            ) : (
              <>
                <TextBody style={{ fontSize: 13 }}>Never run dry. A UPI AutoPay mandate with Paytm recharges your wallet before it runs out. Approved once, capped per debit, cancellable any time.</TextBody>
                <View style={{ gap: 8 }}>
                  <TextMed color={colors.inkSoft} style={{ fontSize: 12.5 }}>When balance falls below</TextMed>
                  <ChipRow options={TOPUP_THRESHOLDS} value={threshold} onChange={setThreshold} />
                </View>
                <View style={{ gap: 8 }}>
                  <TextMed color={colors.inkSoft} style={{ fontSize: 12.5 }}>Add this amount (per-debit cap)</TextMed>
                  <ChipRow options={TOPUP_AMOUNTS} value={topupAmt} onChange={setTopupAmt} />
                </View>
                <Button title="Set up Paytm AutoPay" loading={busy} onPress={saveTopup} />
              </>
            )}
          </View>
        </Animated.View>

        {/* Quick recharge packs */}
        <Animated.View entering={FadeInDown.duration(460).delay(140)} style={{ gap: 10 }}>
          <TextSemi style={{ fontSize: 16 }}>Quick recharge</TextSemi>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {QUICK_PACKS.map((value, i) => {
              const b = rechargeBonus(value);
              return (
                <Animated.View key={value} entering={FadeInDown.duration(420).delay(180 + i * 70)} style={{ flex: 1 }}>
                  <Tap onPress={() => doRecharge(value)} scaleTo={0.95} style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, gap: 2, alignItems: 'center', ...shadow.soft }}>
                    <TextSemi style={{ fontSize: 15, ...tabular }}>{rupee(value)}</TextSemi>
                    {b ? <TextBody style={{ fontSize: 11, ...tabular }} color={colors.flameDeep}>+{rupee(b.bonus)} {b.kind === 'cashback' ? 'cashback' : 'free'}</TextBody> : null}
                  </Tap>
                </Animated.View>
              );
            })}
          </View>

          {/* Custom amount */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 52 }}>
            <Serif style={{ fontSize: 20 }} color={colors.inkMute}>₹</Serif>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Custom amount" placeholderTextColor={colors.inkMute} style={{ flex: 1, fontFamily: fonts.sansSemi, fontSize: 18, color: colors.ink, ...tabular }} />
            <Button title="Add" small disabled={amt <= 0} onPress={() => doRecharge(amt)} style={{ paddingHorizontal: 22 }} />
          </View>
          {bonus ? (
            <Animated.View entering={FadeIn.duration(260)}>
              <TextMed color={colors.blue} style={{ fontSize: 12.5 }}>
                You will get {rupee(bonus.bonus)} {bonus.kind === 'cashback' ? 'cashback' : 'free'} on this recharge.
              </TextMed>
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* Statement link */}
        <Animated.View entering={FadeInDown.duration(460).delay(220)}>
          <Tap onPress={() => router.push('/wallet-statement')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="receipt-outline" size={18} color={colors.flameDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <TextSemi style={{ fontSize: 15 }}>Wallet statement</TextSemi>
              <TextBody style={{ fontSize: 12 }}>Every credit and debit, with a downloadable copy.</TextBody>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
          </Tap>
        </Animated.View>

        <TextBody style={{ fontSize: 11, textAlign: 'center' }}>
          Your PYAAS wallet pays for every order and reflects instantly.
        </TextBody>
      </Animated.ScrollView>
    </View>
  );
}

function SplitChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 }}>
      <TextBody color="rgba(255,255,255,0.85)" style={{ fontSize: 11 }}>{label}</TextBody>
      <TextSemi color={colors.white} style={{ fontSize: 16, ...tabular }}>{rupee(value)}</TextSemi>
    </View>
  );
}

function ChipRow({ options, value, onChange }: { options: number[]; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Tap key={o} onPress={() => onChange(o)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? colors.flameDeep : colors.wash, borderWidth: 1, borderColor: on ? colors.flameDeep : colors.line }}>
            <TextSemi color={on ? colors.white : colors.ink} style={{ fontSize: 14, ...tabular }}>{rupee(o)}</TextSemi>
          </Tap>
        );
      })}
    </View>
  );
}
