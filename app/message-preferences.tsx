import React, { useMemo, useState } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, Tap } from '../components/ui';
import { CONSENT_META, defaultChoices, useConsents, type ConsentChoices, type ConsentKey } from '../components/ConsentSheet';

/**
 * Message preferences — the member's standing opt-in/opt-out surface for
 * marketing channels (offer terms §12.3: "you can decline them and still take
 * the offer in full; opt out at any time in the app").
 *
 * This is the screen that makes marketing consent GRANTABLE at all: without a
 * rendered toggle, the consent guard (correctly, fail-closed) suppresses every
 * promotional message forever. Saving goes through recordConsents →
 * consumer_consents on the backend via the durable mirror queue, so the
 * server's TCCCPR evidence trail gets the real toggle time.
 *
 * Service messages (delivery, wallet, account) are NOT listed here — the terms
 * make them part of being a customer, and no toggle may imply otherwise.
 */
export default function MessagePreferences() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { latest, loading, save } = useConsents();
  const optional = useMemo(() => CONSENT_META.filter((m) => !m.required), []);
  const [busyKey, setBusyKey] = useState<ConsentKey | null>(null);

  const current: ConsentChoices = useMemo(
    () => ({ ...defaultChoices(), privacy: true, terms: true, ...(latest ?? {}) }),
    [latest],
  );

  async function toggle(key: ConsentKey) {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await save({ ...current, [key]: !current[key] });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tap onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color={colors.flameDeep} />
        </Tap>
        <Serif style={{ fontSize: 26 }}>Message preferences</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <TextBody color={colors.inkSoft} style={{ fontSize: 13, lineHeight: 18 }}>
          Delivery, wallet and account messages always arrive. They are part of the
          service. Offers and updates are up to you, and saying no never affects
          your milk or any offer you have already started.
        </TextBody>

        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          {optional.map((m, i) => (
            <View
              key={m.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons
                  name={m.key === 'whatsapp' ? 'logo-whatsapp' : m.key === 'sms' ? 'chatbubble-ellipses-outline' : 'megaphone-outline'}
                  size={17}
                  color={colors.flameDeep}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextMed style={{ fontSize: 14.5 }}>{m.label}</TextMed>
                <TextBody color={colors.inkMute} style={{ fontSize: 12 }}>{m.sub}</TextBody>
              </View>
              <Switch
                value={!!current[m.key]}
                disabled={loading || busyKey === m.key}
                onValueChange={() => toggle(m.key)}
                trackColor={{ true: colors.flameDeep, false: colors.line }}
                thumbColor={colors.white}
              />
            </View>
          ))}
        </View>

        <TextBody color={colors.inkMute} style={{ fontSize: 11.5, lineHeight: 16 }}>
          Changes apply immediately and are saved to your account, so they follow
          you across devices and reinstalls.
        </TextBody>
      </ScrollView>
    </View>
  );
}
