import React, { useCallback, useState } from 'react';
import { View, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextSemi, Button, BackButton } from '../components/ui';
import { ShineSweep } from '../components/Fx';
import { getReferralCode, listReferralStats, listReferrals, REFERRAL_REWARD, type Referral } from '../lib/referrals';

export default function Refer() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [stats, setStats] = useState({ count: 0, pending: 0, earned: 0 });
  const [rows, setRows] = useState<Referral[]>([]);

  useFocusEffect(
    useCallback(() => {
      getReferralCode().then(setCode);
      listReferralStats().then(setStats);
      listReferrals().then(setRows);
    }, [])
  );

  async function share() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Join me on PARAG, Uttar Pradesh's own dairy cooperative. Use my code ${code} when you sign up. Sehat ki Dhara! https://www.paragdairy.com`,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Refer and earn</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {/* Hero — solid flame, shine sweep clipped inside the card */}
        <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 10, overflow: 'hidden', ...shadow.card }}>
          <ShineSweep />
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="gift" size={22} color={colors.white} />
          </View>
          <Serif color={colors.white} style={{ fontSize: 26, lineHeight: 30 }}>
            Gift {rupee(REFERRAL_REWARD)},{'\n'}get {rupee(REFERRAL_REWARD)}.
          </Serif>
          <TextBody color="rgba(255,255,255,0.95)" style={{ fontSize: 13.5 }}>
            For every family that joins the cooperative with your code, {rupee(REFERRAL_REWARD)} lands in your PARAG Wallet.
          </TextBody>
        </View>

        {/* Code card */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flameSoft, padding: spacing.lg, alignItems: 'center', gap: 8, ...shadow.soft }}>
          <TextBody style={{ fontSize: 12.5 }}>Your unique referral code</TextBody>
          <Serif style={{ fontSize: 30, letterSpacing: 2 }} color={colors.flameDeep}>{code || '-'}</Serif>
          <Button title="Share my code" onPress={share} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Stat label="Families joined" value={`${stats.count}`} />
          <Stat label="Earned" value={rupee(stats.earned)} />
        </View>

        {/* Ledger */}
        {rows.length ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, ...shadow.soft }}>
            <TextSemi style={{ fontSize: 13, marginBottom: 6 }} color={colors.inkSoft}>Your invites</TextSemi>
            {rows.map((r, i) => (
              <View
                key={r.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.line,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={r.status === 'credited' ? 'checkmark-circle' : 'time-outline'} size={18} color={r.status === 'credited' ? colors.blue : colors.inkMute} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 14 }}>{r.name}</TextSemi>
                  <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>{r.status === 'credited' ? 'Reward credited' : 'Waiting on signup'}</TextBody>
                </View>
                <Serif style={{ fontSize: 15 }} color={r.status === 'credited' ? colors.blue : colors.inkMute}>{r.status === 'credited' ? '+' : ''}{rupee(r.reward_amount)}</Serif>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="information-circle" size={18} color={colors.blue} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.blue}>The reward is credited automatically once your friend completes signup.</TextBody>
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
