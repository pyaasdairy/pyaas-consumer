import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, BackButton } from '../components/ui';
import { getMilkPassport, type MilkPassport } from '../lib/milk';

export default function Quality() {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<MilkPassport | null>(null);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => { getMilkPassport().then((d) => { setP(d); setLoading(false); }); }, []));

  // Freshness is only shown when the batch actually carries a measured score
  // (the ops bridge does not compute one · we never fabricate a number).
  const fresh = p?.freshness_score ?? null;
  const hasFat = p?.fat != null;
  const hasSnf = p?.snf != null;
  const hasTemp = p?.temperature_c != null;
  // Adulteration is only "Passed" when the source truly reports it; otherwise we
  // state what we know rather than painting a green pass on every batch.
  const adultPassed = p?.adulteration_passed === true;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Quality dashboard</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.roseDeep} style={{ marginTop: 30 }} />
        ) : (
          <>
            {/* Solid pink hero · no gradient. Shows the measured score when present,
                otherwise the batch is identified honestly without a fake number. */}
            <View style={{ borderRadius: radius.xl, padding: spacing.lg, gap: 4, backgroundColor: colors.roseDeep, ...shadow.card }}>
              {fresh != null ? (
                <>
                  <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>Measured freshness score</TextBody>
                  <Serif color={colors.white} style={{ fontSize: 40 }}>{fresh}<TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 18 }}> / 100</TextBody></Serif>
                </>
              ) : (
                <>
                  <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13 }}>Your latest batch</TextBody>
                  <Serif color={colors.white} style={{ fontSize: 30 }}>{p?.batch_code ?? 'Not yet linked'}</Serif>
                </>
              )}
              <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5 }}>Batch {p?.batch_code ?? '-'}</TextBody>
            </View>

            {/* Real measured values · FAT and SNF carry a confirmed glyph only when a
                number is actually present. Temperature shows only if the source has it. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <Card label="FAT" value={hasFat ? `${p?.fat}%` : 'Not reported'} sub="Lab-measured" ok={hasFat} muted={!hasFat} />
              <Card label="SNF" value={hasSnf ? `${p?.snf}%` : 'Not reported'} sub="Lab-measured" ok={hasSnf} muted={!hasSnf} />
              {hasTemp ? (
                <Card label="Temperature" value={`${p?.temperature_c}°C`} sub="Cold-chain reading" ok />
              ) : (
                <Card label="Temperature" value="Not logged" sub="Cold-chain maintained" muted />
              )}
              <Card
                label="Adulteration"
                value={adultPassed ? 'Passed' : 'Not reported'}
                sub="Water · starch · detergent"
                ok={adultPassed}
                muted={!adultPassed}
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: 12 }}>
              <Ionicons name="shield-checkmark" size={18} color={colors.sage} />
              <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.sage}>Each batch is formed only from quality-approved collections at the centre. Figures here come straight from that batch record.</TextBody>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Card({ label, value, sub, ok, muted }: { label: string; value: string; sub?: string; ok?: boolean; muted?: boolean }) {
  return (
    <View style={{ width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 2, ...shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextBody style={{ fontSize: 12 }}>{label}</TextBody>
        {ok ? <Ionicons name="checkmark-circle" size={16} color={colors.sage} /> : null}
      </View>
      <Serif style={{ fontSize: 22 }} color={muted ? colors.inkMute : colors.ink}>{value}</Serif>
      {sub ? <TextBody style={{ fontSize: 11 }} color={muted ? colors.inkMute : colors.inkSoft}>{sub}</TextBody> : null}
    </View>
  );
}
