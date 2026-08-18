import React, { useEffect, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Serif, TextBody, TextMed, TextSemi } from '../components/ui';
import { colors, radius, spacing } from '../lib/theme';
import { isBackendConfigured, tokenPresence } from '../lib/apiClient';
import { getUserId } from '../lib/session';
import { getSmsAppHash, hasNativeConvenience } from '../lib/nativeConvenience';
import { clearDiag, diagSeverity, getDiagEvents, subscribeDiag, type DiagEvent } from '../lib/diag';

const SEV_COLOR: Record<'error' | 'warn' | 'info', string> = {
  error: '#C0344D',
  warn: '#B7791F',
  info: '#4A5568',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Diagnostics — read field issues straight off the device: app/build info,
 * whether session tokens are present (never their values), and the last 200
 * API/auth/network events captured by lib/diag. Reachable from Profile.
 */
export default function DiagnosticsScreen() {
  // Developer console — dev builds only. The Profile entry is already __DEV__-
  // gated; this self-guard stops the route rendering if a release build is
  // reached via the pyaas:// / parag:// deep-link scheme (Guideline 2.2).
  if (!__DEV__) return <Redirect href="/(tabs)/profile" />;
  const router = useRouter();
  const [events, setEvents] = useState<DiagEvent[]>(getDiagEvents());
  const [tokens, setTokens] = useState<{ access: boolean; refresh: boolean } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [smsHash, setSmsHash] = useState<string | null>(null);

  useEffect(() => subscribeDiag(() => setEvents([...getDiagEvents()])), []);
  useEffect(() => {
    void tokenPresence().then(setTokens);
    void getUserId().then(setUid);
  }, [events.length]);
  useEffect(() => {
    void getSmsAppHash().then(setSmsHash);
  }, []);

  const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/^https?:\/\//, '') || '(not set, local mode)';

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.xl }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginBottom: spacing.md }}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Serif style={{ fontSize: 28, marginBottom: spacing.md }}>Diagnostics</Serif>

        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing.md,
            gap: 6,
            marginBottom: spacing.lg,
          }}
        >
          <TextMed style={{ fontSize: 13 }}>App v{Constants.expoConfig?.version ?? '?'} · Android</TextMed>
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>API: {apiUrl}</TextBody>
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>
            Backend configured: {isBackendConfigured() ? 'yes' : 'no'} · Signed-in uid: {uid ?? 'none'}
          </TextBody>
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>
            Access token: {tokens ? (tokens.access ? 'present' : 'absent') : '…'} · Refresh token:{' '}
            {tokens ? (tokens.refresh ? 'present' : 'absent') : '…'}
          </TextBody>
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>
            OTP provider: {isBackendConfigured() ? 'backend' : 'offline dev'} · Native login helpers: {hasNativeConvenience() ? 'present' : 'absent'}
          </TextBody>
          {/* THE auto-read key: the OTP SMS template must END with this 11-char
              hash (and start with "<#>") or SMS Retriever silently ignores it.
              The hash is derived from package + SIGNING KEY, so a Play-signed
              build has a DIFFERENT hash than this test build — read it from a
              build signed with the same key the SMS will target. */}
          <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute} selectable>
            SMS Retriever app hash (put at the END of the OTP template): {smsHash ?? 'unavailable in this build'}
          </TextBody>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <TextSemi style={{ fontSize: 16 }}>Recent events ({events.length})</TextSemi>
          {events.length > 0 && (
            <Pressable onPress={clearDiag} hitSlop={8}>
              <TextMed style={{ fontSize: 13 }} color={colors.flame}>Clear</TextMed>
            </Pressable>
          )}
        </View>

        {events.length === 0 ? (
          <TextBody style={{ fontSize: 13 }} color={colors.inkMute}>
            No errors captured this session. Events appear here the moment any API call fails
            (status, network or auth). Check this screen first when something looks wrong.
          </TextBody>
        ) : (
          events.map((e, i) => (
            <View
              key={`${e.ts}-${i}`}
              style={{
                backgroundColor: colors.white,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                borderLeftWidth: 3,
                borderLeftColor: SEV_COLOR[diagSeverity(e)],
                padding: spacing.sm,
                marginBottom: spacing.xs,
                gap: 2,
              }}
            >
              <TextMed style={{ fontSize: 12 }} color={SEV_COLOR[diagSeverity(e)]}>
                {fmtTime(e.ts)} · {e.kind.toUpperCase()}
                {e.status ? ` · ${e.status}` : ''}
              </TextMed>
              {e.path ? (
                <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>
                  {e.method ?? ''} {e.path}
                </TextBody>
              ) : null}
              <TextBody style={{ fontSize: 12.5 }}>{e.message}</TextBody>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
