import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../../components/ui';
import { getFoundingFamily, homesToGo, type Farm } from '../../lib/foundingFamily';

/**
 * PICK YOUR FARM (spec screen 5). Every farm comes from the backend with its
 * claimed count and "unlocks at" number. An unlocked farm shows what it opened
 * and "Claims closed", with no Claim button and no seat count. A filling farm
 * shows how many homes are left and a Claim button.
 */
export default function PickYourFarm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let on = true;
    getFoundingFamily().then((v) => { if (on) { setFarms(v?.farms ?? null); setLoading(false); } });
    return () => { on = false; };
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }}>Pick your farm</Serif>
        {farms ? <TextMed style={{ fontSize: 12.5 }} color={colors.inkMute}>{farms.length} farms</TextMed> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 30 }} />
        ) : !farms || farms.length === 0 ? (
          <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 4 }}>
            <TextSemi style={{ fontSize: 15 }}>Farms open for claims soon</TextSemi>
            <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.inkSoft}>Pull down to check again later.</TextBody>
          </View>
        ) : (
          farms.map((f, i) => {
            const unlocked = f.status === 'unlocked';
            const togo = homesToGo(f);
            const pct = Math.min(100, Math.round((f.claimed / Math.max(1, f.unlocks_at)) * 100));
            return (
              <Animated.View key={f.id} entering={FadeInDown.duration(360).delay(i * 50)}>
                <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: unlocked ? colors.line : colors.flame, padding: spacing.md, gap: 10, ...shadow.soft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {f.photo_url ? (
                      <Image source={{ uri: f.photo_url }} style={{ width: 52, height: 52, borderRadius: radius.md }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="leaf" size={22} color={colors.flameDeep} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <TextSemi style={{ fontSize: 15.5 }} numberOfLines={1}>{f.name}</TextSemi>
                      <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft} numberOfLines={1}>
                        {[f.farmer, f.note || f.place].filter(Boolean).join(' · ')}
                      </TextBody>
                    </View>
                  </View>

                  {unlocked ? (
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.live} />
                        <TextSemi style={{ fontSize: 13.5 }} color={colors.live}>Unlocked · claims closed</TextSemi>
                      </View>
                      {f.unlocked_packs ? (
                        <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>Unlocked {f.unlocked_packs} for its Founding Family</TextBody>
                      ) : null}
                    </View>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextSemi style={{ fontSize: 13.5, flex: 1 }}>{togo} more {togo === 1 ? 'home' : 'homes'} to unlock</TextSemi>
                        <TextMed style={{ fontSize: 12, ...tabular }} color={colors.inkMute}>{f.claimed} of {f.unlocks_at}</TextMed>
                      </View>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.flameDeep, width: `${pct}%` }} />
                      </View>
                      <Tap onPress={() => router.push({ pathname: '/founding-family/join', params: { farm: f.id } })}>
                        <View style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                          <TextSemi color={colors.white} style={{ fontSize: 15 }}>Claim {f.name}</TextSemi>
                        </View>
                      </Tap>
                    </>
                  )}
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
