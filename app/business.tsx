import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../lib/theme';
import { Serif, TextBody, TextMed, Button, Field, Tap, BackButton } from '../components/ui';
import { submitLead, type LeadKind } from '../lib/leads';

const KINDS: { key: LeadKind; label: string; icon: any; blurb: string }[] = [
  { key: 'bulk_order', label: 'Bulk order', icon: 'cube-outline', blurb: 'Daily milk, curd and paneer for offices, cafes, sweet shops and events.' },
  { key: 'franchise', label: 'Franchise', icon: 'storefront-outline', blurb: 'Run a PARAG parlour or franchise outlet in your neighbourhood.' },
  { key: 'vendor', label: 'Distributor', icon: 'people-outline', blurb: 'Distribute PARAG products across your area, or join a member dairy union.' },
];

export default function Business() {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<LeadKind>('bulk_order');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone are required.'); return; }
    setBusy(true); setErr('');
    try {
      await submitLead({ kind, name, phone, businessName: business, city, message });
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
          <Ionicons name="checkmark-circle" size={64} color={colors.blue} />
          <Serif style={{ fontSize: 22, textAlign: 'center' }}>We have your details.</Serif>
          <TextBody style={{ textAlign: 'center' }}>Our cooperative team will reach out on {phone} shortly.</TextBody>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Partner with us</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {KINDS.map((k) => (
            <Tap key={k.key} onPress={() => setKind(k.key)} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md, backgroundColor: kind === k.key ? colors.action : colors.white, borderWidth: 1, borderColor: kind === k.key ? colors.action : colors.line }}>
              <Ionicons name={k.icon} size={20} color={kind === k.key ? colors.white : colors.inkSoft} />
              <TextMed color={kind === k.key ? colors.white : colors.inkSoft} style={{ fontSize: 12.5 }}>{k.label}</TextMed>
            </Tap>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="information-circle" size={18} color={colors.flameDeep} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }}>{KINDS.find((k) => k.key === kind)?.blurb}</TextBody>
        </View>

        <Field label="Your name *" value={name} onChangeText={setName} placeholder="Full name" />
        <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" />
        <Field label={kind === 'vendor' ? 'Company / dairy union' : 'Business name'} value={business} onChangeText={setBusiness} placeholder="Optional" />
        <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. Lucknow" />
        <Field label="Tell us more" value={message} onChangeText={setMessage} placeholder={kind === 'bulk_order' ? 'Litres per day, products needed' : 'A few details'} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />

        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}
        <Button title="Submit enquiry" loading={busy} onPress={submit} />
      </ScrollView>
    </View>
  );
}
