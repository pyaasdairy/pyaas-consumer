import React, { useCallback, useState } from 'react';
import { View, Linking, Text, Alert } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap } from '../../components/ui';
import { SUPPORT, callCare } from '../../lib/support';
import { FloatingParticles, GlowPulse, ShineSweep, useCountUp } from '../../components/Fx';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { useAuth } from '../../lib/auth';
import { useWallet } from '../../store/wallet';
import { getFullProfile, deleteMyAccount, type FullProfile } from '../../lib/profileApi';
import { listOrders } from '../../lib/api';
import { listSubscriptions } from '../../lib/subscriptions';
import { getVip, vipActive, vipDaysLeft, type VipMembership } from '../../lib/vip';
import { isAdminUser } from '../../lib/admin';

const SUPPORT_EMAIL = 'hello@paragdairy.app';
const SITE = 'https://www.paragdairy.com';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const balance = useWallet((s) => s.balance);
  const refreshWallet = useWallet((s) => s.refresh);
  const [full, setFull] = useState<FullProfile | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [subCount, setSubCount] = useState(0);
  const [vip, setVip] = useState<VipMembership | null>(null);
  const [focused, setFocused] = useState(true);
  const onScroll = useHideTabBarOnScroll();

  const load = useCallback(async () => {
    refreshWallet();
    try {
      setFull(await getFullProfile());
      setOrderCount((await listOrders()).length);
      setSubCount((await listSubscriptions()).filter((s) => s.status === 'active').length);
      setVip(await getVip());
    } catch { /* keep last-known values */ }
  }, [refreshWallet]);
  useFocusEffect(useCallback(() => { setFocused(true); load(); return () => setFocused(false); }, [load]));

  const name = full?.full_name || profile?.full_name || 'PYAAS member';
  const email = full?.email || '';
  const balCount = useCountUp(balance, 1000, focused);
  const plusActive = vipActive(vip);
  const plusDays = vipDaysLeft(vip);
  const isAdmin = isAdminUser(email, full?.phone);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <StatusBar style="dark" />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* ACCOUNT CARD · a bounded, custom account box that floats on the white
            surface (REQ10). All motion stays clipped inside the card (no leak). */}
        <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
          <Animated.View entering={FadeInDown.duration(440)} style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.flameDeep, ...shadow.card }}>
            {focused ? <FloatingParticles count={14} height={280} /> : null}
            <View style={{ padding: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
                  <GlowPulse color={colors.white} radius={37} run={focused} />
                  <Tap haptic={false} onPress={() => router.push('/profile-edit')}>
                    {full?.avatar_url ? (
                      <Image source={{ uri: full.avatar_url }} style={{ width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
                        <Serif color={colors.flameDeep} style={{ fontSize: 30 }}>{name.charAt(0).toUpperCase()}</Serif>
                      </View>
                    )}
                  </Tap>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Serif color={colors.white} style={{ fontSize: 21 }} numberOfLines={1}>{name}</Serif>
                  {full?.phone ? <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>{full.phone}</TextBody> : null}
                  {email ? <TextBody color="rgba(255,255,255,0.8)" style={{ fontSize: 12.5 }} numberOfLines={1}>{email}</TextBody> : null}
                </View>
                <Tap onPress={() => router.push('/profile-edit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.28)', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
                  <Ionicons name="create-outline" size={14} color={colors.white} />
                  <TextMed color={colors.white} style={{ fontSize: 12.5 }}>Edit</TextMed>
                </Tap>
              </View>

              {/* Live stat chips */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <StatChip label="WALLET" value={rupee(balCount)} />
                <StatChip label="ORDERS" value={String(orderCount)} />
                <StatChip label="SUBSCRIPTIONS" value={String(subCount)} />
              </View>
            </View>
            {focused ? <ShineSweep dur={3600} travel={420} bandWidth={110} delay={600} /> : null}
          </Animated.View>
        </View>

        {/* QUICK CARDS · Wallet + Orders (solid, animated) */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <QuickCard index={0} title="PARAG WALLET" sub={rupee(balance)} icon="wallet" bg={colors.flameDeep} accent={colors.white} onPress={() => router.push('/(tabs)/wallet')} />
          <QuickCard index={1} title="MY ORDERS" sub={orderCount ? `${orderCount} placed` : 'None yet'} icon="receipt" bg={colors.blue} accent={colors.white} onPress={() => router.push('/(tabs)/orders')} />
        </View>

        <SectionGroup delay={240} title="Products & subscriptions">
          <Row icon="storefront-outline" label="Products" onPress={() => router.push('/(tabs)')} />
          <Row icon="infinite-outline" label="My subscriptions" onPress={() => router.push('/subscriptions')} />
          <Row icon="airplane-outline" label="Set vacations" onPress={() => router.push('/vacations')} last />
        </SectionGroup>

        <SectionGroup delay={280} title="Orders & billing">
          <Row icon="receipt-outline" label="My orders" onPress={() => router.push('/(tabs)/orders')} />
          <Row icon="swap-horizontal-outline" label="Transactions" onPress={() => router.push('/transactions')} last />
        </SectionGroup>

        <SectionGroup delay={300} title="PARAG Plus & rewards">
          <Row icon="diamond-outline" label={plusActive ? `PARAG Plus · ${plusDays} days left` : 'Join PARAG Plus'} onPress={() => router.push('/(tabs)/vip')} />
          <Row icon="gift-outline" label="Refer & earn" onPress={() => router.push('/refer')} />
          <Row icon="pricetags-outline" label="Coupons & offers" onPress={() => router.push('/coupons')} last />
        </SectionGroup>

        <SectionGroup delay={330} title="Know your milk">
          <Row icon="scan-outline" label="Scan a pack" onPress={() => router.push('/(tabs)/traceability')} />
          <Row icon="qr-code-outline" label="Know your milk" onPress={() => router.push('/know-your-milk')} />
          <Row icon="flask-outline" label="Quality dashboard" onPress={() => router.push('/quality')} />
          <Row icon="business-outline" label="Member dairies" onPress={() => router.push('/farms')} last />
        </SectionGroup>

        <SectionGroup delay={360} title="Account & preferences">
          <Row icon="person-outline" label="My profile" onPress={() => router.push('/profile-edit')} />
          <Row icon="location-outline" label="Saved addresses" onPress={() => router.push('/addresses')} />
          <Row icon="options-outline" label="Delivery preferences" onPress={() => router.push('/delivery-preferences')} />
          <Row icon="flash-outline" label="Smart Recharge autopay" onPress={() => router.push('/autopay')} last />
        </SectionGroup>

        <SectionGroup delay={390} title="About PARAG">
          <Row icon="information-circle-outline" label="About us" onPress={() => router.push('/about-us')} />
          <Row icon="ribbon-outline" label="FSSAI & seller details" onPress={() => router.push('/fssai-details')} />
          <Row icon="briefcase-outline" label="Business, franchise & vendor" onPress={() => router.push('/business')} />
          <Row icon="people-outline" label="Cooperative & community" onPress={() => router.push('/community')} />
          <Row icon="leaf-outline" label="Sustainability" onPress={() => router.push('/sustainability')} last />
        </SectionGroup>

        {isAdmin ? (
          <SectionGroup delay={410} title="Admin">
            <Row icon="shield-checkmark-outline" label="Admin console" onPress={() => router.push('/admin')} last />
          </SectionGroup>
        ) : null}

        <SectionGroup delay={420} title="Help & support">
          <Row icon="chatbubble-ellipses-outline" label="Chat with us" onPress={() => router.push('/support-chat')} />
          <Row icon="pulse-outline" label="Diagnostics" onPress={() => router.push('/diagnostics')} />
          <Row icon="call-outline" label={`Call customer care · ${SUPPORT.careNumber}`} onPress={callCare} />
          <Row icon="chatbubbles-outline" label="Help & support" onPress={() => router.push('/support')} />
          <Row icon="help-circle-outline" label="FAQ" onPress={() => router.push('/faq')} />
          <Row icon="globe-outline" label="Visit paragdairy.com" onPress={() => Linking.openURL(SITE)} last />
        </SectionGroup>

        <SectionGroup delay={450} title="Policies">
          <Row icon="lock-closed-outline" label="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
          <Row icon="document-text-outline" label="Terms & Conditions" onPress={() => router.push('/terms')} />
          <Row icon="cash-outline" label="Refund Policy" onPress={() => router.push('/refund-policy')} />
          <Row icon="close-circle-outline" label="Cancellation Policy" onPress={() => router.push('/cancellation-policy')} />
          <Row icon="cube-outline" label="Shipping & Delivery Policy" onPress={() => router.push('/shipping-policy')} last />
        </SectionGroup>

        <Animated.View entering={FadeInDown.duration(440).delay(520)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 12, alignItems: 'center' }}>
          <Button title="Sign out" variant="outline" onPress={signOut} style={{ alignSelf: 'stretch' }} />
          <Tap
            haptic={false}
            onPress={() => Alert.alert(
              'Delete account?',
              'Any remaining wallet balance is returned to you and active subscriptions (and any AutoPay mandate) are cancelled. Your personal details are permanently erased; only records the law requires us to keep (tax/financial) are retained. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  try { await deleteMyAccount(); }
                  catch { Alert.alert('Could not delete', `Please try again, or email ${SUPPORT_EMAIL}.`); }
                } },
              ],
            )}
            style={{ paddingVertical: 6 }}
          >
            <TextMed color="#C0344D" style={{ fontSize: 14 }}>Delete account</TextMed>
          </Tap>
          <Image source={require('../../assets/parag-logo.png')} style={{ width: 96, height: 96, opacity: 0.85 }} contentFit="contain" />
          <TextBody style={{ fontSize: 11.5 }}>Pure, natural, good health. · v{Constants.expoConfig?.version ?? '1.0.0'}</TextBody>
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
        <Ionicons name={icon} size={17} color={colors.flameDeep} />
      </View>
      <TextMed style={{ flex: 1, fontSize: 15 }}>{label}</TextMed>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Tap>
  );
}
