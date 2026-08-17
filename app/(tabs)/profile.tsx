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
import { CARE_EMAIL, SITE_URL, SUPPORT, callCare, HAS_CARE_PHONE } from '../../lib/support';
import { FloatingParticles, GlowPulse, ShineSweep, useCountUp } from '../../components/Fx';
import { useHideTabBarOnScroll } from '../../lib/navVisibility';
import { useAuth } from '../../lib/auth';
import { useWallet } from '../../store/wallet';
import { getFullProfile, deleteMyAccount, type FullProfile } from '../../lib/profileApi';
import { listOrders } from '../../lib/api';
import { listSubscriptions } from '../../lib/subscriptions';
import { getVip, vipActive, vipDaysLeft, type VipMembership } from '../../lib/vip';
import { isAdminUser } from '../../lib/admin';
import { useTabBarClearance } from '../../components/PyaasTabBar';

const SUPPORT_EMAIL = CARE_EMAIL;
const SITE = SITE_URL;

/**
 * MENU / PROFILE — laid out to the reference menu structure: the account card,
 * then section headings each above a centered 3-column grid of icon tiles,
 * the membership card, and finally full-width list rows (icon, title, subtitle,
 * chevron) with the version string centered at the very bottom.
 */
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
  // The tab bar's real reach is insets.bottom + 90; a flat 130 clipped content
  // on home-indicator iPhones and over-padded on others.
  const tabClearance = useTabBarClearance();

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
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: tabClearance }} showsVerticalScrollIndicator={false}>
        {/* ACCOUNT CARD · a bounded, custom account box that floats on the white
            surface. All motion stays clipped inside the card (no leak). */}
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
                  <Serif color={colors.white} style={{ fontSize: 21 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{name}</Serif>
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

        {/* Icon-tile sections · 3-column centered grids under each heading */}
        <GridSection
          delay={180}
          title="Products and Subscriptions"
          tiles={[
            { icon: 'storefront-outline', label: 'Products', onPress: () => router.push('/(tabs)') },
            { icon: 'infinite-outline', label: 'My Subscriptions', onPress: () => router.push('/subscriptions') },
            { icon: 'airplane-outline', label: 'Set Vacations', onPress: () => router.push('/vacations') },
          ]}
        />
        <GridSection
          delay={220}
          title="Orders and Billing"
          tiles={[
            { icon: 'receipt-outline', label: 'My Orders', onPress: () => router.push('/(tabs)/orders') },
            { icon: 'swap-horizontal-outline', label: 'Transactions', onPress: () => router.push('/transactions') },
            { icon: 'wallet-outline', label: 'Wallet', onPress: () => router.push('/(tabs)/wallet') },
          ]}
        />
        <GridSection
          delay={260}
          title="Rewards"
          tiles={[
            { icon: 'gift-outline', label: 'Refer', onPress: () => router.push('/refer') },
            { icon: 'pricetags-outline', label: 'Offer Zone', onPress: () => router.push('/coupons') },
          ]}
        />

        {/* Membership card · PYAAS Plus */}
        <Animated.View entering={FadeInDown.duration(440).delay(300)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <Tap onPress={() => router.push('/(tabs)/vip')} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.flameSoft, padding: spacing.md, ...shadow.soft }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="diamond" size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TextSemi style={{ fontSize: 15 }}>PYAAS Plus</TextSemi>
              <TextBody style={{ fontSize: 12.5 }} numberOfLines={1}>
                {plusActive ? `Active · ${plusDays} days left` : 'Join the club, save on every order'}
              </TextBody>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
          </Tap>
        </Animated.View>

        {/* Full-width list rows · icon, title, subtitle, chevron */}
        <ListCard delay={340}>
          <Row icon="person-outline" label="Account & Preferences" sub="Profile, addresses, delivery preferences" onPress={() => router.push('/profile-edit')} />
          <Row icon="location-outline" label="Saved Addresses" sub="Where your mornings arrive" onPress={() => router.push('/addresses')} />
          <Row icon="options-outline" label="Delivery Preferences" sub="Slot and drop instructions" onPress={() => router.push('/delivery-preferences')} last={!__DEV__} />
          {/* AutoPay is __DEV__-only until the real UPI-AutoPay recurring checkout
              is wired — it can't complete against a real backend yet, so it must
              not appear in a Play build. */}
          {__DEV__ ? (
            <Row icon="flash-outline" label="Smart Recharge Autopay" sub="Auto top-up when the wallet runs low" onPress={() => router.push('/autopay')} last />
          ) : null}
        </ListCard>

        <ListCard delay={380}>
          <Row icon="scan-outline" label="Know Your Milk" sub="Scan a pack to see where it was made" onPress={() => router.push('/know-your-milk')} />
          <Row icon="flask-outline" label="Test Reports" sub="View the latest quality check reports" onPress={() => router.push('/quality')} />
          <Row icon="business-outline" label="Where your milk is made" sub="The dairies we source from" onPress={() => router.push('/farms')} last />
        </ListCard>

        <ListCard delay={420}>
          <Row icon="chatbubble-ellipses-outline" label="Chat With Us" sub="Report an issue with an order" onPress={() => router.push('/support-chat')} />
          {HAS_CARE_PHONE ? (
            <Row icon="call-outline" label="Customer Care" sub={SUPPORT.careNumber} onPress={callCare} />
          ) : null}
          <Row icon="help-circle-outline" label="Help & FAQ" sub="Answers to common questions" onPress={() => router.push('/faq')} last={!__DEV__} />
          {/* Diagnostics prints the API host, the signed-in uid, token presence
              and the OTP provider. That is a developer console, and one tap from
              a customer's profile it tells an App Review tester in plain language
              that they are holding a pre-production build (Guideline 2.2). */}
          {__DEV__ ? (
            <Row icon="pulse-outline" label="Diagnostics" sub="Connection and app health" onPress={() => router.push('/diagnostics')} last />
          ) : null}
        </ListCard>

        <ListCard delay={460}>
          <Row icon="information-circle-outline" label="About Us" sub="Who we are and what we stand for" onPress={() => router.push('/about-us')} />
          <Row icon="ribbon-outline" label="FSSAI & Seller Details" sub="Licences and seller information" onPress={() => router.push('/fssai-details')} />
          <Row icon="briefcase-outline" label="Business & Franchise" sub="Partner or vend with PYAAS" onPress={() => router.push('/business')} />
          <Row icon="people-outline" label="Cooperative & Community" sub="Farmers first, always" onPress={() => router.push('/community')} />
          <Row icon="leaf-outline" label="Sustainability" sub="How we are trying to do better" onPress={() => router.push('/sustainability')} last />
        </ListCard>

        <ListCard delay={500}>
          <Row icon="document-text-outline" label="Legal" sub="Privacy, terms and policies" onPress={() => router.push('/legal')} />
          <Row icon="lock-closed-outline" label="Privacy Policy" sub="How we handle your data" onPress={() => router.push('/privacy-policy')} />
          <Row icon="reader-outline" label="Terms & Conditions" sub="The fine print, in plain words" onPress={() => router.push('/terms')} />
          <Row icon="cash-outline" label="Refund Policy" sub="When and how refunds work" onPress={() => router.push('/refund-policy')} />
          <Row icon="close-circle-outline" label="Cancellation Policy" sub="Changing or cancelling an order" onPress={() => router.push('/cancellation-policy')} />
          <Row icon="cube-outline" label="Shipping & Delivery Policy" sub="How deliveries reach you" onPress={() => router.push('/shipping-policy')} last />
        </ListCard>

        {isAdmin ? (
          <ListCard delay={520}>
            <Row icon="shield-checkmark-outline" label="Admin Console" sub="Store operations" onPress={() => router.push('/admin')} last />
          </ListCard>
        ) : null}

        <Animated.View entering={FadeInDown.duration(440).delay(540)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 12, alignItems: 'center' }}>
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
          <Tap haptic={false} onPress={() => Linking.openURL(SITE)} style={{ paddingVertical: 2 }}>
            <TextBody style={{ fontSize: 12.5 }} color={colors.flameDeep}>pyaasdairy.com</TextBody>
          </Tap>
          <Image source={require('../../assets/parag-logo.png')} style={{ width: 84, height: 84, opacity: 0.85 }} contentFit="contain" />
          <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>Version : {Constants.expoConfig?.version ?? '1.0.0'}</TextBody>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  // The label ("SUBSCRIPTIONS") shrinks to fit its tile on ONE line instead of
  // wrapping and clipping — every chip keeps the same height and baseline.
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Text style={{ fontFamily: fonts.serifBlack, color: colors.white, fontSize: 18, ...tabular }} numberOfLines={1}>{value}</Text>
      <Text
        style={{ fontFamily: fonts.sansMed, color: 'rgba(255,255,255,0.8)', fontSize: 10, letterSpacing: 0.4, textAlign: 'center' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {label}
      </Text>
    </View>
  );
}

type GridTileDef = { icon: any; label: string; onPress: () => void };

/** A section heading above a centered 3-column grid of icon+label tiles. */
function GridSection({ title, tiles, delay }: { title: string; tiles: GridTileDef[]; delay: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(440).delay(delay)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
      <TextSemi style={{ fontSize: 14.5, marginBottom: 10 }}>{title}</TextSemi>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {tiles.map((t) => (
          <Tap key={t.label} haptic={false} onPress={t.onPress} scaleTo={0.96} style={{ flex: 1, alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: spacing.md, paddingHorizontal: 6, ...shadow.soft }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={t.icon} size={20} color={colors.flameDeep} />
            </View>
            <TextMed style={{ fontSize: 12, textAlign: 'center' }} numberOfLines={2}>{t.label}</TextMed>
          </Tap>
        ))}
        {/* Pad short rows so 2 tiles keep the 3-column rhythm */}
        {tiles.length < 3 ? Array.from({ length: 3 - tiles.length }, (_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />) : null}
      </View>
    </Animated.View>
  );
}

/** A white card of stacked full-width rows. */
function ListCard({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(440).delay(delay)} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
      <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>{children}</View>
    </Animated.View>
  );
}

function Row({ icon, label, sub, onPress, last }: { icon: any; label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Tap haptic={false} onPress={onPress} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.flameDeep} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TextMed style={{ fontSize: 15 }} numberOfLines={1}>{label}</TextMed>
        {sub ? <TextBody style={{ fontSize: 12 }} numberOfLines={1}>{sub}</TextBody> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Tap>
  );
}
