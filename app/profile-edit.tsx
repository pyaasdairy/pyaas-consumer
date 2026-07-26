import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, Button, Field, Tap, BackButton } from '../components/ui';
import { getFullProfile, updateProfile, pickAndUploadAvatar, type FullProfile } from '../lib/profileApi';

const MILK_PREFS = [
  { key: 'a2', label: 'A2 only' },
  { key: 'toned', label: 'Toned' },
  { key: 'either', label: 'Either' },
];
const SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'evening', label: 'Evening' },
];

export default function ProfileEdit() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [p, setP] = useState<FullProfile | null>(null);
  const [form, setForm] = useState<Partial<FullProfile>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  useFocusEffect(useCallback(() => {
    getFullProfile().then((d) => { setP(d); setForm(d ?? {}); });
  }, []));

  function set<K extends keyof FullProfile>(k: K, v: FullProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function changeAvatar() {
    if (uploading) return;
    setMsg('');
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar();
      if (url) {
        set('avatar_url', url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMsg('Profile picture updated.');
      }
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not update your photo.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      await updateProfile({
        full_name: form.full_name ?? null,
        phone: form.phone ?? null,
        email: form.email ?? null,
        alternate_phone: form.alternate_phone ?? null,
        family_member_count: form.family_member_count ? Number(form.family_member_count) : null,
        milk_preference: form.milk_preference ?? null,
        delivery_slot: form.delivery_slot ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMsg('Profile saved.');
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not save.');
    } finally { setSaving(false); }
  }

  if (!p && !form) return <ActivityIndicator color={colors.flameDeep} style={{ flex: 1 }} />;
  const name = form.full_name || 'PYAAS member';

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>My profile</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Tap haptic={false} onPress={changeAvatar}>
            {form.avatar_url ? (
              <Image source={{ uri: form.avatar_url }} style={{ width: 88, height: 88, borderRadius: 44 }} contentFit="cover" />
            ) : (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <Serif color={colors.white} style={{ fontSize: 34 }}>{name.charAt(0).toUpperCase()}</Serif>
              </View>
            )}
            {uploading ? (
              <View style={{ position: 'absolute', left: 0, top: 0, width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : null}
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.milk }}>
              <Ionicons name={uploading ? 'hourglass' : 'camera'} size={15} color={colors.white} />
            </View>
          </Tap>
          <TextBody style={{ fontSize: 12 }}>{uploading ? 'Uploading…' : 'Tap to add a photo'}</TextBody>
        </View>

        <Field label="Full name" value={form.full_name ?? ''} onChangeText={(v) => set('full_name', v)} placeholder="Your name" />
        <Field label="Mobile number" value={form.phone ?? ''} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="10-digit mobile" />
        <Field label="Email" value={form.email ?? ''} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
        <Field label="Alternate number" value={form.alternate_phone ?? ''} onChangeText={(v) => set('alternate_phone', v)} keyboardType="phone-pad" placeholder="Optional" />
        <Field label="Family members" value={form.family_member_count ? String(form.family_member_count) : ''} onChangeText={(v) => set('family_member_count', Number(v) as any)} keyboardType="number-pad" placeholder="e.g. 4" />

        <View style={{ gap: 6 }}>
          <TextMed color={colors.inkSoft} style={{ fontSize: 13.5 }}>Milk preference</TextMed>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {MILK_PREFS.map((m) => (
              <Chip key={m.key} active={form.milk_preference === m.key} label={m.label} onPress={() => set('milk_preference', m.key)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <TextMed color={colors.inkSoft} style={{ fontSize: 13.5 }}>Delivery time slot</TextMed>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SLOTS.map((s) => (
              <Chip key={s.key} active={form.delivery_slot === s.key} label={s.label} onPress={() => set('delivery_slot', s.key)} />
            ))}
          </View>
        </View>

        {msg ? <TextBody color={/saved|updated/i.test(msg) ? colors.blue : colors.inkSoft} style={{ fontSize: 13 }}>{msg}</TextBody> : null}
        <Button title="Save profile" loading={saving} onPress={save} />
      </ScrollView>
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: active ? colors.ink : colors.white, borderWidth: 1, borderColor: active ? colors.ink : colors.line }}>
      <TextMed color={active ? colors.white : colors.inkSoft} style={{ fontSize: 13.5 }}>{label}</TextMed>
    </Tap>
  );
}
