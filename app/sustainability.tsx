import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, BackButton } from '../components/ui';

// This page used to show "Plastic saved 12,400 kg", "CO2 avoided 9,200 kg" and a
// farmer-member count that were invented demo numbers. An environmental claim
// with a number on it has to be measured and substantiated (CCPA Greenwashing
// Guidelines 2024; App Store 2.3.1), and none of these were, so the counters are
// gone. What is left describes practices we can actually point at — no figures.
// If the operator ever commissions a real measurement, add the number WITH its
// method and the date it was verified, not before.
const CARDS = [
  { icon: 'people', title: 'Cooperative sourcing', note: 'Milk is bought from farmer members of village dairy cooperative societies, not from one commercial farm.' },
  { icon: 'location', title: 'Sourced in Uttar Pradesh', note: 'Pooled, processed and packed at a district union plant in the state we deliver in.' },
  { icon: 'navigate', title: 'Planned local routes', note: 'Orders ride shared morning delivery routes instead of a separate trip per order.' },
  { icon: 'refresh', title: 'Recyclable packs', note: 'Pouches and bottles are recyclable where local facilities accept them. We do not run a take-back scheme yet.' },
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
          <Serif color={colors.white} style={{ fontSize: 24, lineHeight: 28 }}>Good milk,{'\n'}short trip.</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>How cooperative village-level sourcing and local delivery routes actually work.</TextBody>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.xs }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="leaf" size={16} color={colors.blue} />
          </View>
          <TextSemi style={{ fontSize: 16 }}>What we actually do</TextSemi>
        </View>
        <TextBody style={{ fontSize: 12, marginTop: -6 }}>Practices, not projections. Nothing on this page is a measured environmental figure.</TextBody>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {CARDS.map((c) => (
            <View key={c.title} style={{ width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, ...shadow.soft }}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                <Ionicons name={c.icon as any} size={18} color={colors.blue} />
              </View>
              <TextMed style={{ fontSize: 13.5 }}>{c.title}</TextMed>
              <TextBody style={{ fontSize: 11 }}>{c.note}</TextBody>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: colors.cream, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md }}>
          <TextBody style={{ fontSize: 12, lineHeight: 18 }}>
            We do not publish plastic-saved or CO2-avoided totals. We have not had our footprint measured, and a number we cannot back up is worth nothing to you. If that measurement is ever done, the figure and how it was arrived at will appear here together.
          </TextBody>
        </View>
      </ScrollView>
    </View>
  );
}
