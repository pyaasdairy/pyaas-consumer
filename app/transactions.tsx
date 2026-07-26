import React, { useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Divider, BackButton } from '../components/ui';
import { SkeletonBlock } from '../components/Skeleton';
import { getTransactions, type WalletTxn } from '../lib/walletApi';

export default function Transactions() {
  const insets = useSafeAreaInsets();
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { getTransactions().then((t) => { setTxns(t); setLoading(false); }); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Transactions</Serif>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 16, ...shadow.soft }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <SkeletonBlock style={{ width: '60%', height: 13 }} />
                  <SkeletonBlock style={{ width: '38%', height: 10 }} />
                </View>
                <SkeletonBlock style={{ width: 64, height: 15 }} />
              </View>
            ))}
          </View>
        ) : txns.length === 0 ? (
          <TextBody style={{ marginTop: 16 }}>No transactions yet.</TextBody>
        ) : (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
            {txns.map((t, i) => (
              <Animated.View
                key={t.id}
                layout={LinearTransition.springify().damping(18).stiffness(200)}
                entering={FadeInDown.duration(260)}
                exiting={FadeOutUp.duration(180)}
              >
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <TextMed style={{ fontSize: 14 }} numberOfLines={1}>{t.description ?? t.category}</TextMed>
                    <TextBody style={{ fontSize: 11.5, ...tabular }}>{new Date(t.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TextBody>
                  </View>
                  <TextSemi color={t.direction === 'credit' ? colors.blue : colors.ink} style={{ fontSize: 15, ...tabular }}>
                    {t.direction === 'credit' ? '+' : '−'}{rupee(t.amount)}
                  </TextSemi>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
