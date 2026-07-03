import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, BackButton } from '../components/ui';
import { nearestFarm, listFarms, type Farm } from '../lib/farms';
import { getUserCoords } from '../lib/location';

export default function Farms() {
  const insets = useSafeAreaInsets();
  const [nearest, setNearest] = useState<Farm | null>(null);
  const [all, setAll] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const coord = await getUserCoords(); // live GPS → address coords → default
    setNearest(await nearestFarm(coord.lat, coord.lng));
    setAll(await listFarms());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Nearest farm</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="shield-checkmark" size={18} color={colors.sage} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.sage}>Locate your nearest PYAAS-certified farm and meet the farmer behind your milk.</TextBody>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.roseDeep} style={{ marginTop: 24 }} />
        ) : (
          <>
            {nearest ? <FarmCard farm={nearest} highlight /> : <TextBody>No farms listed yet.</TextBody>}
            {all.filter((f) => f.id !== nearest?.id).map((f) => <FarmCard key={f.id} farm={f} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function FarmCard({ farm, highlight }: { farm: Farm; highlight?: boolean }) {
  const farmer = farm.farmers?.[0];
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: highlight ? 1.5 : 1, borderColor: highlight ? colors.sage : colors.line, overflow: 'hidden', ...shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {farmer?.photo_url ? <Image source={{ uri: farmer.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Ionicons name="person" size={26} color={colors.sage} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextSemi style={{ fontSize: 15 }}>{farmer?.name ?? 'PYAAS farmer'}</TextSemi>
            {highlight ? <Pill label="NEAREST" bg={colors.sageSoft} color={colors.sage} /> : null}
          </View>
          <TextBody style={{ fontSize: 12.5 }}>{farm.name}{farm.distance_km != null ? ` · ${farm.distance_km.toFixed(1)} km` : ''}</TextBody>
        </View>
      </View>
      {farmer ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 10 }}>
          <Stat label="Herd size" value={`${farmer.herd_size ?? '-'} cows`} />
          <Stat label="Milk test" value={`SNF ${farmer.snf ?? '-'} · Fat ${farmer.fat ?? '-'}`} />
          <Stat label="Milking" value={farmer.milking_timings ?? '-'} />
          <Stat label="Experience" value={`${farmer.years_experience ?? '-'} yrs`} />
          <Stat label="Cow feed" value={farmer.cow_feed ?? '-'} wide />
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={{ width: wide ? '100%' : '46%', backgroundColor: colors.wash, borderRadius: radius.md, padding: 10 }}>
      <TextBody style={{ fontSize: 11 }}>{label}</TextBody>
      <TextMed style={{ fontSize: 13 }}>{value}</TextMed>
    </View>
  );
}
