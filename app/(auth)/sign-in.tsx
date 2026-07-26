import React, { useState } from 'react';
import { View, Image, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, fonts } from '../../lib/theme';
import { TextBody, TextMed, TextSemi, Serif, Tap } from '../../components/ui';
import { ShineSweep } from '../../components/Fx';
import { enterUp } from '../../lib/motion';
import { signInWithEmail } from '../../lib/session';

const BADGE = 112;

export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true); setError('');
    try {
      await signInWithEmail(email, password); // session set -> root navigator enters the app
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.flameDeep }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.flameDeep }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, overflow: 'hidden' }}>
            <Tap haptic={false} onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={20} color={colors.white} />
            </Tap>
            <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: 12 }}>
              <Image source={require('../../assets/parag-logo.png')} style={{ width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: colors.white }} resizeMode="contain" />
              <TextMed color="rgba(255,255,255,0.92)" style={{ fontSize: 14 }}>Pure, natural, good health.</TextMed>
            </View>
            <ShineSweep dur={3600} travel={440} bandWidth={120} delay={600} />
          </View>

          <Animated.View entering={enterUp()} style={{ flex: 1, backgroundColor: colors.white, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.lg, ...shadow.card }}>
            <Serif style={{ fontSize: 30 }}>Sign In</Serif>
            <TextBody style={{ fontSize: 14.5, marginTop: 4, marginBottom: spacing.xl }}>Welcome back to PARAG.</TextBody>

            <UnderlineField icon="at-outline" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <UnderlineField
              icon="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={submit}
              right={
                <Tap haptic={false} onPress={() => setShow((s) => !s)} style={{ padding: 4 }}>
                  <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkMute} />
                </Tap>
              }
            />

            {error ? <TextBody color={colors.danger} style={{ fontSize: 13.5, marginTop: 10, marginBottom: 6 }}>{error}</TextBody> : null}

            <Tap onPress={loading ? undefined : submit} style={{ marginTop: spacing.lg }}>
              <View style={{ height: 56, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                {loading ? <ActivityIndicator color={colors.white} /> : (
                  <>
                    <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Sign In</TextSemi>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </>
                )}
              </View>
            </Tap>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: spacing.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <TextBody style={{ fontSize: 12 }}>or</TextBody>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>

            <Tap haptic={false} onPress={() => router.replace('/(auth)/otp')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flame }}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.flameDeep} />
              <TextSemi color={colors.flameDeep} style={{ fontSize: 14.5 }}>Continue with phone</TextSemi>
            </Tap>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: 6 }}>
              <TextBody style={{ fontSize: 14 }}>New here?</TextBody>
              <Tap haptic={false} onPress={() => { Haptics.selectionAsync(); router.replace('/(auth)/sign-up'); }}>
                <TextSemi color={colors.flameDeep} style={{ fontSize: 14 }}>Create Account</TextSemi>
              </Tap>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function UnderlineField({ icon, right, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1.5, borderBottomColor: colors.line, paddingVertical: 12, marginBottom: spacing.sm }}>
      <Ionicons name={icon} size={20} color={colors.flameDeep} />
      <TextInput
        placeholderTextColor={colors.inkMute}
        style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: colors.ink }}
        {...props}
      />
      {right ?? null}
    </View>
  );
}
