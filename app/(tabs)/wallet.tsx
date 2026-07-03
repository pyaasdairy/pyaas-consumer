import React, { useCallback, useState } from 'react';
import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, Divider } from '../../components/ui';
import { FloatingParticles, ShineSweep, useCountUp } from '../../components/VipFx';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { useWallet } from '../../store/wallet';
import { RECHARGE_TIERS, rechargeBonus } from '../../lib/pricing';
import { getTransactions, getAutopay, type WalletTxn, type AutopayMandate } from '../../lib/walletApi';

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const balance = useWallet((s) => s.balance);
  const refresh = useWallet((s) => s.refresh);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [autopay, setAutopay] = useState<AutopayMandate | null>(null);
  const [amount, setAmount] = useState('');
  const [busy] = useState(false);
  const [focused, setFocused] = useState(true);
  const onScroll = useHideTabBarOnScroll();

  const load = useCallback(async () => {
    await refresh();
    setTxns(await getTransactions());
    setAutopay(await getAutopay());
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

  function doRecharge(value: number) {
    if (value <= 0) return;
    setAmount('');
    router.push(`/payment?amount=${value}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Serif style={{ fontSize: 30 }}>PYAAS Wallet</Serif>
      </View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 130 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Balance · solid card, motion does the work: count-up + sparks + shine.
            Effects stay INSIDE the clipped card (no glow halo bleeding outside). */}
        <Animated.View entering={FadeInDown.duration(460)}>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.roseDeep, ...shadow.card }}>
            {focused ? <FloatingParticles count={12} height={150} /> : null}
            <View style={{ padding: spacing.lg, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="wallet" size={13} color={colors.white} />
                </View>
                <TextMed color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>Available balance</TextMed>
              </View>
              <Serif color={colors.white} style={{ fontFamily: fonts.serifBlack, fontSize: 44, letterSpacing: -0.5, ...tabular }}>{rupee(shownBalance)}</Serif>
              <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5 }}>Every payment & cashback reflects here.</TextBody>
            </View>
            {focused ? <ShineSweep dur={3400} travel={420} bandWidth={100} delay={500} /> : null}
          </View>
        </Animated.View>

        {/* Smart recharge */}
        <Animated.View entering={FadeInDown.duration(460).delay(80)}>
          <Tap haptic={false} onPress={() => router.push('/autopay')}>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.rose, padding: spacing.lg, gap: 10, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash" size={18} color={colors.roseDeep} />
                <TextSemi style={{ flex: 1, fontSize: 16 }}>Smart Recharge · PYAAS MONEY</TextSemi>
                {autopay ? <Pill label="ON" bg={colors.roseSoft} color={colors.roseDeep} /> : <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />}
              </View>
              <TextBody style={{ fontSize: 13 }}>
                {autopay
                  ? `Autopay active · ${autopay.upi_id ?? 'UPI'} · cap ${rupee(autopay.max_amount)}. Tap to manage.`
                  : 'Auto-pay via UPI so your milk never stops. Set up in 30 seconds.'}
              </TextBody>
            </View>
          </Tap>
        </Animated.View>

        {/* Add money */}
        <Animated.View entering={FadeInDown.duration(460).delay(140)} style={{ gap: 10 }}>
          <TextSemi style={{ fontSize: 16 }}>Add money</TextSemi>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 52 }}>
            <Serif style={{ fontSize: 20 }} color={colors.inkMute}>₹</Serif>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Custom amount" placeholderTextColor={colors.inkMute} style={{ flex: 1, fontFamily: fonts.sansSemi, fontSize: 18, color: colors.ink, ...tabular }} />
            <Button title="Add" small disabled={amt <= 0 || busy} onPress={() => doRecharge(amt)} style={{ paddingHorizontal: 22 }} />
          </View>
          {bonus ? (
            <Animated.View entering={FadeIn.duration(260)}>
              <TextMed color={colors.sage} style={{ fontSize: 12.5 }}>
                You will get {rupee(bonus.bonus)} {bonus.kind === 'cashback' ? 'cashback' : 'free'} on this recharge.
              </TextMed>
            </Animated.View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {RECHARGE_TIERS.map((t, i) => (
              <Animated.View key={t.amount} entering={FadeInDown.duration(420).delay(180 + i * 70)} style={{ flexGrow: 1, minWidth: '47%' }}>
                <Tap onPress={() => doRecharge(t.amount)} scaleTo={0.95} style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.rose, padding: spacing.md, gap: 2, ...shadow.soft }}>
                  <TextSemi style={{ fontSize: 15, ...tabular }}>{rupee(t.amount)}</TextSemi>
                  <TextBody style={{ fontSize: 12, ...tabular }} color={colors.roseDeep}>+{rupee(t.bonus)} {t.kind === 'cashback' ? 'cashback' : 'free'}</TextBody>
                </Tap>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Ledger */}
        <Animated.View entering={FadeInDown.duration(460).delay(220)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 16, marginBottom: 6 }}>Transactions</TextSemi>
          {txns.length === 0 ? (
            <TextBody style={{ fontSize: 13, paddingVertical: 8 }}>No transactions yet.</TextBody>
          ) : (
            txns.map((t, i) => (
              <Animated.View key={t.id} layout={LinearTransition.springify().damping(18).stiffness(200)} entering={FadeInDown.duration(380).delay(Math.min(i, 8) * 45)} exiting={FadeOutUp.duration(180)}>
                {i > 0 ? <Divider /> : <View style={{ height: 8 }} />}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <TextMed style={{ fontSize: 14 }} numberOfLines={1}>{t.description ?? t.category}</TextMed>
                    <TextBody style={{ fontSize: 11.5, ...tabular }}>{new Date(t.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TextBody>
                  </View>
                  <TextSemi color={t.direction === 'credit' ? colors.sage : colors.ink} style={{ fontSize: 15, ...tabular }}>
                    {t.direction === 'credit' ? '+' : '−'}{rupee(t.amount)}
                  </TextSemi>
                </View>
              </Animated.View>
            ))
          )}
        </Animated.View>

        <TextBody style={{ fontSize: 11, textAlign: 'center' }}>
          Your PYAAS wallet pays for every order and reflects instantly.
        </TextBody>
      </Animated.ScrollView>
    </View>
  );
}
