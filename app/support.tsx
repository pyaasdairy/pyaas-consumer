import React, { useState } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Field, Tap, BackButton } from '../components/ui';
import { CARE_EMAIL, HAS_CARE_PHONE, SITE_URL, SUPPORT, callCare, emailCare } from '../lib/support';

const TYPES = [
  { key: 'missing', label: 'Missing delivery', icon: 'bag-remove-outline' },
  { key: 'quality', label: 'Quality issue', icon: 'flask-outline' },
  { key: 'payment', label: 'Payment issue', icon: 'card-outline' },
  { key: 'other', label: 'Something else', icon: 'help-circle-outline' },
];

const SUPPORT_ADDRESS = CARE_EMAIL;
const SUPPORT_EMAIL = `mailto:${CARE_EMAIL}?subject=PYAAS%20support`;
const SUPPORT_SITE = SITE_URL;

export default function Support() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [kind, setKind] = useState('missing');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!detail.trim()) { setErr('Please describe the issue.'); return; }
    setBusy(true); setErr('');
    try {
      // There is no support backend yet, so this screen cannot "raise" anything.
      // It used to acknowledge locally and tell the customer we'd get back to
      // them — a promise nobody on our side could ever see. Until the parag-api
      // support endpoint exists, hand the complaint to the channel a human
      // actually reads and say plainly that sending it is still the user's tap.
      const label = TYPES.find((t) => t.key === kind)?.label ?? 'Support';
      const opened = await emailCare(
        `PYAAS complaint: ${label}`,
        `Issue: ${label}\n\n${detail.trim()}\n\nSent from the PYAAS app`,
      );
      if (!opened) {
        setErr(`Could not open your email app. Please write to ${SUPPORT_ADDRESS}${HAS_CARE_PHONE ? ` or call ${SUPPORT.careNumber}` : ''}.`);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? `Could not submit. Please email ${SUPPORT_ADDRESS} instead.`); }
    finally { setBusy(false); }
  }

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

        {done ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: 10 }}>
            <Ionicons name="mail-open-outline" size={56} color={colors.blue} />
            <TextSemi style={{ fontSize: 16 }}>Complaint ready to send</TextSemi>
            <TextBody style={{ textAlign: 'center' }}>
              We’ve opened your email app with the details filled in. Send that mail and our team replies to you there{HAS_CARE_PHONE ? ', or use the Call customer care button above if it’s urgent' : ''}.</TextBody>
          </View>
        ) : (
          <>
            <TextSemi style={{ fontSize: 16 }}>Raise a complaint</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>
              We don’t have an in-app complaints desk yet, so this opens your email app with the details filled in.
            </TextBody>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((t) => (
                <Tap key={t.key} onPress={() => setKind(t.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '47%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: kind === t.key ? colors.action : colors.white, borderWidth: 1, borderColor: kind === t.key ? colors.action : colors.line }}>
                  <Ionicons name={t.icon as any} size={18} color={kind === t.key ? colors.white : colors.inkSoft} />
                  <TextMed color={kind === t.key ? colors.white : colors.inkSoft} style={{ fontSize: 13 }}>{t.label}</TextMed>
                </Tap>
              ))}
            </View>
            <Field label="What happened?" value={detail} onChangeText={setDetail} placeholder="Describe the issue…" multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
            {err ? <TextBody color={colors.flameDeep} style={{ fontSize: 13 }}>{err}</TextBody> : null}
            <Button title="Email this complaint" loading={busy} onPress={submit} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
