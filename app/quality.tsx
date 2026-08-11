import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, BackButton, Pill } from '../components/ui';
import { ShineSweep, useCountUp } from '../components/Fx';
import { getQualitySummary, type QualitySummary, type QualityTest } from '../lib/quality';

/**
 * PYAAS quality dashboard. PYAAS sources from a cooperative network, so this is an
 * honest, batch-level view: the pass rate and averages roll up the recent lab
 * tests each member district dairy union logged, and every card is backed by a
 * real batch record below. Solid colours only, effects clipped inside the hero.
 *
 * With no records the screen shows NoReports, not a zeroed dashboard: the numbers
 * here are food-safety claims, so the only honest thing to render when the lab
 * data has not reached us is that it has not reached us. (lib/quality.ts used to
 * seed a fabricated week of results to fill this screen — see the note there.)
 */
export default function Quality() {
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<QualitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getQualitySummary()
        .then((d) => {
          if (!alive) return;
          setS(d);
          setLoading(false);
        })
        .catch(() => {
          // A read failure must land on the empty state, never spin forever.
          if (!alive) return;
          setS(null);
          setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  const passRate = useCountUp(s?.passRate ?? 0, 1200, !loading && !!s);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.lg,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Quality dashboard</Serif>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 8, gap: spacing.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 40 }} />
        ) : !s || s.total === 0 ? (
          <NoReports />
        ) : (
          <>
            {/* Hero: batch pass rate across the recent federation tests. Solid
                flame fill, sheen clipped inside the box (no gradient, no halo). */}
            <View
              style={{
                borderRadius: radius.xl,
                padding: spacing.lg,
                gap: 4,
                backgroundColor: colors.flameDeep,
                overflow: 'hidden',
                ...shadow.card,
              }}
            >
              <ShineSweep />
              <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>
                Batch pass rate
              </TextBody>
              <Serif color={colors.white} style={{ fontSize: 46 }}>
                {passRate}
                <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 20 }}>
                  %
                </TextBody>
              </Serif>
              <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5 }}>
                {s.total} recent batches tested across member dairy unions
              </TextBody>
            </View>

            {/* Roll-up stats. Blue is the brand success colour (no green). */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <Stat label="Average FAT" value={`${s.avgFat}%`} sub="Lab-measured" icon="water-outline" />
              <Stat label="Average SNF" value={`${s.avgSnf}%`} sub="Lab-measured" icon="nutrition-outline" />
              <Stat
                label="Adulteration-free"
                value={`${s.cleanStreak} in a row`}
                sub="Water, starch, detergent"
                icon="shield-checkmark-outline"
                accent
              />
              <Stat label="Batches tested" value={`${s.total}`} sub="Last few days" icon="flask-outline" />
            </View>

            <TextSemi style={{ fontSize: 16, marginTop: spacing.xs }}>Recent quality tests</TextSemi>
            <View style={{ gap: spacing.sm }}>
              {s.tests.map((t) => (
                <TestRow key={t.id} t={t} />
              ))}
            </View>

            {/* Cooperative framing note, honest about how testing works. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                backgroundColor: colors.cream,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                padding: 14,
                marginTop: spacing.xs,
              }}
            >
              <Ionicons name="shield-checkmark" size={18} color={colors.blue} style={{ marginTop: 1 }} />
              <TextBody style={{ flex: 1, fontSize: 12.5 }}>
                Milk is tested at the village society and again at the member dairy union plant before
                pasteurisation. Every figure here is read straight from that batch record, scan a pack
                QR to trace your own batch.
              </TextBody>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Honest empty state. A zeroed hero would read as "0% of batches passed", which
 * is a worse lie than the seed we removed, so say plainly that no lab record has
 * arrived and make no claim about batches we have no data for.
 */
function NoReports() {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 44, paddingHorizontal: spacing.sm }}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: colors.flameSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="flask-outline" size={34} color={colors.flameDeep} />
      </View>
      <Serif style={{ fontSize: 22, textAlign: 'center' }}>No lab reports yet.</Serif>
      <TextBody style={{ textAlign: 'center', fontSize: 13 }}>
        We publish FAT, SNF, cold-chain and adulteration-screen readings here exactly as the member
        dairy union's lab reports them, and nothing else. No batch records have reached the app yet.
      </TextBody>
      <TextBody style={{ textAlign: 'center', fontSize: 12.5 }} color={colors.inkMute}>
        Scan the QR on your pack to check whether your own batch has a record.
      </TextBody>
    </View>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        width: '47%',
        flexGrow: 1,
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.md,
        gap: 3,
        ...shadow.soft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextBody style={{ fontSize: 12 }}>{label}</TextBody>
        <Ionicons name={icon} size={16} color={accent ? colors.blue : colors.inkMute} />
      </View>
      <Serif style={{ fontSize: 22 }} color={colors.ink}>
        {value}
      </Serif>
      {sub ? (
        <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>
          {sub}
        </TextBody>
      ) : null}
    </View>
  );
}

function TestRow({ t }: { t: QualityTest }) {
  const date = new Date(t.tested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.md,
        gap: 10,
        ...shadow.soft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <TextSemi style={{ fontSize: 14.5 }}>{t.batch_code}</TextSemi>
          <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>
            {t.union_name}
          </TextBody>
          <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>
            {t.plant} · {date}
          </TextBody>
        </View>
        {t.passed ? (
          <Pill label="Passed" bg={colors.blueSoft} color={colors.blue} />
        ) : (
          <Pill label="Review" bg="rgba(198,40,40,0.1)" color={colors.danger} />
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Metric label="FAT" value={`${t.fat}%`} />
        <Metric label="SNF" value={`${t.snf}%`} />
        <Metric label="Temp" value={`${t.temperature_c}°C`} />
        <Metric label="Adulteration" value={t.adulteration_passed ? 'Clean' : 'Flag'} ok={t.adulteration_passed} />
      </View>
    </View>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: colors.wash,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {ok ? <Ionicons name="checkmark-circle" size={13} color={colors.blue} /> : null}
      <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>
        {label}
      </TextBody>
      <TextSemi style={{ fontSize: 12.5 }}>{value}</TextSemi>
    </View>
  );
}
