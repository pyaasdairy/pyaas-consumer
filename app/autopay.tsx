import React, { useCallback, useState } from 'react';
import { View, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, BackButton } from '../components/ui';
import { enterUp } from '../lib/motion';
import { AUTOPAY_BENEFITS } from '../lib/pricing';
import { getAutopay, setupAutopay, cancelAutopay, type AutopayMandate } from '../lib/walletApi';

const CAPS = [1000, 2000, 5000];

/**
 * PYAAS MONEY - UPI autopay mandate setup. Writes autopay_mandates; the
 * Razorpay UPI-AutoPay mandate itself is a placeholder until the gateway keys
 * are live (lib/razorpay.ts), so the flow is fully testable today.
 */
export default function Autopay() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mandate, setMandate] = useState<AutopayMandate | null>(null);
  const [loading, setLoading] = useState(true);
  const [upi, setUpi] = useState('');
  const [cap, setCap] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setMandate(await getAutopay());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function activate() {
    const id = upi.trim().toLowerCase();
    if (!/^[\w.\-]{2,}@[a-z]{2,}$/i.test(id)) { setErr('Enter a valid UPI ID, e.g. name@upi'); return; }
    setBusy(true); setErr('');
    try {
      await setupAutopay({ maxAmount: cap, upiId: id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) { setErr(e?.message ?? 'Could not set up autopay.'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!mandate) return;
    setBusy(true);
    try { await cancelAutopay(mandate.id); await load(); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>PYAAS MONEY</Serif>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.roseDeep} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enterUp()}>
            <View style={{ backgroundColor: colors.roseDeep, borderRadius: radius.xl, padding: spacing.lg, gap: 8, ...shadow.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash" size={20} color={colors.white} />
                <TextSemi color={colors.white} style={{ fontSize: 17 }}>Smart Recharge · UPI AutoPay</TextSemi>
              </View>
              <TextBody color="rgba(255,255,255,0.94)" style={{ fontSize: 13.5, lineHeight: 20 }}>
                Your wallet tops itself up before it runs dry, so the milk never stops. We notify you 24 hours before every charge.
              </TextBody>
            </View>
          </Animated.View>

          {mandate ? (
            <Animated.View entering={enterUp(60)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.roseDeep, padding: spacing.lg, gap: 10, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TextSemi style={{ fontSize: 16 }}>Autopay is on</TextSemi>
                <Pill label={mandate.status.toUpperCase()} bg={colors.roseSoft} color={colors.roseDeep} />
              </View>
              <Row label="UPI ID" value={mandate.upi_id ?? '-'} />
              <Row label="Per-charge cap" value={rupee(mandate.max_amount)} />
              <Row label="Next charge" value={mandate.next_charge_date ?? 'When balance runs low'} />
              <Button title="Cancel autopay" variant="outline" loading={busy} onPress={cancel} />
            </Animated.View>
          ) : (
            <Animated.View entering={enterUp(60)} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: 14, ...shadow.soft }}>
              <TextSemi style={{ fontSize: 16 }}>Set up in 30 seconds</TextSemi>

              <View style={{ gap: 6 }}>
                <TextMed color={colors.inkSoft} style={{ fontSize: 13 }}>Your UPI ID</TextMed>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 50 }}>
                  <Ionicons name="at" size={18} color={colors.roseDeep} />
                  <TextInput value={upi} onChangeText={setUpi} autoCapitalize="none" autoCorrect={false} placeholder="yourname@upi" placeholderTextColor={colors.inkMute} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }} />
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <TextMed color={colors.inkSoft} style={{ fontSize: 13 }}>Maximum per charge</TextMed>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {CAPS.map((c) => (
                    <Tap key={c} onPress={() => setCap(c)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: cap === c ? colors.roseDeep : colors.wash, borderWidth: 1, borderColor: cap === c ? colors.roseDeep : colors.line }}>
                      <TextSemi color={cap === c ? colors.white : colors.ink} style={{ fontSize: 14 }}>{rupee(c)}</TextSemi>
                    </Tap>
                  ))}
                </View>
              </View>

              {AUTOPAY_BENEFITS.map((b) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.roseDeep} />
                  <TextBody style={{ fontSize: 13 }} color={colors.ink}>{b}</TextBody>
                </View>
              ))}

              {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}
              <Button title="Activate autopay" loading={busy} onPress={activate} />
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <TextBody style={{ fontSize: 13.5 }}>{label}</TextBody>
      <TextMed style={{ fontSize: 13.5 }}>{value}</TextMed>
    </View>
  );
}
