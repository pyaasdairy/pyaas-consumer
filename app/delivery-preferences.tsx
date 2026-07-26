import React, { useCallback, useState } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, Button, BackButton, Field } from '../components/ui';
import { getDeliveryPrefs, saveDeliveryPrefs, DEFAULT_PREFS, type DeliveryPrefs } from '../lib/deliveryPrefs';

export default function DeliveryPreferences() {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<DeliveryPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useFocusEffect(useCallback(() => { getDeliveryPrefs().then(setP); }, []));

  function set<K extends keyof DeliveryPrefs>(k: K, v: DeliveryPrefs[K]) {
    setP((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      await saveDeliveryPrefs(p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMsg('Preferences saved.');
    } catch (e: any) { setMsg(e?.message ?? 'Could not save.'); }
    finally { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Delivery preferences</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow.soft }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bicycle" size={24} color={colors.white} />
          </View>
          <TextBody color={colors.white} style={{ flex: 1, fontSize: 13.5 }}>Help our delivery captain with your customised delivery preferences.</TextBody>
        </View>

        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
          <Row icon="call-outline" label="Call before delivery" value={p.call_before} onChange={(v) => set('call_before', v)} />
          <Row icon="notifications-outline" label="Ring the bell" value={p.ring_bell} onChange={(v) => set('ring_bell', v)} last />
        </View>

        <Field label="Notes for the captain" value={p.notes ?? ''} onChangeText={(v) => set('notes', v)} placeholder="e.g. Leave at gate, blue door" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

        <TextBody style={{ fontSize: 11.5 }}>These preferences reach your delivery captain on every order.</TextBody>
        {msg ? <TextBody color={msg.includes('saved') ? colors.blue : colors.flameDeep} style={{ fontSize: 13 }}>{msg}</TextBody> : null}
        <Button title="Save preferences" loading={saving} onPress={save} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value, onChange, last }: { icon: any; label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <Ionicons name={icon} size={19} color={colors.inkSoft} />
      <TextMed style={{ flex: 1, fontSize: 14.5 }}>{label}</TextMed>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.flameDeep, false: colors.line }} thumbColor={colors.white} />
    </View>
  );
}
