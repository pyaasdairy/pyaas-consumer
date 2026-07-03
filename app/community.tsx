import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Pill, BackButton } from '../components/ui';

const FEED = [
  { tag: 'FARMER STORY', icon: 'person-circle-outline', title: 'Meet Ramesh, our founding Saathi', body: 'Eighteen years, 24 desi cows, and milk that scores 96% fresh. Ramesh’s herd anchors our Mohanlalganj centre.' },
  { tag: 'FARM VISIT', icon: 'walk-outline', title: 'Open farm day · this month', body: 'Bring the family to see traceable dairy first-hand. Limited slots for founding families.' },
  { tag: 'PRODUCT LAUNCH', icon: 'leaf-outline', title: 'A2 Bilona Ghee is back', body: 'Hand-churned in small batches. Founding families get early access at member pricing.' },
  { tag: 'PYAAS UPDATE', icon: 'megaphone-outline', title: 'Growing with our founding families', body: 'Thank you for trusting traceable milk. Every week brings more homes onto the PYAAS journey.' },
];

export default function Community() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Community</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: colors.roseDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 6, ...shadow.card }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people" size={16} color={colors.white} />
          </View>
          <Serif color={colors.white} style={{ fontSize: 24, lineHeight: 28 }}>The PYAAS family</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>Stories, visits and updates from our farms to your home.</TextBody>
        </View>

        {FEED.map((f) => (
          <View key={f.title} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 6, ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={f.icon as any} size={18} color={colors.roseDeep} />
              <Pill label={f.tag} bg={colors.cream} color={colors.roseDeep} />
            </View>
            <TextSemi style={{ fontSize: 16 }}>{f.title}</TextSemi>
            <TextBody style={{ fontSize: 13.5, lineHeight: 20 }}>{f.body}</TextBody>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
