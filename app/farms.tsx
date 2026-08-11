import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, BackButton, Tap } from '../components/ui';
import { listSourceDairies, type SourceDairy } from '../lib/farms';

export default function Farms() {
  const insets = useSafeAreaInsets();
  const [dairies, setDairies] = useState<SourceDairy[]>([]);
  const [loading, setLoading] = useState(true);

  // Static, evidenced list now (no GPS, no nearest-plant ranking) — we no longer
  // claim a partner network to sort the user against.
  useEffect(() => {
    let alive = true;
    listSourceDairies().then((rows) => {
      if (!alive) return;
      setDairies(rows);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Where your milk is made</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="business" size={18} color={colors.blue} style={{ marginTop: 1 }} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.blue}>
            PYAAS delivers dairy, it does not run a dairy. Your order is made by the cooperative milk union named below and reaches you in that manufacturer's sealed pack.
          </TextBody>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 24 }} />
        ) : dairies.length === 0 ? (
          <TextBody>No dairy details listed yet.</TextBody>
        ) : (
          <>
            {dairies.map((d) => <DairyCard key={d.id} dairy={d} />)}
            <TextBody style={{ fontSize: 11.5, textAlign: 'center', marginTop: spacing.sm }} color={colors.inkMute}>
              We list only the dairy named on the pack you receive. Anything we cannot evidence is not listed here.
            </TextBody>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DairyCard({ dairy }: { dairy: SourceDairy }) {
  const router = useRouter();

  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="business" size={24} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <TextSemi style={{ fontSize: 15 }}>{dairy.shortName}</TextSemi>
          <TextBody style={{ fontSize: 12.5 }}>{dairy.district}, Uttar Pradesh</TextBody>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.md, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name="location-outline" size={15} color={colors.inkMute} style={{ marginTop: 2 }} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }}>{dairy.plant}</TextBody>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name="pricetag-outline" size={15} color={colors.inkMute} style={{ marginTop: 2 }} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }}>
            Packs carry the manufacturer's {dairy.brand} brand. PYAAS sells them as they leave the plant.
          </TextBody>
        </View>
        <TextBody style={{ fontSize: 12.5 }}>{dairy.blurb}</TextBody>
      </View>

      <View style={{ padding: spacing.md }}>
        <Tap
          onPress={() => router.push('/fssai-details')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.cream, borderRadius: radius.pill, paddingVertical: 11, borderWidth: 1, borderColor: colors.line }}
        >
          <Ionicons name="ribbon-outline" size={16} color={colors.flameDeep} />
          <TextMed style={{ fontSize: 13.5 }} color={colors.flameDeep}>Manufacturer licence and seller details</TextMed>
        </Tap>
      </View>
    </View>
  );
}
