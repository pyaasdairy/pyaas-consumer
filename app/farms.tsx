import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Pill, BackButton, Tap } from '../components/ui';
import { listMemberDairies, type MemberDairy } from '../lib/farms';
import { getUserCoords } from '../lib/location';

export default function Farms() {
  const insets = useSafeAreaInsets();
  const [dairies, setDairies] = useState<MemberDairy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const coord = await getUserCoords(); // live GPS -> saved-address coords -> default region
    setDairies(await listMemberDairies({ lat: coord.lat, lng: coord.lng }));
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nearest = dairies[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Member dairies</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 }}>
          <Ionicons name="business" size={18} color={colors.blue} style={{ marginTop: 1 }} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }} color={colors.blue}>
            PARAG is a cooperative federation. Your milk is pooled from village dairy societies, then chilled, tested and packed at the nearest member district milk union below.
          </TextBody>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 24 }} />
        ) : dairies.length === 0 ? (
          <TextBody>No member dairies listed yet.</TextBody>
        ) : (
          <>
            {nearest ? <DairyCard dairy={nearest} highlight /> : null}
            {dairies.length > 1 ? (
              <TextMed color={colors.inkMute} style={{ fontSize: 12, marginTop: spacing.xs, marginLeft: 2, letterSpacing: 0.3 }}>
                OTHER MEMBER UNIONS
              </TextMed>
            ) : null}
            {dairies.slice(1).map((d) => <DairyCard key={d.id} dairy={d} />)}
            <TextBody style={{ fontSize: 11.5, textAlign: 'center', marginTop: spacing.sm }} color={colors.inkMute}>
              Society and capacity figures are representative. Distances are line-of-sight from your location.
            </TextBody>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DairyCard({ dairy, highlight }: { dairy: MemberDairy; highlight?: boolean }) {
  const openMaps = useCallback(() => {
    const q = encodeURIComponent(`${dairy.plant}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${dairy.lat},${dairy.lng}&query_place_id=${q}`).catch(() => {});
  }, [dairy]);

  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: highlight ? 1.5 : 1, borderColor: highlight ? colors.flameDeep : colors.line, overflow: 'hidden', ...shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="business" size={24} color={highlight ? colors.flameDeep : colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TextSemi style={{ fontSize: 15 }}>{dairy.shortName}</TextSemi>
            {highlight ? <Pill label="NEAREST" bg={colors.flameSoft} color={colors.flameDeep} /> : null}
          </View>
          <TextBody style={{ fontSize: 12.5 }}>
            {dairy.district}{dairy.distance_km != null ? ` · ${dairy.distance_km.toFixed(0)} km away` : ''}
          </TextBody>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name="location-outline" size={15} color={colors.inkMute} style={{ marginTop: 2 }} />
          <TextBody style={{ flex: 1, fontSize: 12.5 }}>{dairy.plant}</TextBody>
        </View>
        <TextBody style={{ fontSize: 12.5, marginTop: 8 }}>{dairy.blurb}</TextBody>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: 10 }}>
        <Stat label="Village societies" value={dairy.societies.toLocaleString('en-IN')} />
        <Stat label="Capacity" value={`${dairy.capacityLLPD} LLPD`} />
        <Stat label="Since" value={String(dairy.established)} />
        <Stat label="Union" value={dairy.name} wide />
      </View>

      <View style={{ padding: spacing.md, paddingTop: spacing.md }}>
        <Tap
          onPress={openMaps}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.cream, borderRadius: radius.pill, paddingVertical: 11, borderWidth: 1, borderColor: colors.line }}
        >
          <Ionicons name="navigate" size={16} color={colors.flameDeep} />
          <TextSemi style={{ fontSize: 13.5 }} color={colors.flameDeep}>Open in Maps</TextSemi>
        </Tap>
      </View>
    </View>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={{ width: wide ? '100%' : '46%', backgroundColor: colors.wash, borderRadius: radius.md, padding: 10 }}>
      <TextBody style={{ fontSize: 11 }}>{label}</TextBody>
      <TextMed style={{ fontSize: 13 }} numberOfLines={2}>{value}</TextMed>
    </View>
  );
}
