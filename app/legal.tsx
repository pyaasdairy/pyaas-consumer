import React from 'react';
import { View, ScrollView, Linking } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, Tap, BackButton } from '../components/ui';

export default function Legal() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Legal</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
          <LinkRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => Linking.openURL('https://pyaasdairy.com/privacy')} />
          <LinkRow icon="document-text-outline" label="Terms & Conditions" onPress={() => Linking.openURL('https://pyaasdairy.com/terms')} />
          <LinkRow icon="refresh-outline" label="Refund & Cancellation" onPress={() => Linking.openURL('https://pyaasdairy.com/refunds')} last />
        </View>

        <View style={{ alignItems: 'center', gap: 4, marginTop: spacing.lg }}>
          <TextBody style={{ fontSize: 12.5 }}>PYAAS · Know your milk.</TextBody>
          <TextBody style={{ fontSize: 12 }}>App version {Constants.expoConfig?.version ?? '1.0.0'}</TextBody>
        </View>
      </ScrollView>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: any; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Tap haptic={false} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <Ionicons name={icon} size={20} color={colors.inkSoft} />
      <TextMed style={{ flex: 1, fontSize: 15 }}>{label}</TextMed>
      <Ionicons name="open-outline" size={16} color={colors.inkMute} />
    </Tap>
  );
}
