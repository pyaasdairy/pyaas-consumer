import React, { useState, useEffect } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { useRouter } from 'expo-router';
import { Serif, TextBody, TextMed, TextSemi, Field, Tap } from '../components/ui';
import { enterUp } from '../lib/motion';
import { useAuth } from '../lib/auth';
import { updateProfile } from '../lib/profileApi';
import { recordConsents, defaultChoices } from '../components/ConsentSheet';

/**
 * One-time profile completion gate. New sign-ups (especially phone-OTP, which
 * carries no name) land here before the app so they are never greeted "Hi
 * there". The root navigator routes here whenever profiles.full_name is empty
 * and away once it's set. There is intentionally no back button · the only way
 * forward is to tell us your name.
 */
export default function CompleteProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Collapse the tall header while the keyboard is open so the name field + the
  // "Start with PYAAS" button stay above the keyboard (the field auto-focuses).
  const [kbUp, setKbUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  async function save() {
    if (!name.trim()) { setError('Please tell us your name.'); return; }
    setSaving(true); setError('');
    try {
      await updateProfile({
        full_name: name.trim(),
        phone: phone.trim() || null,
      });
      // Required consents only. sms is optional in ConsentSheet and no checkbox
      // is ever shown for it, so recording it as granted invented a marketing
      // consent the member never gave — and contradicted our own privacy policy.
      await recordConsents({ ...defaultChoices(), privacy: true, terms: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshProfile(); // navigator sees full_name and enters the app
    } catch (e: any) {
      setError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.flameDeep }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {kbUp ? (
            <View style={{ height: insets.top + spacing.md }} />
          ) : (
            <View style={{ alignItems: 'center', paddingTop: insets.top + spacing.xxl, paddingBottom: spacing.xxl, gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="happy-outline" size={32} color={colors.white} />
              </View>
              <Serif color={colors.white} style={{ fontSize: 28 }}>Almost there</Serif>
              <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 14 }}>Let’s set up your PYAAS profile.</TextBody>
            </View>
          )}

          <Animated.View
            entering={enterUp()}
            style={{ flex: kbUp ? undefined : 1, backgroundColor: colors.white, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: spacing.lg, paddingTop: kbUp ? spacing.lg : spacing.xl, paddingBottom: insets.bottom + spacing.lg, ...shadow.card }}
          >
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoFocus autoComplete="name" textContentType="name" />
            <Field label="Mobile number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" autoComplete="tel" textContentType="telephoneNumber" />

            {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 10 }}>{error}</TextBody> : null}

            <Tap onPress={saving ? undefined : save} style={{ marginTop: spacing.xl }}>
              <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                {saving ? <ActivityIndicator color={colors.white} /> : (
                  <>
                    <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Start with PYAAS</TextSemi>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </>
                )}
              </View>
            </Tap>
            <TextBody style={{ fontSize: 11.5, textAlign: 'center', marginTop: 14 }} color={colors.inkMute}>
              By continuing you agree to our{' '}
              <TextMed color={colors.flameDeep} onPress={() => router.push('/terms')}>Terms</TextMed>
              {' '}and{' '}
              <TextMed color={colors.flameDeep} onPress={() => router.push('/privacy-policy')}>Privacy Policy</TextMed>.
            </TextBody>
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
