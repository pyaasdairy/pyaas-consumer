import React, { useCallback, useState } from 'react';
import { View, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, Button, BackButton } from '../components/ui';
import { getFullProfile } from '../lib/profileApi';
import { getReferralStats } from '../lib/profileApi';
import { REFERRAL_REWARD } from '../lib/pricing';

export default function Refer() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [stats, setStats] = useState({ count: 0, earned: 0 });

  useFocusEffect(useCallback(() => {
    getFullProfile().then((p) => setCode(p?.referral_code ?? ''));
    getReferralStats().then(setStats);
  }, []));

  async function share() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Join me on PYAAS, India’s traceable dairy. Use my code ${code} when you sign up. Know your milk! https://pyaasdairy.com`,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Refer & earn</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: colors.roseDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 10, ...shadow.card }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="gift" size={22} color={colors.white} />
          </View>
          <Serif color={colors.white} style={{ fontSize: 26, lineHeight: 30 }}>Gift {rupee(REFERRAL_REWARD)},{'\n'}get {rupee(REFERRAL_REWARD)}.</Serif>
          <TextBody color="rgba(255,255,255,0.95)" style={{ fontSize: 13.5 }}>
            For every family that signs up with your code, {rupee(REFERRAL_REWARD)} lands in your PYAAS Wallet.
          </TextBody>
        </View>

        {/* Code card */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.rose, padding: spacing.lg, alignItems: 'center', gap: 8, ...shadow.soft }}>
          <TextBody style={{ fontSize: 12.5 }}>Your unique referral code</TextBody>
          <Serif style={{ fontSize: 30, letterSpacing: 2 }} color={colors.roseDeep}>{code || '-'}</Serif>
          <Button title="Share my code" onPress={share} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Stat label="Families joined" value={`${stats.count}`} />
          <Stat label="Earned" value={rupee(stats.earned)} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="information-circle" size={18} color={colors.sage} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.sage}>The reward is credited automatically when your friend completes signup.</TextBody>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
      <TextBody style={{ fontSize: 12 }}>{label}</TextBody>
      <Serif style={{ fontSize: 24 }}>{value}</Serif>
    </View>
  );
}
