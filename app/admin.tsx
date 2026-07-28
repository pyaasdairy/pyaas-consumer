import React from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isBackendConfigured } from '../lib/apiClient';
import { isAdminUser, ADMIN_WEB_URL } from '../lib/admin';

/**
 * Consumer-app Admin entry. Visible only to allow-listed admin accounts (see
 * lib/admin.ts). This screen stays deliberately minimal and honest: real ops
 * for the cooperative federation (member district unions, batches, quality
 * results, orders) live in the PYAAS web admin console. Here we only offer a
 * link out plus a couple of read-only build diagnostics.
 */
export default function Admin() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const admin = isAdminUser(profile?.email, profile?.phone);
  const backendLive = isBackendConfigured();

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Admin</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {!admin ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, ...shadow.card }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.inkMute} />
            </View>
            <TextSemi style={{ fontSize: 16, marginTop: 10 }}>Not authorised</TextSemi>
            <TextBody color={colors.inkSoft} style={{ marginTop: 4 }}>
              This area is for PYAAS administrators only.
            </TextBody>
          </View>
        ) : (
          <>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, ...shadow.card }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.flameDeep} />
              </View>
              <TextSemi style={{ fontSize: 16, marginTop: 10 }}>PYAAS admin console</TextSemi>
              <TextBody color={colors.inkSoft} style={{ marginTop: 4 }}>
                Full operations for the cooperative federation run in the web admin.
                Manage member district unions, plants, batches, quality results and
                orders there. This app keeps only a quick entry point.
              </TextBody>
              <Tap
                onPress={() => Linking.openURL(ADMIN_WEB_URL)}
                style={{ marginTop: spacing.md, backgroundColor: colors.flameDeep, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, ...shadow.soft }}
              >
                <Ionicons name="open-outline" size={18} color={colors.white} />
                <TextMed color={colors.white}>Open web admin</TextMed>
              </Tap>
            </View>

            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
              <TextSemi style={{ fontSize: 15 }}>Build status</TextSemi>
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                <StatusRow
                  label="Data source"
                  value={backendLive ? 'PYAAS API (live)' : 'On-device (demo)'}
                  ok={backendLive}
                />
                <StatusRow
                  label="Signed in as"
                  value={profile?.phone || profile?.email || 'Unknown'}
                  ok
                />
              </View>
            </View>

            <TextBody color={colors.inkMute} style={{ fontSize: 12 }}>
              Note: this entry is honest by design. Nothing here writes to member
              records; use the web admin for any changes.
            </TextBody>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={ok ? colors.blue : colors.inkMute}
      />
      <TextBody color={colors.inkSoft} style={{ fontSize: 13, flex: 1 }}>{label}</TextBody>
      <TextMed style={{ fontSize: 13 }}>{value}</TextMed>
    </View>
  );
}
