import React, { useState } from 'react';
import { View, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from '../../components/ui';
import { ShineSweep } from '../../components/VipFx';
import { enterUp } from '../../lib/motion';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

/**
 * Phone OTP sign-in. Uses Supabase `signInWithOtp` / `verifyOtp` for real
 * numbers (needs an SMS provider in Supabase → Auth → Providers → Phone).
 *
 * The numbers in DEMO_PHONES with code 000000 sign straight into the seeded
 * account, no SMS provider needed. Set that account's password once (see
 * DEMO_PASSWORD) and this works on any build. Clear DEMO_PHONES to disable.
 * The real OTP path is untouched.
 */
const DEMO_PHONES = [
  '8448034551', // Parmanand
  '9315909017', // Lokesh Chadda
  '7860390398', // Amar
  '9625271803', // testing
];
const DEMO_OTP = '000000';
const DEMO_EMAIL = 'tester@pyaasdairy.com';
const DEMO_PASSWORD = 'PyaasDemo!2026';

export default function OtpLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = () => phone.replace(/\D/g, '').slice(-10);
  const e164 = () => '+91' + digits();
  const isDemo = () => DEMO_PHONES.includes(digits());

  async function sendCode() {
    if (!isSupabaseConfigured) { setError('Backend not set up yet.'); return; }
    if (digits().length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError('');
    if (isDemo()) { setStep('code'); return; } // demo number: no SMS needed
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164() });
      if (error) throw error;
      setStep('code');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the code. An SMS provider must be enabled in Supabase.');
    } finally { setLoading(false); }
  }

  async function verify(codeArg?: string) {
    const c = (codeArg ?? code).replace(/\D/g, '');
    if (c.length < 4) { setError('Enter the code we sent.'); return; }
    setLoading(true); setError('');
    try {
      if (isDemo()) {
        if (c !== DEMO_OTP) { setError('That code is not right. Try again.'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        if (error) throw error;
        return; // session set → root navigator enters the app
      }
      const { error } = await supabase.auth.verifyOtp({ phone: e164(), token: c, type: 'sms' });
      if (error) throw error;
    } catch (e: any) {
      setError(e?.message ?? 'Invalid or expired code.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.roseDeep }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.roseDeep }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, overflow: 'hidden' }}>
            <Tap haptic={false} onPress={() => (step === 'code' ? setStep('phone') : router.back())} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={20} color={colors.white} />
            </Tap>
            <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: 12 }}>
              <Image source={require('../../assets/pyaas-logo-white-trim.png')} style={{ width: 220, height: 220 / 3.555 }} resizeMode="contain" />
              <TextMed color="rgba(255,255,255,0.92)" style={{ fontSize: 14 }}>Know your milk.</TextMed>
            </View>
            <ShineSweep dur={3600} travel={420} bandWidth={120} delay={600} />
          </View>

          <Animated.View entering={enterUp()} style={{ flex: 1, backgroundColor: colors.white, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.lg, ...shadow.card }}>
            {step === 'phone' ? (
              <>
                <Serif style={{ fontSize: 30 }}>Log in / Sign up</Serif>
                <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>Enter your mobile to get a one-time code. We will also text your order and milk-pickup updates here.</TextBody>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line, paddingVertical: 12 }}>
                  <TextMed style={{ fontSize: 15.5 }}>+91</TextMed>
                  <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" placeholderTextColor={colors.inkMute} maxLength={10} autoFocus style={{ flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink }} />
                </View>
                {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
                <SolidBtn label="Send code" loading={loading} onPress={sendCode} />
              </>
            ) : (
              <>
                <Serif style={{ fontSize: 30 }}>Enter the code</Serif>
                <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>Sent to +91 {phone}. <TextMed color={colors.roseDeep} onPress={() => setStep('phone')}>Change</TextMed></TextBody>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line, paddingVertical: 12 }}>
                  <Ionicons name="keypad-outline" size={20} color={colors.roseDeep} />
                  <TextInput value={code} onChangeText={(t) => { setCode(t); if (t.replace(/\D/g, '').length === 6 && !loading) verify(t); }} keyboardType="number-pad" placeholder="6-digit code" placeholderTextColor={colors.inkMute} maxLength={6} autoFocus style={{ flex: 1, fontFamily: fonts.sans, fontSize: 18, letterSpacing: 4, color: colors.ink }} />
                </View>
                {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
                <SolidBtn label="Verify & sign in" loading={loading} onPress={verify} />
                <Tap haptic={false} onPress={sendCode} style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <TextMed color={colors.roseDeep} style={{ fontSize: 13.5 }}>Resend code</TextMed>
                </Tap>
              </>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: spacing.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <TextBody style={{ fontSize: 12 }}>or</TextBody>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
              <Tap haptic={false} onPress={() => router.replace('/(auth)/sign-in')}>
                <TextSemi color={colors.roseDeep} style={{ fontSize: 14 }}>Use email</TextSemi>
              </Tap>
              <TextBody style={{ fontSize: 14 }}>·</TextBody>
              <Tap haptic={false} onPress={() => router.replace('/(auth)/sign-up')}>
                <TextSemi color={colors.roseDeep} style={{ fontSize: 14 }}>Create account</TextSemi>
              </Tap>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function SolidBtn({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return (
    <Tap onPress={loading ? undefined : onPress} style={{ marginTop: spacing.lg }}>
      <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.roseDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
        {loading ? <ActivityIndicator color={colors.white} /> : (
          <>
            <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>{label}</TextSemi>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </>
        )}
      </View>
    </Tap>
  );
}
