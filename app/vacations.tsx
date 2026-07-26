import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, BackButton } from '../components/ui';
import { listVacations, addVacation, deleteVacation, type Vacation } from '../lib/subscriptions';

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PRESETS = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

export default function Vacations() {
  const insets = useSafeAreaInsets();
  const [vacs, setVacs] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setVacs(await listVacations()); } catch { /* keep last-known list */ }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pause(days: number) {
    setBusy(true); setErr('');
    try {
      await addVacation({ startDate: isoIn(0), endDate: isoIn(days - 1), reason: 'Away from home' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Could not schedule the pause. Please try again.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setErr('');
    try { await deleteVacation(id); await load(); }
    catch (e: any) { setErr(e?.message ?? 'Could not remove the pause.'); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Set vacation</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="airplane" size={18} color={colors.blue} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.blue}>Travelling? Pause deliveries so milk isn’t left at your door while you’re away.</TextBody>
        </View>

        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 12, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 16 }}>Pause from today for…</TextSemi>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRESETS.map((p) => (
              <Tap key={p.days} onPress={() => pause(p.days)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.wash, borderWidth: 1, borderColor: colors.line }}>
                <TextMed style={{ fontSize: 14 }}>{p.label}</TextMed>
              </Tap>
            ))}
          </View>
        </View>

        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}

        <TextSemi style={{ fontSize: 16 }}>Scheduled pauses</TextSemi>
        {loading ? (
          <ActivityIndicator color={colors.flameDeep} />
        ) : vacs.length === 0 ? (
          <TextBody style={{ fontSize: 13 }}>No vacations scheduled.</TextBody>
        ) : (
          vacs.map((v) => (
            <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
              <Ionicons name="calendar-outline" size={20} color={colors.flameDeep} />
              <View style={{ flex: 1 }}>
                <TextMed style={{ fontSize: 14 }}>{fmt(v.start_date)} → {fmt(v.end_date)}</TextMed>
                {v.reason ? <TextBody style={{ fontSize: 12 }}>{v.reason}</TextBody> : null}
              </View>
              <Tap haptic={false} onPress={() => remove(v.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.inkMute} />
              </Tap>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
