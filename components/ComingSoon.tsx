import React, { useState } from 'react';
import { View, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { ProductCard } from './ProductCard';
import { useServiceability, joinWaitlist } from '../lib/serviceability';
import { useUserLocation } from '../lib/userLocation';
import { useAuth } from '../lib/auth';
import { useCatalog, groupProducts } from '../lib/catalog';

const LOGO = require('../assets/pyaas-logo.png');

/**
 * Out-of-zone STOREFRONT. Shown when serviceability resolves to
 * `serviceable === false` — the member is outside our launch area, so they can
 * BROWSE the full range but not order (the cards carry an "AT LAUNCH" marker,
 * the product page swaps its buy CTA for a waitlist one, and placeOrder refuses
 * regardless). A friendly banner explains where we deliver today and captures
 * the member for launch, with a "change location" path for anyone whose point
 * just resolved wrong.
 *
 * Reused both as a full route (app/coming-soon.tsx) and inline by the Home tab
 * when the serviceability gate trips, so the two never drift.
 */
export function ComingSoon() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const lat = useServiceability((s) => s.lat);
  const lng = useServiceability((s) => s.lng);
  const pincode = useServiceability((s) => s.pincode);
  const reason = useServiceability((s) => s.reason);
  const city = useUserLocation((s) => s.loc?.city ?? null);
  const openPicker = useUserLocation((s) => s.setPickerOpen);

  const products = useCatalog();
  const groups = groupProducts(products);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const phone = profile?.phone ?? null;

  async function onNotify() {
    if (busy || done) return;
    setBusy(true);
    setErr(null);
    try {
      await joinWaitlist({ phone, lat, lng, pincode });
      setDone(true);
    } catch {
      // Soft, friendly — never dump a raw network error on this screen.
      setErr('Could not reach us just now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  const Header = (
    <View style={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.sm }}>
      {/* Brand row */}
      <View style={{ alignItems: 'center', paddingBottom: spacing.lg, paddingTop: spacing.xs }}>
        <Image source={LOGO} style={{ width: 208, height: 62 }} contentFit="contain" />
      </View>

      {/* The banner — warm, on-brand, and honest about where we deliver today. */}
      <Animated.View
        entering={FadeInDown.duration(420)}
        style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, marginHorizontal: spacing.lg, ...shadow.card }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="location" size={24} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <TextSemi color="rgba(255,255,255,0.72)" style={{ fontSize: 11.5, letterSpacing: 1 }}>NOT IN YOUR AREA YET</TextSemi>
            <Serif color={colors.white} style={{ fontSize: 22, lineHeight: 26 }}>We're on our way to you</Serif>
          </View>
        </View>
        <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13.5, lineHeight: 20 }}>
          {reason ??
            "PYAAS is delivering in Sushant Golf City, Lucknow to begin with. You're just outside our lane for now, but we're expanding fast."}
        </TextBody>

        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 13 }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.white} />
            <View style={{ flex: 1 }}>
              <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>You're on the list</TextSemi>
              <TextBody color="rgba(255,255,255,0.82)" style={{ fontSize: 12, lineHeight: 16 }}>
                We'll text you{phone ? ` on ${phone}` : ''} the moment we launch near you.
              </TextBody>
            </View>
          </View>
        ) : (
          <Tap
            weight="medium"
            onPress={onNotify}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            style={{ height: 50, borderRadius: radius.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: busy ? 0.7 : 1 }}
          >
            <Ionicons name="notifications" size={17} color={colors.flameDeep} />
            <TextSemi color={colors.flameDeep} style={{ fontSize: 15.5 }}>
              {busy ? 'Adding you…' : 'Notify me when you launch here'}
            </TextSemi>
          </Tap>
        )}
        {err ? (
          <TextBody style={{ fontSize: 12, textAlign: 'center' }} color="rgba(255,255,255,0.92)">{err}</TextBody>
        ) : null}

        {/* Wrong place? Change the delivery location (search / GPS / city). */}
        <Tap haptic={false} onPress={() => openPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 2 }}>
          <Ionicons name="navigate-outline" size={15} color="rgba(255,255,255,0.9)" />
          <TextSemi color="rgba(255,255,255,0.92)" style={{ fontSize: 13.5 }}>{city ? `Actually in ${city}? Change location` : 'Change your location'}</TextSemi>
        </Tap>
      </Animated.View>

      {/* Showcase heading */}
      <Animated.View entering={FadeInDown.duration(440).delay(120)} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 4, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="storefront-outline" size={18} color={colors.ink} />
          <Serif style={{ fontSize: 20 }}>What's coming to your door</Serif>
        </View>
        <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>
          Have a look around. You can order the day we launch in your area.
        </TextBody>
      </Animated.View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.base.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={Header}
        renderItem={({ item, index }) => (
          <View style={{ flex: 1, maxWidth: '50%' }}>
            <ProductCard product={item.base} variants={item.variants} index={index} browseOnly />
          </View>
        )}
        ListFooterComponent={
          <View style={{ alignItems: 'center', paddingTop: spacing.xl, gap: 7 }}>
            <Image source={LOGO} style={{ width: 62, height: 17, opacity: 0.35 }} contentFit="contain" />
            <TextBody color={colors.inkMute} style={{ fontSize: 10.5, letterSpacing: 0.4 }}>Fresh milk, the day we reach you</TextBody>
          </View>
        }
      />
    </View>
  );
}

export default ComingSoon;
