import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, BackButton, Button, Tap } from '../components/ui';
import { enterUp } from '../lib/motion';
import {
  lookupBatch,
  recordScan,
  listScanHistory,
  testsPassed,
  downloadBatchPassportPdf,
  DEMO_BATCH_CODES,
  type MilkBatch,
  type MilkScan,
} from '../lib/milk';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function KnowYourMilk() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [batch, setBatch] = useState<MilkBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [history, setHistory] = useState<MilkScan[]>([]);

  useFocusEffect(useCallback(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setNotFound(null);
      setBatch(null);
      if (code) {
        const b = await lookupBatch(String(code));
        if (!on) return;
        if (b) {
          setBatch(b);
          void recordScan(String(code), b);
        } else {
          setNotFound(String(code).trim().toUpperCase());
        }
        setLoading(false);
        return;
      }
      // Landing mode: show the explainer + any recent scans.
      const h = await listScanHistory();
      if (on) { setHistory(h); setLoading(false); }
    })();
    return () => { on = false; };
  }, [code]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Know your milk</Serif>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 40 }} />
      ) : notFound ? (
        <NotFound code={notFound} onScan={() => router.replace('/(tabs)/traceability')} onLearn={() => router.replace('/know-your-milk')} />
      ) : batch ? (
        <BatchPassport batch={batch} />
      ) : (
        <Landing history={history} onScan={() => router.push('/(tabs)/traceability')} onDemo={(c) => router.push({ pathname: '/know-your-milk', params: { code: c } })} />
      )}
    </View>
  );
}

// ── Resolved batch passport ───────────────────────────────────────────────────

function BatchPassport({ batch }: { batch: MilkBatch }) {
  const passed = testsPassed(batch);
  const [downloading, setDownloading] = useState(false);
  const onDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadBatchPassportPdf(batch);
    } catch {
      /* user cancelled the share sheet or offline — no-op */
    } finally {
      setDownloading(false);
    }
  }, [batch]);
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {/* Union hero */}
      <Animated.View entering={enterUp()}>
        <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 12, ...shadow.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="business" size={28} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <TextBody color="rgba(255,255,255,0.88)" style={{ fontSize: 12 }}>Traced to your member dairy union</TextBody>
              <Serif color={colors.white} style={{ fontSize: 21 }}>{batch.union_name}</Serif>
              <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>{batch.district} · {batch.state}</TextBody>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.md, padding: 10 }}>
            <Ionicons name="shield-checkmark" size={18} color={colors.white} />
            <TextMed color={colors.white} style={{ fontSize: 13, flex: 1 }}>
              {passed} quality and safety tests passed
            </TextMed>
            {batch.verified ? <Pill label="VERIFIED" bg="rgba(255,255,255,0.22)" color={colors.white} /> : null}
          </View>
        </View>
      </Animated.View>

      {/* Federation framing */}
      <Animated.View entering={enterUp(40)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md }}>
        <Ionicons name="people-circle-outline" size={22} color={colors.flameDeep} />
        <TextBody style={{ fontSize: 12.5, flex: 1 }}>
          PARAG is the Pradeshik Cooperative Dairy Federation of Uttar Pradesh. Your pack was pooled from {batch.pouring_members.toLocaleString('en-IN')} pouring members across {batch.member_villages} member villages, then tested and packed at the union plant.
        </TextBody>
      </Animated.View>

      {/* Composition metrics */}
      <Animated.View entering={enterUp(60)} style={{ flexDirection: 'row', gap: spacing.md }}>
        <Metric label="FAT" value={`${batch.fat_pct}%`} icon="water" />
        <Metric label="SNF" value={`${batch.snf_pct}%`} icon="nutrition" />
        <Metric label="Villages" value={`${batch.member_villages}`} icon="leaf" />
      </Animated.View>

      {/* Journey: collected -> packed -> best before */}
      <Animated.View entering={enterUp(100)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
        <TextSemi style={{ fontSize: 15, marginBottom: 12 }}>Batch journey</TextSemi>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Stage icon="water" label="Collected" time={fmtDate(batch.batch_date)} />
          <Dash />
          <Stage icon="cube" label="Packed" time={fmtDate(batch.packed_at)} />
          <Dash />
          <Stage icon="calendar" label="Best before" time={fmtDate(batch.best_before)} />
        </View>
      </Animated.View>

      {/* Quality & safety tests */}
      <Animated.View entering={enterUp(120)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
        <TextSemi style={{ fontSize: 15, marginBottom: 4 }}>Quality and safety tests</TextSemi>
        <TextBody style={{ fontSize: 12, marginBottom: 12 }}>Every batch is tested at the union lab before it is packed.</TextBody>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {batch.tests.map((t) => (
            <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.pass ? colors.flameSoft : '#FDECEC', borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10 }}>
              <Ionicons name={t.pass ? 'checkmark-circle' : 'close-circle'} size={14} color={t.pass ? colors.flameDeep : colors.danger} />
              <TextBody color={colors.ink} style={{ fontSize: 11.5 }}>{t.name}{t.value ? ` ${t.value}` : ''}</TextBody>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Batch passport details */}
      <Animated.View entering={enterUp(140)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
        <View style={{ padding: spacing.md, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="receipt-outline" size={18} color={colors.flameDeep} />
          <TextSemi style={{ fontSize: 15, flex: 1 }}>Batch passport</TextSemi>
        </View>
        <Detail label="Batch code" value={batch.batch_code} />
        <Detail label="Product" value={batch.product} />
        <Detail label="Pack" value={batch.pack_size} />
        <Detail label="Dairy union" value={batch.union_name} />
        <Detail label="Plant" value={batch.plant} />
        <Detail label="Pouring members" value={batch.pouring_members.toLocaleString('en-IN')} />
        <Detail label="Packed" value={fmtDateTime(batch.packed_at)} last />
      </Animated.View>

      {/* Download the passport as a PDF (server-rendered label + QR) */}
      <Animated.View entering={enterUp(160)}>
        <Button
          title={downloading ? 'Preparing PDF…' : 'Download passport (PDF)'}
          onPress={onDownload}
          disabled={downloading}
          style={{ alignSelf: 'stretch' }}
        />
      </Animated.View>
    </ScrollView>
  );
}

// ── Landing / explainer ───────────────────────────────────────────────────────

const STEPS: { icon: any; title: string; body: string }[] = [
  { icon: 'scan-outline', title: 'Scan the pack', body: 'Point your camera at the QR or barcode, or type the batch code printed near the best-before date.' },
  { icon: 'business-outline', title: 'See your dairy union', body: 'We resolve the batch to the member district cooperative dairy union and the plant that packed it.' },
  { icon: 'shield-checkmark-outline', title: 'Read the tests', body: 'View the FAT, SNF and adulteration checks that batch passed at the union lab.' },
];

function Landing({ history, onScan, onDemo }: { history: MilkScan[]; onScan: () => void; onDemo: (code: string) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {/* Hero explainer */}
      <Animated.View entering={enterUp()}>
        <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 12, ...shadow.card }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="qr-code-outline" size={26} color={colors.white} />
          </View>
          <Serif color={colors.white} style={{ fontSize: 23 }}>Trace every pouch to its cooperative</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13.5 }}>
            PARAG milk is pooled by member district dairy unions across Uttar Pradesh. Scan a pack to see which union and plant it came from, and the quality tests it passed.
          </TextBody>
          <Button title="Scan your pack" variant="ghost" onPress={onScan} style={{ backgroundColor: colors.white, alignSelf: 'flex-start', paddingHorizontal: spacing.lg }} />
        </View>
      </Animated.View>

      {/* How it works */}
      <Animated.View entering={enterUp(60)} style={{ gap: spacing.sm }}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={s.icon} size={20} color={colors.flameDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <TextSemi style={{ fontSize: 14.5 }}>{i + 1}. {s.title}</TextSemi>
              <TextBody style={{ fontSize: 12.5, marginTop: 2 }}>{s.body}</TextBody>
            </View>
          </View>
        ))}
      </Animated.View>

      {/* Recent scans */}
      {history.length ? (
        <Animated.View entering={enterUp(100)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
          <View style={{ padding: spacing.md, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="time-outline" size={18} color={colors.flameDeep} />
            <TextSemi style={{ fontSize: 15 }}>Recently traced</TextSemi>
          </View>
          {history.map((h, i) => (
            <Tap key={h.id} onPress={() => onDemo(h.batch_code)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: i === history.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
              <Ionicons name="cube-outline" size={18} color={colors.inkMute} />
              <View style={{ flex: 1 }}>
                <TextMed style={{ fontSize: 13.5 }} numberOfLines={1}>{h.batch_code}</TextMed>
                <TextBody style={{ fontSize: 12 }} numberOfLines={1}>{h.union_name}</TextBody>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
            </Tap>
          ))}
        </Animated.View>
      ) : null}

      {/* Try a demo code */}
      <Animated.View entering={enterUp(140)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10, ...shadow.soft }}>
        <TextSemi style={{ fontSize: 14.5 }}>Try a sample batch</TextSemi>
        <TextBody style={{ fontSize: 12.5 }}>No pack handy? Tap a demo batch to see a full cooperative passport.</TextBody>
        <View style={{ gap: 8 }}>
          {DEMO_BATCH_CODES.map((c) => (
            <Tap key={c} onPress={() => onDemo(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.wash }}>
              <Ionicons name="pricetag-outline" size={16} color={colors.flameDeep} />
              <TextMed style={{ fontSize: 13, flex: 1 }} numberOfLines={1}>{c}</TextMed>
              <Ionicons name="chevron-forward" size={16} color={colors.inkMute} />
            </Tap>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────────

function NotFound({ code, onScan, onLearn }: { code: string; onScan: () => void; onLearn: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
      <Ionicons name="search-outline" size={40} color={colors.inkMute} />
      <Serif style={{ fontSize: 22, textAlign: 'center' }}>We could not trace that batch</Serif>
      <TextBody style={{ textAlign: 'center' }}>Double-check the code on your pack and try again. You entered:</TextBody>
      <TextMed color={colors.flameDeep} style={{ fontSize: 15, textAlign: 'center' }}>{code}</TextMed>
      <Button title="Scan again" onPress={onScan} style={{ alignSelf: 'stretch', marginTop: 6 }} />
      <Tap haptic={false} onPress={onLearn}>
        <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>How cooperative tracing works</TextMed>
      </Tap>
    </View>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Metric({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, alignItems: 'center', ...shadow.soft }}>
      <Ionicons name={icon} size={18} color={colors.flameDeep} />
      <Serif style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Serif>
      <TextBody style={{ fontSize: 11 }} numberOfLines={1}>{label}</TextBody>
    </View>
  );
}

function Stage({ icon, label, time }: { icon: any; label: string; time: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, flexShrink: 0, width: 78 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.flameDeep} />
      </View>
      <TextMed style={{ fontSize: 11.5 }}>{label}</TextMed>
      <TextBody style={{ fontSize: 10.5, textAlign: 'center' }}>{time}</TextBody>
    </View>
  );
}

function Dash() {
  return <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.flameSoft, marginHorizontal: 4, marginTop: 18 }} />;
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <TextBody style={{ fontSize: 13.5 }} numberOfLines={1}>{label}</TextBody>
      <TextMed numberOfLines={2} style={{ fontSize: 13.5, flexShrink: 1, maxWidth: '66%', textAlign: 'right' }}>{value}</TextMed>
    </View>
  );
}
