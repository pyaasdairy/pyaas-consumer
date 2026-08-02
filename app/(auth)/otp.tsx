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
import { signInWithPhone, saveProfile, DEMO_OTP } from '../../lib/session';
import { api, isBackendConfigured, setTokens } from '../../lib/apiClient';
import { requestPhoneHint, startSmsRetriever } from '../../lib/nativeConvenience';
import { WALLET_TEST_TOPUP } from '../../lib/razorpay';

/**
 * Phone OTP sign-in. In this build the code is verified on-device (demo /
 * offline mode): any 10-digit number plus the demo code signs in and gets a
 * stable per-phone account. When parag-api is deployed, swap sendCode/verify for
 * apiClient POST /auth/otp/request + /auth/otp/verify (which return JWT tokens);
 * the rest of the screen stays the same.
 */
// Large white PYAAS wordmark shown on the pink header (no circle badge). The
// asset is 1127×317, so height is derived from the width to keep it crisp.
const LOGO_W = 244;
const LOGO_RATIO = 317 / 1127;

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
  // Seconds until "Resend code" re-enables (0 = ready).
  const [resendIn, setResendIn] = useState(0);
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
      // Google's phone-number Hint Picker (Identity Services, getPhoneNumberHintIntent)
      // shows a "Choose a number" sheet with NO runtime permission — so we NEVER ask
      // for READ_PHONE_NUMBERS ("make and manage phone calls"), which scared users off.
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

  // Cold-start / flaky-network fetches throw low-level messages ("fetch failed:
  // Fetch request has been canceled"). Show friendly copy for those; pass real
  // server messages (e.g. "Too many attempts") straight through.
  function friendly(e: any, fallback: string) {
    const m = String(e?.message ?? '');
    if (/fetch|network|timeout|timed out|cancell?ed|aborted|connection|ECONN|failed to fetch/i.test(m)) {
      return 'Network looks slow. Please check your connection and try again.';
    }
    return m || fallback;
  }

  async function sendCode() {
    if (digits().length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError(''); setLoading(true);
    try {
      if (isBackendConfigured()) {
        const r = await api.post<{ sent: boolean; dev_otp?: string }>('/auth/otp/request', { phone: digits() });
        setDevOtp(r.dev_otp ?? '');
      }
      setStep('code');
      setResendIn(30); // start the resend cooldown
    } catch (e: any) {
      setError(friendly(e, 'Could not send the code. Please try again.'));
    } finally { setLoading(false); }
  }

  // Resend the OTP without leaving the code step or clearing typed digits beyond a
  // reset. Gated by a 30s cooldown (set in sendCode) to avoid SMS spam.
  function resend() {
    if (resendIn > 0 || loading) return;
    setCode(''); setError('');
    void sendCode();
  }

  // Tick the resend cooldown down to 0.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function verify(codeArg?: string) {
    const c = (codeArg ?? code).replace(/\D/g, '');
    if (c.length < 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      if (isBackendConfigured()) {
        // Real backend: verify → JWT tokens; also set the local session uid the
        // FE data layer reads (requireUserId) so both stay in sync.
        const pair = await api.post<{ access_token: string; refresh_token: string; profile?: { id: string; full_name?: string | null } }>(
          '/auth/otp/verify', { phone: digits(), code: c });
        await setTokens(pair.access_token, pair.refresh_token);
        await signInWithPhone(digits());
        // RETURNING user: hydrate their saved name so the router's complete-profile
        // gate (needs full_name) passes and they land straight in the app instead of
        // being forced back through profile setup on every reinstall / new device.
        const nm = pair.profile?.full_name;
        if (nm && nm.trim()) await saveProfile({ full_name: nm });
      } else {
        if (c !== DEMO_OTP) { setError('That code is not right. Try again.'); return; }
        await signInWithPhone(digits()); // offline demo
      }
    } catch (e: any) {
      setError(friendly(e, 'Could not sign you in. Please try again.'));
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.flameDeep }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, overflow: 'hidden' }}>
            {step === 'code' || router.canGoBack() ? (
              <Tap haptic={false} onPress={() => (step === 'code' ? setStep('phone') : router.back())} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chevron-back" size={20} color={colors.white} />
              </Tap>
            ) : (
              // Signed-out entry point — nowhere to go back to; keep header spacing.
              <View style={{ width: 38, height: 38 }} />
            )}
            {kbUp ? (
              // Keyboard open: collapse the logo so the input + button clear it.
              <View style={{ height: spacing.sm }} />
            ) : (
              <>
                <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: 14 }}>
                  <Image source={require('../../assets/pyaas-logo-white-trim.png')} style={{ width: LOGO_W, height: LOGO_W * LOGO_RATIO }} resizeMode="contain" />
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
                <OtpBoxes value={code} error={!!error} onChange={setCode} onComplete={(c) => { if (!loading) verify(c); }} />
                {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
                {/* The "enter 123456" hint is LOCAL-mode only (no backend) — a real
                    backend build (live OR pilot) must NEVER tell users to type 123456.
                    The pilot flask box shows the backend-echoed test OTP only when this
                    is a WALLET_TEST_TOPUP build; a live build shows neither. */}
                {!isBackendConfigured() ? (
                  <TextBody style={{ fontSize: 12.5, marginTop: 10 }}>Demo build: enter {DEMO_OTP} to continue.</TextBody>
                ) : devOtp && WALLET_TEST_TOPUP ? (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.flameSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="flask-outline" size={16} color={colors.flameDeep} />
                    <TextBody style={{ fontSize: 13, flex: 1 }}>Test OTP: <TextSemi color={colors.flameDeep} style={{ fontSize: 15, letterSpacing: 2 }}>{devOtp}</TextSemi>  ·  shown for testing (SMS later)</TextBody>
                  </View>
                ) : null}
                <SolidBtn label="Verify & sign in" loading={loading} onPress={() => verify()} />
                {isBackendConfigured() ? (
                  <Tap haptic={false} onPress={resend} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <TextMed color={resendIn > 0 ? colors.inkMute : colors.flameDeep} style={{ fontSize: 13.5 }}>
                      {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't get the code? Resend"}
                    </TextMed>
                  </Tap>
                ) : null}
                <Tap haptic={false} onPress={() => setStep('phone')} style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <TextMed color={colors.flameDeep} style={{ fontSize: 13.5 }}>Change number</TextMed>
                </Tap>
              </>
            )}
            {/* Phone OTP is the only sign-in path (email / create-account removed). */}
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Six individual OTP digit boxes. Typing advances to the next box; backspace on
 * an empty box steps back and clears the previous one; pasting or OS SMS-autofill
 * that delivers the whole code at once (arriving as a multi-char change on the
 * focused box) fans out across all six; entering the sixth digit auto-submits.
 * `code` stays a plain left-packed 6-char string so the parent's verify() and the
 * SMS Retriever path keep working unchanged.
 */
function OtpBoxes({ value, error, onChange, onComplete }: { value: string; error?: boolean; onChange: (v: string) => void; onComplete: (v: string) => void }) {
  const inputs = useRef<Array<TextInput | null>>([]);
  // Mirror the code in a ref so a BURST of rapid onChangeText events (fast typing,
  // paste-as-keystrokes, or SMS autofill delivered char-by-char) each read the
  // LATEST value. Reading the `value` prop directly dropped digits: box-1's
  // handler fires before box-0's onChange→setCode has flushed, so it rebuilt the
  // code from a stale (empty) prop and the first digit was lost.
  const valRef = useRef(value);
  valRef.current = value;
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const focusIndex = (i: number) => inputs.current[Math.max(0, Math.min(5, i))]?.focus();

  function commit(next: string) {
    const m = next.replace(/\D/g, '').slice(0, 6);
    valRef.current = m; // synchronous — the next keystroke in this burst reads it
    onChange(m);
    return m;
  }

  function setAt(index: number, text: string) {
    const clean = text.replace(/\D/g, '');
    const cur = valRef.current;
    if (clean.length > 1) {
      // Over-typing a filled box appends a char; if the lead char is the digit
      // already shown, the user typed a single replacement, so take the new one.
      if (cur[index] && clean.length === 2 && clean[0] === cur[index]) { setAt(index, clean.slice(1)); return; }
      // Otherwise it's a paste / OS SMS autofill of the whole code — fan it out.
      const merged = commit(cur.slice(0, index) + clean);
      if (merged.length >= 6) { Keyboard.dismiss(); onComplete(merged); } else focusIndex(merged.length);
      return;
    }
    const arr = cur.split('');
    arr[index] = clean; // '' when the field was cleared
    const merged = commit(arr.join(''));
    if (clean) { if (merged.length >= 6) { Keyboard.dismiss(); onComplete(merged); } else focusIndex(index + 1); }
  }

  function onKey(e: { nativeEvent: { key: string } }, index: number) {
    if (e.nativeEvent.key === 'Backspace' && !valRef.current[index] && index > 0) {
      const arr = valRef.current.split('');
      arr[index - 1] = '';
      commit(arr.join(''));
      focusIndex(index - 1);
    }
  }

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {cells.map((c, i) => (
        <TextInput
          key={i}
          ref={(r) => { inputs.current[i] = r; }}
          value={c}
          onChangeText={(t) => setAt(i, t)}
          onKeyPress={(e) => onKey(e, i)}
          keyboardType="number-pad"
          returnKeyType="done"
          autoFocus={i === 0}
          selectTextOnFocus
          // Keep the OS SMS autofill hooks on the first box so the whole code can
          // land at once; the multi-char handler above then fans it across all six.
          autoComplete={i === 0 ? 'sms-otp' : 'off'}
          textContentType={i === 0 ? 'oneTimeCode' : 'none'}
          importantForAutofill={i === 0 ? 'yes' : 'no'}
          style={{
            flex: 1, height: 58, borderRadius: radius.md, borderWidth: 1.5,
            borderColor: error ? colors.danger : c ? colors.flameDeep : colors.line,
            backgroundColor: c ? colors.cream : colors.white,
            textAlign: 'center', fontFamily: fonts.sansSemi, fontSize: 22, color: colors.ink,
          }}
        />
      ))}
    </View>
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
