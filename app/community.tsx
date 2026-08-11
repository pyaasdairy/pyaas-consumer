import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Pill, BackButton } from '../components/ui';

// Honest cooperative framing: no invented individual names or photos, and
// nothing here offers something the app cannot actually deliver. The old "open
// day, limited slots" card promised a booking that exists nowhere in the app
// (Guideline 2.1), and the ghee card asserted an Agmark grade we cannot
// substantiate — both are gone. Copy describes the cooperative dairy structure
// our packs come from; it never claims those dairies as ours.
const FEED = [
  { tag: 'VILLAGE SOCIETIES', icon: 'people-outline', title: 'From the village society to your home', body: 'The dairy we deliver comes from the Uttar Pradesh cooperative structure: milk is poured and tested at village dairy cooperative societies, chilled, and moved to the district union plant for processing and packing.' },
  { tag: 'HOW IT WORKS', icon: 'flask-outline', title: 'What happens at the plant', body: 'At the union plant the pooled milk is tested again, pasteurised, standardised and sealed into the pack you receive. We cannot arrange plant visits today; if that changes we will post it here with a way to book.' },
  { tag: 'PRODUCT UPDATE', icon: 'leaf-outline', title: 'PYAAS Desi Ghee back in stock', body: 'Restocked across the catalogue this week. The grade, FSSAI licence and manufacturer are printed on every pack.' },
  { tag: 'PYAAS UPDATE', icon: 'megaphone-outline', title: 'Growing with UP dairy families', body: 'Thank you for choosing cooperative dairy. The cooperative structure buys its milk from farmer members of village societies across Uttar Pradesh. Sehat ki Dhara.' },
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
        <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 6, ...shadow.card }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people" size={16} color={colors.white} />
          </View>
          <Serif color={colors.white} style={{ fontSize: 24, lineHeight: 28 }}>The PYAAS family</Serif>
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>Updates about the cooperative dairies and village societies your order comes from.</TextBody>
        </View>

        {FEED.map((f) => (
          <View key={f.title} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 6, ...shadow.soft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={f.icon as any} size={18} color={colors.flameDeep} />
              <Pill label={f.tag} bg={colors.cream} color={colors.flameDeep} />
            </View>
            <TextSemi style={{ fontSize: 16 }}>{f.title}</TextSemi>
            <TextBody style={{ fontSize: 13.5, lineHeight: 20 }}>{f.body}</TextBody>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
