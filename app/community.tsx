import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Pill, BackButton } from '../components/ui';

// Honest cooperative framing: no invented individual names or photos. Stories are
// about the member dairy unions and village societies that make up the federation.
const FEED = [
  { tag: 'MEMBER SOCIETIES', icon: 'people-outline', title: 'From the village society to your home', body: 'PYAAS milk is pooled from village dairy cooperative societies across Uttar Pradesh. Each morning milk is tested at the society, chilled, and moves to the district dairy union plant within hours.' },
  { tag: 'DAIRY VISIT', icon: 'walk-outline', title: 'Dairy plant open day', body: 'See how your milk is tested and pasteurised, from the society can to the sealed PYAAS pack, at a member dairy union plant. Limited slots each month.' },
  { tag: 'PRODUCT UPDATE', icon: 'leaf-outline', title: 'PYAAS Desi Ghee back in stock', body: 'Agmark grade ghee produced at our cooperative dairies. Restocked across the catalogue this week.' },
  { tag: 'PYAAS UPDATE', icon: 'megaphone-outline', title: 'Growing with UP dairy families', body: 'Thank you for choosing cooperative milk. Every PYAAS pack supports farmer member families across Uttar Pradesh. Sehat ki Dhara.' },
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
          <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 13 }}>Stories, visits and updates from our member dairy unions and village societies to your home.</TextBody>
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
