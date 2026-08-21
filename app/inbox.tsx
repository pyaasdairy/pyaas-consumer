import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { useDiscLang } from '../lib/i18n';
import { getCrmInbox, markCrmRead, refreshCrmUnread, crmCtaRoute, type CrmInboxItem } from '../lib/crm';

/**
 * Messages — the in-app inbox the backend's CRM engine delivers into (Welcome
 * Litre journey today; every future campaign rides the same rail). Opening the
 * screen marks what it shows as read (the backend keeps the rows; read_at is
 * per-message), and refreshes the header bell's unread count on the way out.
 *
 * Messages arrive bilingual (body_en + body_hi); the consent-language toggle
 * (lib/i18n) picks which leads, and the other is always one tap away — a
 * campaign message a member can't read isn't a message.
 */
export default function Inbox() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = useDiscLang();
  const [rows, setRows] = useState<CrmInboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const list = await getCrmInbox();
        if (!alive) return;
        setRows(list);
        setLoading(false);
        // Mark the unread ones read (best-effort, backend keeps the truth),
        // then re-count so the home bell clears without a reopen.
        const unread = list.filter((r) => !r.read_at);
        if (unread.length) {
          await Promise.all(unread.map((r) => markCrmRead(r.id)));
        }
        await refreshCrmUnread();
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Messages</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: 10, marginTop: 8, ...shadow.soft }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mail-open-outline" size={20} color={colors.flameDeep} />
            </View>
            <TextSemi style={{ fontSize: 15 }} color={colors.ink}>No messages yet</TextSemi>
            <TextBody style={{ fontSize: 13, textAlign: 'center' }}>
              Updates about your deliveries and offers land here.
            </TextBody>
          </View>
        ) : (
          rows.map((m) => {
            const primary = lang === 'hi' ? m.body_hi || m.body_en : m.body_en || m.body_hi;
            const cta = crmCtaRoute(m.cta);
            const fresh = !m.read_at;
            return (
              <View key={m.id} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: fresh ? colors.flame : colors.line, padding: spacing.md, gap: 8, ...shadow.soft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.flameDeep }} /> : null}
                  <TextMed color={colors.inkMute} style={{ fontSize: 11.5, flex: 1 }}>
                    {formatWhen(m.created_at)}
                  </TextMed>
                </View>
                <TextBody style={{ fontSize: 14, lineHeight: 21 }} color={colors.ink}>
                  {primary}
                </TextBody>
                {cta ? (
                  <Tap
                    onPress={() => router.push(cta.href as never)}
                    style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.flameDeep, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <TextSemi color={colors.white} style={{ fontSize: 12.5 }}>{cta.label}</TextSemi>
                    <Ionicons name="arrow-forward" size={13} color={colors.white} />
                  </Tap>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

/** "Today, 7:05 am" / "21 Aug" — light, no library. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
