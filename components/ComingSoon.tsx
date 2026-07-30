import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { useServiceability, joinWaitlist } from '../lib/serviceability';
import { useAuth } from '../lib/auth';

const LOGO = require('../assets/pyaas-logo.png');

/**
 * Out-of-zone gate. Shown when serviceability resolves to `serviceable === false`
 * — a friendly, on-brand "we're not there yet" screen (never a technical error),
 * with a one-tap "Notify me when you launch here" waitlist CTA that posts the
 * member's point to `POST /consumer/waitlist`.
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: 'center', gap: spacing.md }}>
          <Image source={LOGO} style={{ width: 132, height: 40 }} contentFit="contain" />

          {/* Pink medallion */}
          <View style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
            <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location" size={38} color={colors.white} />
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(440).delay(80)} style={{ alignItems: 'center', gap: 10 }}>
          <Serif style={{ fontSize: 27, textAlign: 'center', lineHeight: 32 }} color={colors.ink}>
            Coming Soon to{'\n'}Your Area! 🐄
          </Serif>
          <TextBody style={{ fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 320 }} color={colors.inkSoft}>
            We're not delivering fresh PYAAS milk to your doorstep just yet, but
            we're expanding fast. Leave your number and you'll be the first to know
            the moment we launch near you.
          </TextBody>
        </Animated.View>

        {/* CTA / success */}
        <Animated.View entering={FadeInDown.duration(460).delay(160)} style={{ width: '100%', maxWidth: 380, gap: 12 }}>
          {done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameSoft, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <TextSemi style={{ fontSize: 15 }} color={colors.ink}>You're on the list! 🎉</TextSemi>
                <TextBody style={{ fontSize: 12.5, lineHeight: 17 }} color={colors.inkSoft}>
                  We'll text you{phone ? ` on ${phone}` : ''} the moment PYAAS arrives in your area.
                </TextBody>
              </View>
            </View>
          ) : (
            <>
              <Tap
                weight="medium"
                onPress={onNotify}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: busy ? 0.6 : 1, ...shadow.soft }}
              >
                <Ionicons name="notifications" size={18} color={colors.onAction} />
                <TextSemi color={colors.onAction} style={{ fontSize: 16 }}>
                  {busy ? 'Adding you…' : 'Notify me when you launch here'}
                </TextSemi>
              </Tap>
              {err ? (
                <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.danger}>{err}</TextBody>
              ) : (
                <TextBody style={{ fontSize: 11.5, textAlign: 'center' }} color={colors.inkMute}>
                  No spam — just one message when we go live near you.
                </TextBody>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default ComingSoon;
