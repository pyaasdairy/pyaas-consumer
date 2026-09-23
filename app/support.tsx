import React, { useCallback } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap, BackButton } from '../components/ui';
import { CARE_EMAIL, HAS_CARE_PHONE, SITE_URL, SUPPORT, callCare } from '../lib/support';
import { useComplaints } from '../lib/complaints';

const SUPPORT_ADDRESS = CARE_EMAIL;
const SUPPORT_EMAIL = `mailto:${CARE_EMAIL}?subject=PYAAS%20support`;
const SUPPORT_SITE = SITE_URL;

export default function Support() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // How many complaints are still open — shown on the register card so the
  // member can see at a glance that we have something of theirs in hand.
  const complaints = useComplaints((st) => st.rows);
  const refreshComplaints = useComplaints((st) => st.refresh);
  useFocusEffect(useCallback(() => { void refreshComplaints(); }, [refreshComplaints]));
  const openCount = complaints.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Help & support</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* No care line configured yet → no row. A dead "Call us" is worse than none. */}
        {HAS_CARE_PHONE ? (
          <Tap onPress={callCare} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameDeep, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="call-outline" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <TextSemi color={colors.white} style={{ fontSize: 15 }}>Call customer care</TextSemi>
              <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12 }}>{SUPPORT.careNumber} · {SUPPORT.careNote}</TextBody>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </Tap>
        ) : null}

        <Tap onPress={() => router.push('/support-chat')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.flameDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>Chat with us</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>Quick answers, then send it to our team</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        <Tap onPress={() => Linking.openURL(SUPPORT_EMAIL)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.action, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mail-outline" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi color={colors.white} style={{ fontSize: 15 }}>Email our team</TextSemi>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12 }}>{SUPPORT_ADDRESS}</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Tap>

        {/* FAQs live here with the rest of support (founder call, 21 Sep). */}
        <Tap onPress={() => router.push('/faq')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="help-circle-outline" size={20} color={colors.flameDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>FAQs</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>Answers to common questions</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        <Tap onPress={() => Linking.openURL(SUPPORT_SITE)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="globe-outline" size={20} color={colors.flameDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>Visit pyaasdairy.com</TextSemi>
            {/* Was "Help centre and order tracking" — neither exists on the site today. */}
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>Our website</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        {/* THE COMPLAINT REGISTER (new, 18 Sep): complaints now live on a real
            register with a reference and a status, instead of being handed to
            the member's email app and forgotten. This card is the entry point;
            app/complaints.tsx owns filing and following them. */}
        <Tap onPress={() => router.push('/complaints')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="document-text-outline" size={20} color={colors.flameDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>Register a complaint</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>
              {openCount > 0 ? `${openCount} open · track it here` : 'Get a reference number and follow it'}
            </TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.flameDeep} />
        </Tap>

        <Tap onPress={() => router.push('/notifications')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="notifications-outline" size={20} color={colors.flameDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>Notifications</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>Everything we have told you, in one place</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        <TextBody style={{ fontSize: 11.5, textAlign: 'center', marginTop: spacing.sm }} color={colors.inkMute}>
          Consumer helpline {SUPPORT.helpline} · {CARE_EMAIL}
        </TextBody>
      </ScrollView>
    </View>
  );
}
