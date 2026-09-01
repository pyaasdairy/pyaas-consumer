import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../lib/theme';
import { Serif, TextBody, Tap } from '../components/ui';
import { OfferTermsSummary } from '../components/OfferTermsSummary';
import { useDiscLang, setDiscLang } from '../lib/i18n';

/**
 * PUBLIC offer-terms screen — reachable BEFORE registration (campaign A-2 /
 * §6.2: "offer disclosed before registration begins, on the landing screen —
 * not after the customer has invested effort"). Listed in PUBLIC_DOC_ROUTES,
 * so the auth gate never bounces it to sign-in.
 */
export default function OfferTerms() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hi = useDiscLang() === 'hi';
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tap onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color={colors.flameDeep} />
        </Tap>
        <Serif style={{ fontSize: 22, flex: 1 }}>{hi ? 'ऑफ़र की शर्तें' : 'Offer terms'}</Serif>
        <Tap onPress={() => setDiscLang(hi ? 'en' : 'hi')} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.flameSoft }}>
          <TextBody color={colors.flameDeep} style={{ fontSize: 12.5 }}>{hi ? 'English' : 'हिंदी'}</TextBody>
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <TextBody color={colors.inkSoft} style={{ fontSize: 13, lineHeight: 19 }}>
          {hi
            ? 'पहला लीटर हमारी ओर से। रजिस्टर करने से पहले, हर शर्त यहाँ है। कुछ भी बारीक़ अक्षरों में नहीं।'
            : 'Your first litre is on us. Every condition is here, before you register. Nothing in fine print.'}
        </TextBody>
        <OfferTermsSummary hi={hi} />
      </ScrollView>
    </View>
  );
}
