import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../lib/theme';
import { Serif, TextBody, TextMed, Button, Field, Tap, BackButton } from '../components/ui';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { submitLead } from '../lib/leads';
import { isBackendConfigured } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { CARE_EMAIL, HAS_CARE_PHONE, SUPPORT, callCare, emailCare } from '../lib/support';

/**
 * EARN WITH PYAAS — the PYAAS Digital Agent Network (P-DAN).
 *
 * This screen used to be "Partner with us" with three tabs: Bulk order,
 * Franchise and Distributor (founder call, 21 Sep):
 *   - Franchise and Distributor do not apply to PYAAS's business: removed.
 *   - Bulk order sat inside a partnership form, which made a simple order feel
 *     like a business application. It is its own screen now (app/bulk-order).
 *   - What remains is the agent network. One Voice §1.9: the public name is
 *     "Earn with PYAAS"; P-DAN may be used on this page after it is introduced
 *     once, which the intro line does.
 */
export default function EarnWithPyaas() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  // With no API configured, submitLead() only writes a row on THIS handset —
  // nobody at PYAAS can see it, so the screen must not promise a call back.
  const backendLive = isBackendConfigured();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState((profile?.phone ?? '').replace(/^\+91/, ''));
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  function enquiryBody() {
    return [
      'Enquiry: Earn with PYAAS (P-DAN)',
      `Name: ${name.trim()}`,
      `Phone: ${phone.trim()}`,
      city.trim() ? `Locality: ${city.trim()}` : '',
      message.trim() ? `Details: ${message.trim()}` : '',
      '',
      'Sent from the PYAAS app',
    ].filter(Boolean).join('\n');
  }

  async function submit() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone are required.'); return; }
    setBusy(true); setErr('');
    try {
      await submitLead({ kind: 'agent', name, phone, businessName: '', city, message });
      if (!backendLive) {
        const opened = await emailCare(`Earn with PYAAS enquiry. ${name.trim()}`, enquiryBody());
        if (!opened) {
          setErr(`Could not open your email app. Please write to ${CARE_EMAIL}${HAS_CARE_PHONE ? ` or call ${SUPPORT.careNumber}` : ''} with these details.`);
          return;
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Could not submit. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton />
          <Serif style={{ fontSize: 24 }}>Thank you</Serif>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
          <Ionicons name={backendLive ? 'checkmark-circle' : 'mail-open-outline'} size={64} color={colors.blue} />
          <Serif style={{ fontSize: 22, textAlign: 'center' }}>{backendLive ? 'We have your details.' : 'One last tap.'}</Serif>
          {backendLive ? (
            <TextBody style={{ textAlign: 'center' }}>Our team will call you on {phone} about the P-DAN.</TextBody>
          ) : (
            <>
              <TextBody style={{ textAlign: 'center' }}>
                We’ve opened your email app with this enquiry. Send it to {CARE_EMAIL} and our team replies there. The app can’t deliver enquiries on its own yet, so nothing reaches us until you hit send.
              </TextBody>
              {HAS_CARE_PHONE ? (
                <Tap onPress={callCare} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }}>
                  <Ionicons name="call-outline" size={18} color={colors.flameDeep} />
                  <TextMed color={colors.flameDeep} style={{ fontSize: 14 }}>Or call {SUPPORT.careNumber}</TextMed>
                </Tap>
              ) : null}
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }} numberOfLines={1}>Earn with PYAAS</Serif>
      </View>

      <KeyboardSafe>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream, borderRadius: radius.md, padding: 12 }}>
            <Ionicons name="people-outline" size={18} color={colors.flameDeep} />
            <TextBody style={{ flex: 1, fontSize: 12.5 }}>
              Join the PYAAS Digital Agent Network (P-DAN). Leave your details and our team will call you about how the P-DAN works.
            </TextBody>
          </View>

          <Field label="Your name *" value={name} onChangeText={setName} placeholder="Full name" />
          <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" />
          <Field label="Your locality" value={city} onChangeText={setCity} placeholder="e.g. Sushant Golf City" />
          <Field label="Tell us more" value={message} onChangeText={setMessage} placeholder="A few details" multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />

          {!backendLive ? (
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>
              We can’t receive enquiries inside the app yet, so this opens your email app with the details filled in.
            </TextBody>
          ) : null}
          {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}
          <Button title={backendLive ? 'Submit' : 'Email this enquiry'} loading={busy} onPress={submit} />
        </ScrollView>
      </KeyboardSafe>
    </View>
  );
}
