import React, { useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, BackButton } from '../components/ui';
import { getAppStats, type AppStats } from '../lib/milk';

export default function Sustainability() {
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<AppStats>({});
  useFocusEffect(useCallback(() => { getAppStats().then(setS); }, []));

  const stat = (k: string) => s[k]?.value ?? 0;

  const cards = [
    { icon: 'leaf', label: 'Plastic saved', value: `${stat('plastic_saved_kg')} kg`, note: 'Reusable glass & returnable packaging' },
    { icon: 'people', label: 'Farmers supported', value: `${stat('farmers_supported')}`, note: 'Local dairy families earning fairly' },
    { icon: 'location', label: 'Local sourcing', value: `${stat('local_sourcing_pct')}%`, note: 'Milk sourced within the region' },
    { icon: 'cloud', label: 'CO₂ avoided', value: `${stat('carbon_saved_kg')} kg`, note: 'Short farm-to-door supply chain' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Sustainability</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.roseDeep, padding: spacing.lg, gap: 6, ...shadow.card }}>
          <Serif color={colors.white} style={{ fontSize: 24, lineHeight: 28 }}>Good milk,{'\n'}lighter footprint.</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>How returnable packaging and short, local supply chains add up.</TextBody>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.xs }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.sageSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="leaf" size={16} color={colors.sage} />
          </View>
          <TextSemi style={{ fontSize: 16 }}>Estimated impact</TextSemi>
        </View>
        <TextBody style={{ fontSize: 12, marginTop: -6 }}>Illustrative figures, based on our packaging and sourcing model · not independently audited.</TextBody>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {cards.map((c) => (
            <View key={c.label} style={{ width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, ...shadow.soft }}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.sageSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                <Ionicons name={c.icon as any} size={18} color={colors.sage} />
              </View>
              <Serif style={{ fontSize: 22 }}>{c.value}</Serif>
              <TextMed style={{ fontSize: 13 }}>{c.label}</TextMed>
              <TextBody style={{ fontSize: 11 }}>{c.note}</TextBody>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
