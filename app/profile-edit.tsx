import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
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
  // Success overlay: shows "Profile saved!" then returns to wherever the
  // member came from — saving must not strand them on the form.
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

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
      setSaved(true);
      savedTimer.current = setTimeout(() => router.back(), 1100);
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

      {/* automaticallyAdjustKeyboardInsets: iOS insets the scroll content in
          perfect sync with the keyboard's own animation (and scrolls the
          focused field into view), so lower fields and the save button are
          never buried and nothing jumps. Android's window resizes natively
          (softwareKeyboardLayoutMode "resize"), so it needs nothing extra. */}
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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

      {/* Saved! — a springing check over a near-opaque wash, then auto-back. */}
      {saved ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,252,248,0.97)', alignItems: 'center', justifyContent: 'center', gap: 16 }}
        >
          <Animated.View
            entering={ZoomIn.springify().damping(12).stiffness(200)}
            style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.card }}
          >
            <Ionicons name="checkmark" size={48} color={colors.white} />
          </Animated.View>
          <Serif style={{ fontSize: 24 }}>Profile saved!</Serif>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: active ? colors.action : colors.white, borderWidth: 1, borderColor: active ? colors.action : colors.line }}>
      <TextMed color={active ? colors.white : colors.inkSoft} style={{ fontSize: 13.5 }}>{label}</TextMed>
    </Tap>
  );
}
