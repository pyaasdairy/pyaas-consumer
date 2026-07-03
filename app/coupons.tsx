import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextSemi, Pill, BackButton } from '../components/ui';
import { listCoupons, type Coupon } from '../lib/coupons';

export default function Coupons() {
  const insets = useSafeAreaInsets();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { listCoupons().then((c) => { setCoupons(c); setLoading(false); }); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Coupons & offers</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.roseDeep} style={{ marginTop: 24 }} />
        ) : coupons.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.white,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.line,
              padding: spacing.lg,
              alignItems: 'center',
              gap: 10,
              marginTop: 8,
              ...shadow.soft,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: colors.sageSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="pricetags-outline" size={20} color={colors.roseDeep} />
            </View>
            <TextSemi style={{ fontSize: 15 }} color={colors.ink}>No active offers right now</TextSemi>
            <TextBody style={{ fontSize: 13, textAlign: 'center' }}>New coupons appear here as soon as they go live. Check back soon.</TextBody>
          </View>
        ) : (
          coupons.map((c) => (
            <View
              key={c.code}
              style={{
                backgroundColor: c.is_golden ? colors.roseSoft : colors.white,
                borderRadius: radius.lg,
                borderWidth: c.is_golden ? 1.5 : 1,
                borderColor: c.is_golden ? colors.rose : colors.line,
                padding: spacing.lg,
                gap: 6,
                ...shadow.soft,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {c.is_golden ? <Ionicons name="diamond" size={16} color={colors.roseDeep} /> : <Ionicons name="pricetag" size={16} color={colors.roseDeep} />}
                <TextSemi style={{ fontSize: 16 }} color={c.is_golden ? colors.roseDeep : colors.ink}>{c.title}</TextSemi>
              </View>
              <TextBody style={{ fontSize: 13 }}>{c.description}</TextBody>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.is_golden ? colors.rose : colors.line, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <TextSemi style={{ fontSize: 14, letterSpacing: 1 }} color={c.is_golden ? colors.roseDeep : colors.ink}>{c.code}</TextSemi>
                </View>
                <Pill
                  label={
                    c.kind === 'percent'
                      ? `${c.value}% off`
                      : c.kind === 'bundle_price'
                      ? `Bundle ${rupee(c.value)}`
                      : `${rupee(c.value)} off`
                  }
                  bg={c.is_golden ? colors.rose : colors.sageSoft}
                  color={c.is_golden ? colors.white : colors.sage}
                />
              </View>
              {c.min_items ? <TextBody style={{ fontSize: 11.5 }}>Add {c.min_items}+ items to use this.</TextBody> : null}
            </View>
          ))
        )}
        {!loading && coupons.length > 0 ? (
          <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.inkMute}>Apply any code at checkout.</TextBody>
        ) : null}
      </ScrollView>
    </View>
  );
}
