import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, BackButton } from '../components/ui';

// Illustrative figures for the cooperative sourcing + packaging model. These are
// static demo values (not independently audited) so the page reads honestly and
// works fully offline. When the backend is live, load these from an impact stats
// endpoint instead. TODO(api): GET /impact/stats.
const CARDS = [
  { icon: 'leaf', label: 'Plastic saved', value: '12,400 kg', note: 'Returnable and recyclable packaging across the catalogue' },
  { icon: 'people', label: 'Farmer members', value: '8,600+', note: 'Cooperative member families earning fairly for their milk' },
  { icon: 'location', label: 'Local sourcing', value: '100%', note: 'Milk pooled from village dairy societies across Uttar Pradesh' },
  { icon: 'cloud', label: 'CO2 avoided', value: '9,200 kg', note: 'Short society-to-union-to-doorstep supply chain' },
];

export default function Sustainability() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Sustainability</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.flameDeep, padding: spacing.lg, gap: 6, ...shadow.card }}>
          <Serif color={colors.white} style={{ fontSize: 24, lineHeight: 28 }}>Good milk,{'\n'}lighter footprint.</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>How cooperative village-level sourcing and short, local supply chains add up.</TextBody>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.xs }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="leaf" size={16} color={colors.blue} />
          </View>
          <TextSemi style={{ fontSize: 16 }}>Estimated impact</TextSemi>
        </View>
        <TextBody style={{ fontSize: 12, marginTop: -6 }}>Illustrative figures based on our packaging and sourcing model, not independently audited.</TextBody>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {CARDS.map((c) => (
            <View key={c.label} style={{ width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, ...shadow.soft }}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                <Ionicons name={c.icon as any} size={18} color={colors.blue} />
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
