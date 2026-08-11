import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Keyboard, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../../lib/theme';
import { TextBody, TextMed, TextSemi, Serif, Tap } from '../../components/ui';
import { enterUp } from '../../lib/motion';
import { signInWithPhone, saveProfile, DEMO_OTP } from '../../lib/session';
import { api, isBackendConfigured, setTokens } from '../../lib/apiClient';
import { isMsg91Configured, msg91SendOtp, msg91RetryOtp, msg91VerifyOtp } from '../../lib/msg91';
import { requestPhoneHint, startSmsRetriever } from '../../lib/nativeConvenience';
import { WALLET_TEST_TOPUP } from '../../lib/razorpay';

/**
 * Phone OTP sign-in, built for a ZERO-TYPING flow: tapping the number field
 * opens the Play-Services number chooser (one tap fills the SIM number and the
 * code sends itself), the incoming OTP SMS is auto-read and fanned into the
 * boxes, and a complete code verifies on its own. Typing stays available as the
 * fallback on devices without the native helpers.
 */

// The four landing creatives, in order, for the top slideshow.
const SLIDES = [
  require('../../assets/landing/landing-1.png'),
  require('../../assets/landing/landing-2.png'),
  require('../../assets/landing/landing-3.png'),
  require('../../assets/landing/landing-4.png'),
];
const SLIDE_RATIO = 1024 / 1536; // h/w of the landing art
const SLIDE_INTERVAL = 3400;

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
  // The keyboard covers the bottom card on phones — while it's up, collapse the
  // slideshow so the "Get started" card (field + button) stays fully visible.
  const [kbUp, setKbUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const digits = () => phone.replace(/\D/g, '').slice(-10);

  /**
   * ZERO-TYPING step 1: the phone-number chooser (the light "Continue with"
   * picker listing the SIM numbers; no runtime permission) opens when the
   * member TAPS the number field — never on its own over the landing page.
   * Picking a number auto-sends the code with no Continue tap. While the
   * system picker is up, the slideshow collapses (like the keyboard does) so
   * the Get-started card floats above it and the field is never hidden.
   * Cancelling ("None of the above") hands over to plain typing and the
   * picker does not nag again this session. No-ops gracefully when the native
   * module / Play Services is absent; autoComplete="tel" then offers OS
   * autofill and typing still works.
   */
  const [hintOpen, setHintOpen] = useState(false);
  const hintDone = useRef(false); // resolved once (picked or dismissed) — don't relaunch
  const launchHint = async () => {
    if (hintBusy.current || hintDone.current || digits().length >= 10) return;
    hintBusy.current = true;
    setHintOpen(true);
    try {
      const hinted = await requestPhoneHint();
      hintDone.current = true;
      if (hinted && hinted.length >= 10 && digits().length < 10) {
        setPhone(hinted);
        Keyboard.dismiss();
        // Auto-continue: the picked number is the SIM's own, so send the code
        // without a second tap on Continue.
        void sendCodeFor(hinted);
      }
    } finally {
      hintBusy.current = false;
      setHintOpen(false);
    }
  };

  /**
   * ZERO-TYPING step 2: while on the code step, auto-read the incoming OTP SMS
   * and verify. No-ops when the native module is absent; the code input's
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

  // Cold-start / flaky-network fetches throw low-level messages. Show friendly
  // copy for those; pass real server messages ("Too many attempts") through.
  function friendly(e: any, fallback: string) {
    const m = String(e?.message ?? '');
    if (/fetch|network|timeout|timed out|cancell?ed|aborted|connection|ECONN|failed to fetch/i.test(m)) {
      return 'Network looks slow. Please check your connection and try again.';
    }
    return m || fallback;
  }

  // OTP provider order: the parag-api backend when configured, else MSG91 real
  // SMS (EXPO_PUBLIC_MSG91_* env), else the offline dev fallback (which shows
  // no hint on screen and is dead the moment either real provider is set).
  async function sendCodeFor(raw: string) {
    const ds = raw.replace(/\D/g, '').slice(-10);
    if (ds.length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError(''); setLoading(true);
    try {
      if (isBackendConfigured()) {
        const r = await api.post<{ sent: boolean; dev_otp?: string }>('/auth/otp/request', { phone: ds });
        setDevOtp(r.dev_otp ?? '');
      } else if (isMsg91Configured()) {
        await msg91SendOtp(ds);
      }
      setStep('code');
      setResendIn(30); // start the resend cooldown
    } catch (e: any) {
      setError(friendly(e, 'Could not send the code. Please try again.'));
    } finally { setLoading(false); }
  }

  function sendCode() { void sendCodeFor(phone); }

  // Resend the OTP without leaving the code step. Gated by a 30s cooldown.
  async function resend() {
    if (resendIn > 0 || loading) return;
    setCode(''); setError('');
    if (!isBackendConfigured() && isMsg91Configured()) {
      setLoading(true);
      try {
        await msg91RetryOtp(digits());
        setResendIn(30);
      } catch (e: any) {
        setError(friendly(e, 'Could not resend the code. Please try again.'));
      } finally { setLoading(false); }
      return;
    }
    sendCode();
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
        // Real backend: verify -> JWT tokens; also set the local session uid the
        // FE data layer reads (requireUserId) so both stay in sync.
        const pair = await api.post<{ access_token: string; refresh_token: string; profile?: { id: string; full_name?: string | null } }>(
          '/auth/otp/verify', { phone: digits(), code: c });
        await setTokens(pair.access_token, pair.refresh_token);
        // Hand the server-known name straight into the session write (pre-emit)
        // so the router gate NEVER shows a registered member the name step
        // again — not even a flash — on any device or reinstall.
        await signInWithPhone(digits(), pair.profile?.full_name);
      } else if (isMsg91Configured()) {
        // Real SMS OTP via MSG91: verify the code, then open the local session.
        await msg91VerifyOtp(digits(), c);
        await signInWithPhone(digits());
      } else {
        // Offline dev fallback only (no backend, no MSG91). Not advertised on
        // screen; a real provider disables this path entirely.
        if (c !== DEMO_OTP) { setError('That code is not right. Try again.'); return; }
        await signInWithPhone(digits());
      }
    } catch (e: any) {
      setError(friendly(e, 'Could not sign you in. Please try again.'));
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 'phone' ? (
          <>
            {/* Full-bleed landing slideshow with dot indicators. Collapses while
                the keyboard OR the system number-picker is up so the field +
                button stay fully visible. The collapsed spacer is a SMALL FIXED
                strip (never flex:1 — a flexing spacer swallows the shrunken
                viewport and shoves the card under the keyboard), so the
                Get-started card floats to the TOP while typing. */}
            {kbUp || hintOpen ? (
              <View style={{ height: insets.top + spacing.md }} />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top }}>
                <LandingSlideshow />
              </View>
            )}

            {/* "Get started" card */}
            <Animated.View
              entering={enterUp()}
              style={{ backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.line, marginHorizontal: 8, borderBottomWidth: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md, ...shadow.card }}
            >
              <Serif style={{ fontSize: 22 }}>Get started</Serif>

              {/* Flag + number field. Tapping it opens the one-tap number chooser. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 56, backgroundColor: colors.white }}>
                <Text style={{ fontSize: 22 }}>🇮🇳</Text>
                <View style={{ width: 1, height: 24, backgroundColor: colors.line }} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => { void launchHint(); }}
                  keyboardType="phone-pad"
                  placeholder="Enter mobile number"
                  placeholderTextColor={colors.inkMute}
                  maxLength={10}
                  returnKeyType="done"
                  onSubmitEditing={sendCode}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  importantForAutofill="yes"
                  style={{ flex: 1, fontFamily: fonts.sans, fontSize: 16.5, color: colors.ink }}
                />
              </View>

              {error ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{error}</TextBody> : null}

              <Tap onPress={loading ? undefined : sendCode}>
                <View style={{ height: 54, borderRadius: radius.md, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                  {loading ? <ActivityIndicator color={colors.white} /> : (
                    <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Continue</TextSemi>
                  )}
                </View>
              </Tap>

              {/* Both must be reachable from the signup screen: a reviewer (and a
                  customer) taps these expecting the actual documents. */}
              <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.ink}>
                By signing up you agree to our{' '}
                <TextMed color={colors.flameDeep} onPress={() => router.push('/terms')}>Terms</TextMed>
                {' '}and{' '}
                <TextMed color={colors.flameDeep} onPress={() => router.push('/privacy-policy')}>Privacy Policy</TextMed>.
              </TextBody>
            </Animated.View>
          </>
        ) : (
          <>
            {/* Code step: compact header + the OTP card */}
            <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg }}>
              <Tap haptic={false} onPress={() => setStep('phone')} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chevron-back" size={20} color={colors.flameDeep} />
              </Tap>
            </View>
            <Animated.View entering={FadeInDown.duration(280)} style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.lg }}>
              <Serif style={{ fontSize: 28 }}>Enter the code</Serif>
              <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>
                Sent to +91 {digits()}. It fills in on its own the moment the SMS arrives. <TextMed color={colors.flameDeep} onPress={() => setStep('phone')}>Change</TextMed>
              </TextBody>
              <OtpBoxes value={code} error={!!error} onChange={setCode} onComplete={(c) => { if (!loading) verify(c); }} />
              {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 12 }}>{error}</TextBody> : null}
              {/* The pilot flask box shows the backend-echoed test OTP only in a
                  WALLET_TEST_TOPUP build; a live build shows nothing here. */}
              {devOtp && WALLET_TEST_TOPUP ? (
                <View style={{ marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.flameSoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flask-outline" size={16} color={colors.flameDeep} />
                  <TextBody style={{ fontSize: 13, flex: 1 }}>Test OTP: <TextSemi color={colors.flameDeep} style={{ fontSize: 15, letterSpacing: 2 }}>{devOtp}</TextSemi>  ·  shown for testing (SMS later)</TextBody>
                </View>
              ) : null}
              <Tap onPress={loading ? undefined : () => verify()} style={{ marginTop: spacing.lg }}>
                <View style={{ height: 54, borderRadius: radius.md, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                  {loading ? <ActivityIndicator color={colors.white} /> : (
                    <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Verify and sign in</TextSemi>
                  )}
                </View>
              </Tap>
              {isBackendConfigured() || isMsg91Configured() ? (
                <Tap haptic={false} onPress={() => { void resend(); }} style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <TextMed color={resendIn > 0 ? colors.inkMute : colors.flameDeep} style={{ fontSize: 13.5 }}>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't get the code? Resend"}
                  </TextMed>
                </Tap>
              ) : null}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Auto-advancing full-width slideshow of the four landing creatives, with the
 *  reference's pill/dot pagination. Swipeable; a manual swipe simply re-anchors
 *  the timer at the new index. */
function LandingSlideshow() {
  const { width } = useWindowDimensions();
  const ref = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const h = Math.round(width * SLIDE_RATIO);

  useEffect(() => {
    if (width <= 0) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % SLIDES.length;
      ref.current?.scrollToOffset({ offset: next * width, animated: true });
      setIdx(next);
    }, SLIDE_INTERVAL);
    return () => clearInterval(t);
  }, [width]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIdx(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ gap: 18 }}>
      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={onEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <Image source={item} style={{ width, height: h }} contentFit="cover" transition={200} />
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === idx ? colors.flameDeep : colors.flameSoft }}
          />
        ))}
      </View>
    </View>
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
  // handler fires before box-0's onChange->setCode has flushed, so it rebuilt the
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
