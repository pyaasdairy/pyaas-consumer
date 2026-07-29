import React, { useEffect, useRef, useState } from 'react';
import { View, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from '../../components/ui';
import { ShineSweep } from '../../components/Fx';
import { enterUp } from '../../lib/motion';
import { signInWithPhone, DEMO_OTP } from '../../lib/session';
import { api, isBackendConfigured, setTokens } from '../../lib/apiClient';
import { requestPhoneHint, startSmsRetriever, ensurePhoneNumberPermission } from '../../lib/nativeConvenience';

/**
 * Phone OTP sign-in. In this build the code is verified on-device (demo /
 * offline mode): any 10-digit number plus the demo code signs in and gets a
 * stable per-phone account. When parag-api is deployed, swap sendCode/verify for
 * apiClient POST /auth/otp/request + /auth/otp/verify (which return JWT tokens);
 * the rest of the screen stays the same.
 */
const BADGE = 132;

export default function OtpLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Test OTP echoed by the backend in dev (OTP_DEV_MODE) so we can sign in
  // without SMS. Shown below the code input; the real SMS API lands later.
  const [devOtp, setDevOtp] = useState('');
  // In-flight guard so a burst of focus events doesn't launch the hint twice.
  const hintBusy = useRef(false);

  // The keyboard hides the input + button on a tall header; collapse the logo
  // while the keyboard is open so the field and CTA stay above it.
  const [kbUp, setKbUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const digits = () => phone.replace(/\D/g, '').slice(-10);

  /**
   * Trigger Android's Play-Services phone-number hint (one-tap SIM number) when
   * the user TAPS the phone field — NOT on app launch (the field no longer
   * autofocuses). Fires whenever the field is still empty; no-ops gracefully when
   * the native module is absent (the field's autoComplete="tel" then offers OS
   * autofill). The in-flight guard prevents a double-launch from rapid focus.
   */
  async function onPhoneFocus() {
    if (hintBusy.current || digits().length >= 10) return;
    hintBusy.current = true;
    try {
      await ensurePhoneNumberPermission(); // system permission prompt (first time only)
      const hinted = await requestPhoneHint();
      if (hinted && digits().length < 10) setPhone(hinted);
    } finally {
      hintBusy.current = false;
    }
  }

  /**
   * SMS Retriever: while on the code step, auto-read the incoming OTP SMS and
   * verify. No-ops when the native module is absent — the code input's
   * autoComplete="sms-otp" still surfaces the code via the keyboard.
   */
  useEffect(() => {
    if (step !== 'code') return;
    const stop = startSmsRetriever((c) => {
      setCode(c);
      if (c.length >= 6 && !loading) verify(c);
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function sendCode() {
    if (digits().length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError(''); setLoading(true);
    try {
      if (isBackendConfigured()) {
        const r = await api.post<{ sent: boolean; dev_otp?: string }>('/auth/otp/request', { phone: digits() });
        setDevOtp(r.dev_otp ?? '');
      }
      setStep('code');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the code. Please try again.');
    } finally { setLoading(false); }
  }

  async function verify(codeArg?: string) {
    const c = (codeArg ?? code).replace(/\D/g, '');
    if (c.length < 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      if (isBackendConfigured()) {
        // Real backend: verify → JWT tokens; also set the local session uid the
        // FE data layer reads (requireUserId) so both stay in sync.
        const pair = await api.post<{ access_token: string; refresh_token: string; profile: { id: string } }>(
          '/auth/otp/verify', { phone: digits(), code: c });
        await setTokens(pair.access_token, pair.refresh_token);
        await signInWithPhone(digits());
      } else {
        if (c !== DEMO_OTP) { setError('That code is not right. Try again.'); return; }
        await signInWithPhone(digits()); // offline demo
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign you in. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.flameDeep }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, overflow: 'hidden' }}>
            <Tap haptic={false} onPress={() => (step === 'code' ? setStep('phone') : router.back())} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={20} color={colors.white} />
            </Tap>
            {kbUp ? (
              // Keyboard open: collapse the logo so the input + button clear it.
              <View style={{ height: spacing.sm }} />
            ) : (
              <>
                <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: 12 }}>
                  <Image source={require('../../assets/parag-logo.png')} style={{ width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: colors.white }} resizeMode="contain" />
                  <TextMed color="rgba(255,255,255,0.92)" style={{ fontSize: 14 }}>Pure, natural, good health.</TextMed>
                </View>
                <ShineSweep dur={3600} travel={420} bandWidth={120} delay={600} />
              </>
            )}
          </View>

          <Animated.View entering={enterUp()} style={{ flex: kbUp ? undefined : 1, backgroundColor: colors.white, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: spacing.lg, paddingTop: kbUp ? spacing.lg : spacing.xl, paddingBottom: insets.bottom + spacing.lg, ...shadow.card }}>
            {step === 'phone' ? (
              <>
                <Serif style={{ fontSize: 30 }}>Log in / Sign up</Serif>
                <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>Enter your mobile to get a one-time code. We will also text your order and delivery updates here.</TextBody>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line, paddingVertical: 12 }}>
                  <TextMed style={{ fontSize: 15.5 }}>+91</TextMed>
                  <TextInput value={phone} onChangeText={setPhone} onFocus={onPhoneFocus} keyboardType="phone-pad" placeholder="10-digit mobile" placeholderTextColor={colors.inkMute} maxLength={10} returnKeyType="done" onSubmitEditing={sendCode} autoComplete="tel" textContentType="telephoneNumber" importantForAutofill="yes" style={{ flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink }} />
                </View>
                {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
                <SolidBtn label="Send code" loading={loading} onPress={sendCode} />
              </>
            ) : (
              <>
                <Serif style={{ fontSize: 30 }}>Enter the code</Serif>
                <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>Sent to +91 {digits()}. <TextMed color={colors.flameDeep} onPress={() => setStep('phone')}>Change</TextMed></TextBody>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line, paddingVertical: 12 }}>
                  <Ionicons name="keypad-outline" size={20} color={colors.flameDeep} />
                  <TextInput value={code} onChangeText={(t) => { setCode(t); if (t.replace(/\D/g, '').length === 6 && !loading) verify(t); }} keyboardType="number-pad" placeholder="6-digit code" placeholderTextColor={colors.inkMute} maxLength={6} autoFocus returnKeyType="done" onSubmitEditing={() => verify()} autoComplete="sms-otp" textContentType="oneTimeCode" importantForAutofill="yes" style={{ flex: 1, fontFamily: fonts.sans, fontSize: 18, letterSpacing: 4, color: colors.ink }} />
                </View>
                {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
                {devOtp ? (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.flameSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="flask-outline" size={16} color={colors.flameDeep} />
                    <TextBody style={{ fontSize: 13, flex: 1 }}>Test OTP: <TextSemi color={colors.flameDeep} style={{ fontSize: 15, letterSpacing: 2 }}>{devOtp}</TextSemi>  ·  shown for testing (SMS later)</TextBody>
                  </View>
                ) : (
                  <TextBody style={{ fontSize: 12.5, marginTop: 10 }}>Demo build: enter {DEMO_OTP} to continue.</TextBody>
                )}
                <SolidBtn label="Verify & sign in" loading={loading} onPress={verify} />
                <Tap haptic={false} onPress={() => setStep('phone')} style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <TextMed color={colors.flameDeep} style={{ fontSize: 13.5 }}>Change number</TextMed>
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
                <TextSemi color={colors.flameDeep} style={{ fontSize: 14 }}>Use email</TextSemi>
              </Tap>
              <TextBody style={{ fontSize: 14 }}>·</TextBody>
              <Tap haptic={false} onPress={() => router.replace('/(auth)/sign-up')}>
                <TextSemi color={colors.flameDeep} style={{ fontSize: 14 }}>Create account</TextSemi>
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
      <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
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
