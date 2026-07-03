import React, { useState } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Field, Tap, BackButton } from '../components/ui';
import { submitLead } from '../lib/leads';

const TYPES = [
  { key: 'missing', label: 'Missing delivery', icon: 'bag-remove-outline' },
  { key: 'quality', label: 'Quality issue', icon: 'flask-outline' },
  { key: 'payment', label: 'Payment issue', icon: 'card-outline' },
  { key: 'other', label: 'Something else', icon: 'help-circle-outline' },
];

const SUPPORT_EMAIL = 'mailto:hello@pyaasdairy.com?subject=PYAAS%20support';
const SUPPORT_SITE = 'https://pyaasdairy.com';

export default function Support() {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState('missing');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!detail.trim()) { setErr('Please describe the issue.'); return; }
    setBusy(true); setErr('');
    try {
      // Reuse partner_leads as a lightweight complaint sink (kind prefixed).
      await submitLead({ kind: 'vendor', name: 'Support', phone: '-', message: `[complaint:${kind}] ${detail}`, details: { complaint: kind } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Could not submit. Please email hello@pyaasdairy.com instead.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Help & support</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Tap onPress={() => Linking.openURL(SUPPORT_EMAIL)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.roseDeep, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mail-outline" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi color={colors.white} style={{ fontSize: 15 }}>Email our team</TextSemi>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12 }}>hello@pyaasdairy.com</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Tap>

        <Tap onPress={() => Linking.openURL(SUPPORT_SITE)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="globe-outline" size={20} color={colors.roseDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi style={{ fontSize: 15 }}>Visit pyaasdairy.com</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>Help centre and order tracking</TextBody>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
        </Tap>

        {done ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: 10 }}>
            <Ionicons name="checkmark-circle" size={56} color={colors.sage} />
            <TextSemi style={{ fontSize: 16 }}>Complaint raised</TextSemi>
            <TextBody style={{ textAlign: 'center' }}>We’ll get back to you shortly.</TextBody>
          </View>
        ) : (
          <>
            <TextSemi style={{ fontSize: 16 }}>Raise a complaint</TextSemi>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((t) => (
                <Tap key={t.key} onPress={() => setKind(t.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '47%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: kind === t.key ? colors.ink : colors.white, borderWidth: 1, borderColor: kind === t.key ? colors.ink : colors.line }}>
                  <Ionicons name={t.icon as any} size={18} color={kind === t.key ? colors.white : colors.inkSoft} />
                  <TextMed color={kind === t.key ? colors.white : colors.inkSoft} style={{ fontSize: 13 }}>{t.label}</TextMed>
                </Tap>
              ))}
            </View>
            <Field label="What happened?" value={detail} onChangeText={setDetail} placeholder="Describe the issue…" multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
            {err ? <TextBody color={colors.roseDeep} style={{ fontSize: 13 }}>{err}</TextBody> : null}
            <Button title="Submit complaint" loading={busy} onPress={submit} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
