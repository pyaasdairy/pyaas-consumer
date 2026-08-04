import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { StartDatePicker } from '../components/StartDatePicker';
import { todayISO, addDaysISO, formatShort } from '../lib/dates';
import { listVacations, addVacation, deleteVacation, type Vacation } from '../lib/subscriptions';
import { ConfirmSheet, type ConfirmConfig } from '../components/ConfirmSheet';

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Quick-fill shortcuts: set the FROM→TO range from today, then the member can
// still fine-tune either end before scheduling.
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

  // Explicit start → end range (the member picks both dates). Defaults to a
  // single day starting today; end never precedes start.
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setVacs(await listVacations()); } catch { /* keep last-known list */ }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Inclusive day count for the summary line.
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);

  function applyPreset(n: number) {
    Haptics.selectionAsync();
    setFrom(todayISO());
    setTo(addDaysISO(todayISO(), n - 1));
    setErr('');
  }

  function pickFrom(iso: string) {
    setFrom(iso);
    // Keep the range valid: if the new start is after the current end, snap end to start.
    if (iso > to) setTo(iso);
    setPicker(null);
  }
  function pickTo(iso: string) {
    setTo(iso < from ? from : iso);
    setPicker(null);
  }

  async function doSchedule() {
    setBusy(true); setErr('');
    try {
      await addVacation({ startDate: from, endDate: to, reason: 'Away from home' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Reset to a fresh single-day range for the next entry.
      setFrom(todayISO()); setTo(todayISO());
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Could not schedule the pause. Please try again.'); }
    finally { setBusy(false); }
  }

  // Validate, then confirm — the backend is only hit after "Set vacation".
  function schedule() {
    if (to < from) { setErr('The end date can’t be before the start date.'); return; }
    setConfirm({
      title: 'Set vacation?',
      message: 'Deliveries pause for the dates you chose. You can remove it anytime.',
      confirmLabel: 'Set vacation',
      cancelLabel: 'Not now',
      icon: 'airplane-outline',
      onConfirm: () => { setConfirm(null); void doSchedule(); },
    });
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

        {/* Add vacation — explicit start → end date range */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 14, ...shadow.soft }}>
          <TextSemi style={{ fontSize: 16 }}>Add a vacation</TextSemi>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DateField label="From" value={from} onPress={() => setPicker('from')} />
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 18 }}>
              <Ionicons name="arrow-forward" size={16} color={colors.inkMute} />
            </View>
            <DateField label="To" value={to} onPress={() => setPicker('to')} />
          </View>

          {/* Quick presets fill the range from today; still adjustable above. */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRESETS.map((p) => (
              <Tap key={p.days} onPress={() => applyPreset(p.days)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.flameSoft, borderWidth: 1, borderColor: colors.flame }}>
                <TextMed style={{ fontSize: 12.5 }} color={colors.flameDeep}>{p.label}</TextMed>
              </Tap>
            ))}
          </View>

          <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>
            Deliveries paused for {days} day{days === 1 ? '' : 's'} · {fmt(from)} → {fmt(to)}. No charge on paused days.
          </TextBody>

          {err ? <TextBody color={colors.danger} style={{ fontSize: 12.5 }}>{err}</TextBody> : null}

          <Tap onPress={busy ? undefined : schedule} style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="airplane" size={18} color={colors.white} />}
            <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>{busy ? 'Scheduling…' : 'Add vacation'}</TextSemi>
          </Tap>
        </View>

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

      {picker ? (
        <StartDatePicker
          value={picker === 'from' ? from : to}
          minISO={picker === 'to' ? from : todayISO()}
          onConfirm={(iso) => (picker === 'from' ? pickFrom(iso) : pickTo(iso))}
          onClose={() => setPicker(null)}
        />
      ) : null}

      <ConfirmSheet config={confirm} onDismiss={() => setConfirm(null)} />
    </View>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <TextBody style={{ fontSize: 12 }} color={colors.inkMute}>{label}</TextBody>
      <Tap haptic={false} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.flame, borderRadius: radius.md, paddingHorizontal: 12, height: 50, backgroundColor: colors.white }}>
        <Ionicons name="calendar-outline" size={17} color={colors.flameDeep} />
        <TextSemi style={{ fontSize: 14 }}>{formatShort(value)}</TextSemi>
      </Tap>
    </View>
  );
}
