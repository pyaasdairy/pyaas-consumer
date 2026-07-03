import React, { useCallback, useState } from 'react';
import { View, Linking, Text, Alert } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap } from '../../components/ui';
import { FloatingParticles, GlowPulse, ShineSweep, useCountUp } from '../../components/VipFx';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { useAuth } from '../../lib/auth';
import { useWallet } from '../../store/wallet';
import { getFullProfile, deleteMyAccount, type FullProfile } from '../../lib/profileApi';
import { getVip, vipActive, vipDaysLeft, type VipMembership } from '../../lib/vip';
import { isAdminUser } from '../../lib/admin';

const INK = '#2A1018';
const GOLD = '#F4D061';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, session, signOut } = useAuth();
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const [full, setFull] = useState<FullProfile | null>(null);
  const [vip, setVip] = useState<VipMembership | null>(null);
  const [focused, setFocused] = useState(true);
  const onScroll = useHideTabBarOnScroll();

  const load = useCallback(async () => {
    refreshWallet();
    try {
      setFull(await getFullProfile());
      setVip(await getVip());
    } catch { /* keep last-known values */ }
  }, [refreshWallet]);
  useFocusEffect(useCallback(() => { setFocused(true); load(); return () => setFocused(false); }, [load]));

  const name = full?.full_name || profile?.full_name || 'PYAAS member';
  const email = full?.email || session?.user?.email || '';
  const active = vipActive(vip);
  const days = vipDaysLeft(vip);
  const balCount = useCountUp(balance, 1000, focused);
  const savedCount = useCountUp(vip?.total_saved ?? 0, 1100, focused);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* HERO HEADER · solid pink, motion does the work */}
        <View style={{ backgroundColor: colors.roseDeep, paddingTop: insets.top + 16, paddingBottom: 22, paddingHorizontal: spacing.lg, overflow: 'hidden', borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }}>
          {focused ? <FloatingParticles count={14} height={300} /> : null}

          <Animated.View entering={FadeInDown.duration(440)} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
              <GlowPulse color={colors.white} radius={48} run={focused} />
              <Tap haptic={false} onPress={() => router.push('/profile-edit')}>
                {full?.avatar_url ? (
                  <Image source={{ uri: full.avatar_url }} style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' }} contentFit="cover" />
                ) : (
                  <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
                    <Serif color={colors.roseDeep} style={{ fontSize: 36 }}>{name.charAt(0).toUpperCase()}</Serif>
                  </View>
                )}
              </Tap>
            </View>
            <Serif color={colors.white} style={{ fontSize: 24 }}>{name}</Serif>
            {full?.phone ? <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>{full.phone}</TextBody> : null}
            {email ? <TextBody color="rgba(255,255,255,0.8)" style={{ fontSize: 12.5 }}>{email}</TextBody> : null}
          </Animated.View>

          {/* Live stat chips */}
          <Animated.View entering={FadeInDown.duration(440).delay(120)} style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <StatChip label="VIP" value={active ? `${days}d` : '-'} />
            <StatChip label="WALLET" value={rupee(balCount)} />
            <StatChip label="SAVED" value={rupee(savedCount)} />
          </Animated.View>

          {focused ? <ShineSweep dur={3600} travel={420} bandWidth={110} delay={600} /> : null}
        </View>

        {/* QUICK CARDS · VIP + Wallet (solid, animated) */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <QuickCard index={0} title="MEMBERSHIP" sub={active ? `VIP · ${days} days left` : 'Join VIP free'} icon="diamond" bg={INK} accent={GOLD} onPress={() => router.push('/(tabs)/vip')} />
          <QuickCard index={1} title="PYAAS WALLET" sub={rupee(balance)} icon="wallet" bg={colors.roseDeep} accent={colors.white} onPress={() => router.push('/(tabs)/wallet')} />
        </View>

        {/* SECTIONS · staggered in */}
        {isAdminUser(session?.user?.email, full?.phone) ? (
          <SectionGroup delay={220} title="Admin">
            <Row icon="shield-checkmark-outline" label="Admin console" onPress={() => router.push('/admin')} last />
          </SectionGroup>
        ) : null}

        <SectionGroup delay={240} title="Products & subscriptions">
          <Row icon="storefront-outline" label="Products" onPress={() => router.push('/(tabs)')} />
          <Row icon="infinite-outline" label="My subscriptions" onPress={() => router.push('/subscriptions')} />
          <Row icon="airplane-outline" label="Set vacations" onPress={() => router.push('/vacations')} last />
        </SectionGroup>

        <SectionGroup delay={280} title="Orders & billing">
          <Row icon="receipt-outline" label="My orders" onPress={() => router.push('/(tabs)/orders')} />
          <Row icon="swap-horizontal-outline" label="Transactions" onPress={() => router.push('/transactions')} last />
        </SectionGroup>

        <SectionGroup delay={320} title="Rewards">
          <Row icon="gift-outline" label="Refer & earn ₹100" onPress={() => router.push('/refer')} />
          <Row icon="pricetags-outline" label="Coupons & offers" onPress={() => router.push('/coupons')} last />
        </SectionGroup>

        <SectionGroup delay={360} title="Account & preferences">
          <Row icon="person-outline" label="My profile" onPress={() => router.push('/profile-edit')} />
          <Row icon="location-outline" label="Saved addresses" onPress={() => router.push('/addresses')} />
          <Row icon="options-outline" label="Delivery preferences" onPress={() => router.push('/delivery-preferences')} last />
        </SectionGroup>

        <SectionGroup delay={400} title="Know your milk">
          <Row icon="qr-code-outline" label="Know your milk" onPress={() => router.push('/know-your-milk')} />
          <Row icon="scan-outline" label="Scan a pack" onPress={() => router.push('/(tabs)/traceability')} />
          <Row icon="flask-outline" label="Quality dashboard" onPress={() => router.push('/quality')} />
          <Row icon="map-outline" label="Nearest PYAAS farm" onPress={() => router.push('/farms')} last />
        </SectionGroup>

        <SectionGroup delay={440} title="Community & impact">
          <Row icon="earth-outline" label="Sustainability" onPress={() => router.push('/sustainability')} />
          <Row icon="people-outline" label="Community" onPress={() => router.push('/community')} />
          <Row icon="business-outline" label="Business · franchise · vendor" onPress={() => router.push('/business')} last />
        </SectionGroup>

        <SectionGroup delay={480} title="Help">
          <Row icon="chatbubbles-outline" label="Help & support" onPress={() => router.push('/support')} />
          <Row icon="globe-outline" label="Visit pyaasdairy.com" onPress={() => Linking.openURL('https://pyaasdairy.com')} />
          <Row icon="document-text-outline" label="Privacy & terms" onPress={() => router.push('/legal')} last />
        </SectionGroup>

        <Animated.View entering={FadeInDown.duration(440).delay(520)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 12, alignItems: 'center' }}>
          <Button title="Sign out" variant="outline" onPress={signOut} style={{ alignSelf: 'stretch' }} />
          <Tap
            haptic={false}
            onPress={() => Alert.alert(
              'Delete account?',
              'This permanently deletes your PYAAS account, wallet, orders and personal details. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  try { await deleteMyAccount(); }
                  catch { Alert.alert('Could not delete', 'Please try again, or email hello@pyaasdairy.com.'); }
                } },
              ],
            )}
            style={{ paddingVertical: 6 }}
          >
            <TextMed color="#C0344D" style={{ fontSize: 14 }}>Delete account</TextMed>
          </Tap>
          <Image source={require('../../assets/pyaas-logo-trim.png')} style={{ width: 150, height: 150 / 3.555, opacity: 0.7 }} contentFit="contain" />
          <TextBody style={{ fontSize: 11.5 }}>Know your milk. · v{Constants.expoConfig?.version ?? '1.0.0'}</TextBody>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Text style={{ fontFamily: fonts.serifBlack, color: colors.white, fontSize: 18, ...tabular }}>{value}</Text>
      <Text style={{ fontFamily: fonts.sansMed, color: 'rgba(255,255,255,0.8)', fontSize: 10, letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
}

function QuickCard({ index, title, sub, icon, bg, accent, onPress }: { index: number; title: string; sub: string; icon: any; bg: string; accent: string; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(440).delay(180 + index * 70)} style={{ flex: 1 }}>
      <Tap onPress={onPress} scaleTo={0.96}>
        <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: bg, padding: spacing.md, height: 98, justifyContent: 'space-between', ...shadow.card }}>
          <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={accent} />
          </View>
          <View>
            <Text style={{ fontFamily: fonts.sansMed, color: 'rgba(255,255,255,0.8)', fontSize: 10.5, letterSpacing: 0.6 }}>{title}</Text>
            <TextSemi color={colors.white} style={{ fontSize: 15.5, ...tabular }}>{sub}</TextSemi>
          </View>
        </View>
      </Tap>
    </Animated.View>
  );
}

function SectionGroup({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(440).delay(delay)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
      <TextMed color={colors.inkMute} style={{ fontSize: 12, letterSpacing: 0.4, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' }}>{title}</TextMed>
      <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>{children}</View>
    </Animated.View>
  );
}

function Row({ icon, label, onPress, last }: { icon: any; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Tap haptic={false} onPress={onPress} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.roseDeep} />
      </View>
      <TextMed style={{ flex: 1, fontSize: 15 }}>{label}</TextMed>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Tap>
  );
}
