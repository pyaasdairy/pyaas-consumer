import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, rupee, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../../components/ui';
import { haptics } from '../../lib/haptics';
import { useWallet } from '../../store/wallet';
import { MIN_RECHARGE } from '../../lib/pricing';
import { getFoundingFamily, homesToGo, joinFoundingFamily, type Farm } from '../../lib/foundingFamily';

/**
 * JOIN, PAY ₹99 (spec screen 6). Plain words on when the money moves: ₹99
 * today, nothing more until the farm unlocks, then ₹99 a month, stop any month.
 * The ₹99 is taken from the PYAAS Wallet by the SERVER (booked against
 * FOUNDING-99); if the wallet is short the member tops up first and comes back
 * here with the farm still chosen.
 */
export default function JoinFoundingFamily() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { farm: farmId } = useLocalSearchParams<{ farm?: string }>();
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useFocusEffect(useCallback(() => {
    let on = true;
    void refreshWallet();
    getFoundingFamily().then((v) => {
      if (!on) return;
      setFarm(v?.farms.find((f) => f.id === farmId) ?? null);
      setPrice(v?.price_month ?? null);
      setLoading(false);
    });
    return () => { on = false; };
  }, [farmId, refreshWallet]));

  async function pay() {
    if (!farm || price == null) return;
    setErr('');
    await refreshWallet();
    const bal = useWallet.getState().balance;
    if (bal < price) {
      // Top up first; the recharge floor applies, and we come straight back.
      router.push(`/recharge?amount=${MIN_RECHARGE}&reason=to join the Founding Family&returnTo=${encodeURIComponent(`/founding-family/join?farm=${farm.id}`)}`);
      return;
    }
    setBusy(true);
    try {
      await joinFoundingFamily(farm.id);
      haptics.confirm();
      await refreshWallet();
      router.replace('/(tabs)/vip');
    } catch (e: any) {
      if (e?.code === 'WALLET_SHORT') {
        router.push(`/recharge?amount=${MIN_RECHARGE}&reason=to join the Founding Family&returnTo=${encodeURIComponent(`/founding-family/join?farm=${farm.id}`)}`);
        return;
      }
      if (e?.code === 'ALREADY_MEMBER') { router.replace('/(tabs)/vip'); return; }
      setErr(e?.message ?? 'Could not complete that. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const togo = farm ? homesToGo(farm) : 0;
  const shortName = farm ? farm.name.replace(/ Dairy.*$/, '') : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 22, flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>Join the Founding Family</Serif>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 30 }} />
      ) : !farm || price == null ? (
        <View style={{ margin: spacing.lg, backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 4 }}>
          <TextSemi style={{ fontSize: 15 }}>This farm is not open for claims</TextSemi>
          <Tap haptic={false} onPress={() => router.back()}><TextMed color={colors.flameDeep} style={{ fontSize: 13 }}>Pick another farm</TextMed></Tap>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 2, ...shadow.soft }}>
            <TextMed style={{ fontSize: 12 }} color={colors.inkMute}>Your farm</TextMed>
            <TextSemi style={{ fontSize: 16 }}>{farm.name} · {farm.farmer}</TextSemi>
            <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>{togo} more {togo === 1 ? 'home' : 'homes'} to unlock</TextBody>
          </View>

          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
            {[
              ['Today', rupee(price)],
              [`Until ${shortName} unlocks`, 'Nothing more'],
              ['After it unlocks', `${rupee(price)} a month`],
              ['Stop', 'Any month'],
            ].map(([k, v], i) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <TextBody style={{ fontSize: 13.5, flex: 1 }} color={colors.inkSoft}>{k}</TextBody>
                <TextSemi style={{ fontSize: 14, ...tabular }}>{v}</TextSemi>
              </View>
            ))}
          </View>

          <View style={{ gap: 6 }}>
            {[
              `Your first ${rupee(price)} waits until your farm opens; your month starts on its first delivery.`,
              `Not unlocked within 60 days of launch? Full ${rupee(price)} back.`,
              'Parag milk, ghee and the wallet are open to you now, with or without joining.',
            ].map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
                <TextBody style={{ fontSize: 13 }} color={colors.inkSoft}>•</TextBody>
                <TextBody style={{ fontSize: 13, lineHeight: 19, flex: 1 }} color={colors.inkSoft}>{line}</TextBody>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, gap: 2 }}>
            <TextMed style={{ fontSize: 12 }} color={colors.inkMute}>Pay from</TextMed>
            <TextSemi style={{ fontSize: 14.5, ...tabular }}>PYAAS Wallet · {rupee(balance)}</TextSemi>
            <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>Secure payment through your PYAAS Wallet.</TextBody>
          </View>

          {err ? <TextBody color={colors.dangerDeep} style={{ fontSize: 13 }}>{err}</TextBody> : null}

          <Tap onPress={busy ? undefined : pay}>
            <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
              {busy ? <ActivityIndicator color={colors.white} /> : null}
              <TextSemi color={colors.white} style={{ fontSize: 16, ...tabular }}>{busy ? 'Holding your seat…' : `Pay ${rupee(price)} · hold my seat`}</TextSemi>
            </View>
          </Tap>
        </ScrollView>
      )}
    </View>
  );
}
