import React, { useMemo, useState } from 'react';
import { View, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { TextBody, TextSemi, Tap } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { PRODUCTS } from '../constants/products';

export default function Search() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const data = useMemo(
    () => (q ? PRODUCTS.filter((p) => [p.name, p.variant, p.tag].some((t) => t.toLowerCase().includes(q))) : PRODUCTS),
    [q]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Tap onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Tap>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 46, ...shadow.soft }}>
          <Ionicons name="search" size={18} color={colors.inkMute} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search milk, ghee, paneer…"
            placeholderTextColor={colors.inkMute}
            style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }}
            returnKeyType="search"
          />
          {query ? (
            <Tap haptic={false} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.inkMute} />
            </Tap>
          ) : null}
        </View>
      </View>

      <Animated.View entering={FadeIn.duration(260)} style={{ flex: 1 }}>
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: insets.bottom + 40, gap: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: spacing.xl, gap: 8 }}>
              <Ionicons name="search-outline" size={30} color={colors.inkMute} />
              <TextBody>No products match “{query}”.</TextBody>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={{ flex: 1, maxWidth: '50%' }}>
              <ProductCard product={item} index={index} />
            </View>
          )}
        />
      </Animated.View>
    </View>
  );
}
