import React from 'react';
import { View, ScrollView, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, BackButton } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isAdminUser, ADMIN_WEB_URL } from '../lib/admin';

/**
 * Consumer-app Admin entry. Visible only to allow-listed admin accounts; opens
 * the full PYAAS web admin console (pyaasdairy.com/admin) where every profile,
 * batch, quality result and order can be managed.
 */
export default function Admin() {
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const admin = isAdminUser(session?.user?.email, profile?.phone);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Admin</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {!admin ? (
          <View style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.lg, ...shadow.card }}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.roseDeep} />
            <TextSemi style={{ fontSize: 16, marginTop: 8 }}>Not authorised</TextSemi>
            <TextBody style={{ color: colors.inkSoft, marginTop: 4 }}>
              This area is for PYAAS administrators only.
            </TextBody>
          </View>
        ) : (
          <>
            <View style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.lg, ...shadow.card }}>
              <TextSemi style={{ fontSize: 16 }}>PYAAS Admin Console</TextSemi>
              <TextBody style={{ color: colors.inkSoft, marginTop: 4 }}>
                Manage every profile, batch, quality result and order. Add Collection Vans,
                Processing Managers and Delivery Riders with their KYC + vehicle documents.
              </TextBody>
              <Pressable
                onPress={() => Linking.openURL(ADMIN_WEB_URL)}
                style={{ marginTop: spacing.md, backgroundColor: colors.roseDeep, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name="open-outline" size={18} color="#fff" />
                <TextMed style={{ color: '#fff' }}>Open admin dashboard</TextMed>
              </Pressable>
            </View>
            <TextBody style={{ color: colors.inkSoft }}>
              Tip: the Saathi field app also opens directly into the native Admin console for these accounts.
            </TextBody>
          </>
        )}
      </ScrollView>
    </View>
  );
}
