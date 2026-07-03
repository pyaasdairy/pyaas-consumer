import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, BackButton, Button, Tap } from '../components/ui';
import { enterUp } from '../lib/motion';
import { getMilkPassport, getMilkPassportByBatch, type MilkPassport } from '../lib/milk';
import { getMilkPassportByToken, normalizeBatchCode, type SaathiPassport } from '../lib/saathi';
import { fetchOpsPassport, type OpsPassport } from '../lib/opsPassport';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Unified view-model: a scanned Saathi passport or the local latest batch. */
type Report = {
  source: 'scan' | 'latest';
  batchLabel: string;
  farmerName: string;
  village: string;
  centre: string;
  fat: number | null;
  snf: number | null;
  checksPassed: number | null;
  collectedAt: string | null;
  packagedAt: string | null;
  deliveredAt: string | null;
  freshness: number | null;
  adulterationPassed: boolean;
  extras: Record<string, any>;
};

function fromSaathi(p: SaathiPassport): Report {
  const r = p.report ?? {};
  return {
    source: 'scan',
    batchLabel: (r.batch_code as string) ?? 'Scanned batch',
    farmerName: (r.farmer_name as string) ?? 'A PYAAS farmer',
    village: (r.village as string) ?? p.cluster ?? '-',
    centre: p.centre ?? '-',
    fat: p.fat_pct, snf: p.snf_pct,
    checksPassed: p.checks_passed,
    collectedAt: p.collected_at, packagedAt: p.packaged_at, deliveredAt: p.delivered_at,
    freshness: (r.freshness_score as number) ?? null,
    adulterationPassed: (r.adulteration_pass as boolean) ?? true,
    extras: r,
  };
}

function fromLocal(p: MilkPassport, source: 'scan' | 'latest' = 'latest'): Report {
  return {
    source,
    batchLabel: p.batch_code,
    farmerName: p.farmer_name ?? 'A PYAAS farmer',
    village: p.village ?? '-',
    centre: p.collection_centre ?? '-',
    fat: p.fat, snf: p.snf,
    checksPassed: null,
    collectedAt: p.collected_at ?? null, packagedAt: p.packaged_at, deliveredAt: p.delivered_at,
    freshness: p.freshness_score,
    adulterationPassed: p.adulteration_passed ?? true,
    extras: {},
  };
}

function fromOps(p: OpsPassport): Report {
  // Lead with a photographed farm when one exists so the hero shows a real face/farm.
  const lead = p.contributingFarms.find((f) => f.portraitUrl || f.farmPhotoUrl) ?? p.contributingFarms[0];
  const checks = p.adulterationTests.filter((t) => t.pass).length;
  return {
    source: 'scan',
    batchLabel: p.batchCode,
    farmerName: lead?.firstName ?? 'PYAAS farmers',
    village: lead?.village ?? p.farmCluster.district ?? '-',
    centre: p.farmCluster.name,
    fat: p.composition.fatPct,
    snf: p.composition.snfPct,
    checksPassed: checks,
    // Full timestamps (date + time) for the farm-to-home journey.
    collectedAt: p.collectedAt ?? p.collectionDateFrom,
    packagedAt: p.packagedAt ?? p.processingDate,
    deliveredAt: p.deliveredAt,
    freshness: null,
    adulterationPassed: p.quality.adulterationPass,
    extras: {},
  };
}

export default function KnowYourMilk() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [r, setR] = useState<Report | null>(null);
  const [ops, setOps] = useState<OpsPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setOps(null);
      setNotFound(null);
      // A scanned token must resolve to the SCANNED batch (not the user's own
      // latest). The ops API gives the richest, verified passport (cluster +
      // per-farm Fat/SNF + farmer score + all 8 adulteration tests).
      if (token) {
        const code = normalizeBatchCode(String(token)) ?? String(token).trim();
        const o = await fetchOpsPassport(code);
        if (o && on) { setOps(o); setR(fromOps(o)); setLoading(false); return; }
        const b = await getMilkPassportByBatch(code);
        if (b && on) { setR(fromLocal(b, 'scan')); setLoading(false); return; }
        const p = await getMilkPassportByToken(code);
        if (p && on) { setR(fromSaathi(p)); setLoading(false); return; }
        // Scanned/typed a code we couldn't resolve — show a not-found state
        // rather than masquerading the user's own latest passport as the scan.
        if (on) { setNotFound(code); setR(null); setLoading(false); }
        return;
      }
      const local = await getMilkPassport();
      if (on) { setR(local ? fromLocal(local) : null); setLoading(false); }
    })();
    return () => { on = false; };
  }, [token]));

  // The farm to feature (prefer one with a real photo/portrait — e.g. the flagship).
  const heroFarm = ops ? (ops.contributingFarms.find((f) => f.portraitUrl || f.farmPhotoUrl) ?? ops.contributingFarms[0] ?? null) : null;
  const heroPortrait = heroFarm?.portraitUrl ?? heroFarm?.farmPhotoUrl ?? null;
  const heroFarmPhoto = heroFarm?.farmPhotoUrl ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Know your milk</Serif>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.roseDeep} style={{ marginTop: 40 }} />
      ) : notFound ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
          <Ionicons name="search-outline" size={40} color={colors.inkMute} />
          <Serif style={{ fontSize: 22, textAlign: 'center' }}>We couldn’t find that batch</Serif>
          <TextBody style={{ textAlign: 'center' }}>
            Double-check the code on your pack and try again. You scanned:
          </TextBody>
          <TextMed color={colors.roseDeep} style={{ fontSize: 15, textAlign: 'center' }}>{notFound}</TextMed>
          <Button title="Scan again" onPress={() => router.replace('/(tabs)/traceability')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          <Tap haptic={false} onPress={() => router.replace('/know-your-milk')}>
            <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>View my latest milk passport</TextMed>
          </Tap>
        </View>
      ) : !r ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 10 }}>
          <Ionicons name="leaf-outline" size={40} color={colors.inkMute} />
          <TextBody style={{ textAlign: 'center' }}>Your milk’s passport will appear here after your first delivery.</TextBody>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Farmer hero */}
          <Animated.View entering={enterUp()}>
            <View style={{ backgroundColor: colors.roseDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 10, ...shadow.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {heroPortrait ? (
                  <Image source={{ uri: heroPortrait }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.22)' }} />
                ) : (
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={30} color={colors.white} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <TextBody color="rgba(255,255,255,0.88)" style={{ fontSize: 12 }}>
                    {r.source === 'scan' ? 'Scanned · live from the farm' : 'Milked for you by'}
                  </TextBody>
                  <Serif color={colors.white} style={{ fontSize: 24 }}>{r.farmerName}</Serif>
                  <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>{r.village}</TextBody>
                </View>
              </View>
              {r.adulterationPassed ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.md, padding: 10 }}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.white} />
                  <TextMed color={colors.white} style={{ fontSize: 13 }}>
                    {r.checksPassed != null ? `${r.checksPassed} quality checks passed` : 'Passed all adulteration tests'}
                    {r.freshness != null ? ` · ${r.freshness}% fresh` : ''}
                  </TextMed>
                </View>
              ) : null}
            </View>
          </Animated.View>

          {/* Farm photo — real photo of the farm this milk came from */}
          {heroFarmPhoto ? (
            <Animated.View entering={enterUp(40)} style={{ borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
              <Image source={{ uri: heroFarmPhoto }} style={{ width: '100%', height: 200, backgroundColor: colors.roseSoft }} resizeMode="cover" />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.38)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location" size={16} color={colors.white} />
                <TextMed color={colors.white} style={{ fontSize: 13, flex: 1 }}>
                  {heroFarm?.firstName ?? 'The farm'}{heroFarm?.village ? ` · ${heroFarm.village}` : ''}
                </TextMed>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Ionicons name="camera" size={12} color={colors.white} />
                  <TextBody color={colors.white} style={{ fontSize: 11 }}>Farm photo</TextBody>
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* Quality numbers */}
          <Animated.View entering={enterUp(60)} style={{ flexDirection: 'row', gap: spacing.md }}>
            <Metric label="FAT" value={r.fat != null ? `${r.fat}%` : '-'} icon="water" />
            <Metric label="SNF" value={r.snf != null ? `${r.snf}%` : '-'} icon="nutrition" />
            <Metric label="Checks" value={r.checksPassed != null ? `${r.checksPassed}` : '-'} icon="shield-checkmark" />
          </Animated.View>

          {/* Freshness timeline (collected → packaged → delivered) */}
          <Animated.View entering={enterUp(100)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
            <TextSemi style={{ fontSize: 15, marginBottom: 12 }}>Freshness journey</TextSemi>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Stage icon="water" label="Collected" time={fmtTime(r.collectedAt)} />
              <Dash />
              <Stage icon="cube" label="Packaged" time={fmtTime(r.packagedAt)} />
              <Dash />
              <Stage icon="home" label="Delivered" time={fmtTime(r.deliveredAt)} />
            </View>
          </Animated.View>

          {/* All 8 adulteration tests (from the ops passport) */}
          {ops ? (
            <Animated.View entering={enterUp(120)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
              <TextSemi style={{ fontSize: 15, marginBottom: 12 }}>Quality & safety tests</TextSemi>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ops.adulterationTests.map((t) => (
                  <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.pass ? colors.roseSoft : '#FDECEC', borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Ionicons name={t.pass ? 'checkmark-circle' : 'close-circle'} size={14} color={t.pass ? colors.roseDeep : '#C0392B'} />
                    <TextBody style={{ fontSize: 11.5 }}>{/[a-z]/.test(t.name) ? t.name : t.name[0] + t.name.slice(1).toLowerCase()}</TextBody>
                  </View>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {/* Cluster of contributing farms (from the ops passport) */}
          {ops && ops.contributingFarms.length ? (
            <Animated.View entering={enterUp(130)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
              <View style={{ padding: spacing.md, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="people-outline" size={18} color={colors.roseDeep} />
                <TextSemi style={{ fontSize: 15, flex: 1 }}>Farm cluster · {ops.farmCluster.name}</TextSemi>
                <TextBody style={{ fontSize: 11 }} color={colors.inkMute}>% of milk</TextBody>
              </View>
              {ops.contributingFarms.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: i === ops.contributingFarms.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
                  {(f.portraitUrl ?? f.farmPhotoUrl) ? (
                    <Image source={{ uri: (f.portraitUrl ?? f.farmPhotoUrl) as string }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.roseSoft }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.roseSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={18} color={colors.roseDeep} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <TextMed style={{ fontSize: 14 }}>{f.firstName}{f.village ? ` · ${f.village}` : ''}</TextMed>
                    <TextBody style={{ fontSize: 12 }}>
                      FAT {f.fatPct ?? '-'}% · SNF {f.snfPct ?? '-'}%{f.collectedAt ? ` · ${fmtTime(f.collectedAt)}` : ''}
                    </TextBody>
                  </View>
                  {f.sharePct != null ? <Pill label={`${f.sharePct}%`} bg={colors.roseSoft} color={colors.roseDeep} /> : null}
                </View>
              ))}
            </Animated.View>
          ) : null}

          {/* Passport details */}
          <Animated.View entering={enterUp(140)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
            <View style={{ padding: spacing.md, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="receipt-outline" size={18} color={colors.roseDeep} />
              <TextSemi style={{ fontSize: 15 }}>Batch passport</TextSemi>
              {r.source === 'scan' ? <Pill label="VERIFIED" bg={colors.roseSoft} color={colors.roseDeep} /> : null}
            </View>
            <Detail label="Batch" value={r.batchLabel} />
            <Detail label="Collection centre" value={r.centre} />
            <Detail label="Collected" value={fmtDate(r.collectedAt)} />
            <Detail label="Packaged" value={fmtDate(r.packagedAt)} />
            <Detail label="Delivered" value={fmtDate(r.deliveredAt)} last />
          </Animated.View>

          {/* Farm story teaser */}
          <Animated.View entering={enterUp(180)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
            {heroFarmPhoto ? (
              <Image source={{ uri: heroFarmPhoto }} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.roseSoft }} />
            ) : (
              <Ionicons name="film-outline" size={22} color={colors.roseDeep} />
            )}
            <View style={{ flex: 1 }}>
              <TextMed style={{ fontSize: 14 }}>Farm story{heroFarmPhoto ? '' : ' & farm video'}</TextMed>
              <TextBody style={{ fontSize: 12 }}>
                {heroFarm?.story ?? `Meet ${r.farmerName.split(' ')[0]} · photos and video arrive with the farm-story sync.`}
              </TextBody>
            </View>
            {heroFarmPhoto ? null : <Pill label="SOON" bg={colors.cream} color={colors.inkMute} />}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, alignItems: 'center', ...shadow.soft }}>
      <Ionicons name={icon} size={18} color={colors.roseDeep} />
      <Serif style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Serif>
      <TextBody style={{ fontSize: 11 }} numberOfLines={1}>{label}</TextBody>
    </View>
  );
}

function Stage({ icon, label, time }: { icon: any; label: string; time: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.roseSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.roseDeep} />
      </View>
      <TextMed style={{ fontSize: 11.5 }}>{label}</TextMed>
      <TextBody style={{ fontSize: 10.5 }}>{time}</TextBody>
    </View>
  );
}

function Dash() {
  return <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.roseSoft, marginHorizontal: 6, marginBottom: 28 }} />;
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <TextBody style={{ fontSize: 13.5 }} numberOfLines={1}>{label}</TextBody>
      <TextMed numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 13.5, flexShrink: 1, maxWidth: '70%', textAlign: 'right' }}>{value}</TextMed>
    </View>
  );
}
