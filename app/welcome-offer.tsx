import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from '../components/ui';
import { getWelcomeFunnelState, startWelcomeLitre, type WelcomeFunnelState, type WelcomePlan } from '../lib/crm';
import { useDiscLang } from '../lib/i18n';

/**
 * The Welcome Litre offer screen — terms summary BEFORE any commitment
 * (campaign §15.7: "every material condition is here, before the customer
 * invests any effort; nothing in fine print"), then the plan choice with
 * alternate-day at EQUAL prominence (§6.3/A-10), then one CTA that starts the
 * subscription with NO payment (terms §3.1).
 *
 * LOGIC lives server-side: this screen renders whatever GET /crm/eligibility
 * says and routes every error code — it never guesses locally. UI/UX polish
 * welcome (see HANDOFF-FE-WELCOME-LITRE.md); the states and copy structure
 * are load-bearing compliance and must survive any redesign.
 */

const PLANS: { id: string; label: string; labelHi: string; sub: string; qty: number; ml: number }[] = [
  { id: 'gold-500ml', label: 'Full Cream · 2 × 500 ml', labelHi: 'फुल क्रीम · 2 × 500 मि.ली.', sub: '₹70/day', qty: 2, ml: 500 },
  { id: 'gold-1l', label: 'Full Cream · 1 L', labelHi: 'फुल क्रीम · 1 ली.', sub: '₹69/day', qty: 1, ml: 1000 },
  { id: 'taaza-500ml', label: 'Toned · 2 × 500 ml', labelHi: 'टोन्ड · 2 × 500 मि.ली.', sub: '₹58/day', qty: 2, ml: 500 },
  { id: 'taaza-1l', label: 'Toned · 1 L', labelHi: 'टोन्ड · 1 ली.', sub: '₹57/day', qty: 1, ml: 1000 },
];

export default function WelcomeOffer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hi = useDiscLang() === 'hi';
  const [state, setState] = useState<WelcomeFunnelState | null | 'loading'>('loading');
  const [plan, setPlan] = useState(PLANS[0]);
  const [freq, setFreq] = useState<'daily' | 'alternate'>('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let on = true;
    getWelcomeFunnelState().then((s) => { if (on) setState(s); });
    return () => { on = false; };
  }, []));

  async function start() {
    setBusy(true); setError('');
    try {
      const body: WelcomePlan = { plan_product_id: plan.id, plan_qty: plan.qty, plan_frequency: freq };
      await startWelcomeLitre(body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)'); // home shows the plan card + the W-01 bell
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'ADDRESS_REQUIRED') { router.push('/address'); return; }
      if (code === 'NOT_SERVICEABLE') { setState('not_serviceable'); return; }
      if (code === 'ALREADY_ENROLLED') { router.replace('/(tabs)'); return; }
      setError(e?.message ?? 'Could not start the offer. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const t = (en: string, hiText: string) => (hi ? hiText : en);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tap onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color={colors.flameDeep} />
        </Tap>
        <Serif style={{ fontSize: 24, flex: 1 }}>{t('Your first litre is on us', 'पहला लीटर हमारी ओर से')}</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* §15.7 — the offer terms summary, before any commitment. */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, gap: 8, ...shadow.card }}>
          <Pill small label={t('FREE — NOTHING TO PAY NOW', 'मुफ़्त — अभी कोई भुगतान नहीं')} bg={colors.flameSoft} color={colors.flameDeep} />
          {[
            t('Who: new PYAAS households in our delivery area, one offer per mobile number and address.',
              'कौन: हमारे डिलीवरी क्षेत्र के नए ग्राहक। एक मोबाइल नंबर और एक पते पर एक ऑफ़र।'),
            t('Free: 2 packs of 500 ml Parag Full Cream — 1 litre in total.',
              'क्या मुफ़्त: पराग फुल क्रीम दूध के 2 × 500 मि.ली. पैक — कुल 1 लीटर।'),
            t('Pack 1 arrives with your first delivery. No payment or wallet balance needed to start.',
              'पहला पैक: पहली डिलीवरी के साथ। शुरू करने के लिए किसी भुगतान या वॉलेट बैलेंस की ज़रूरत नहीं।'),
            t('Pack 2: add ₹500 or more in ONE recharge within 7 days of the first delivery — it comes free with your next delivery.',
              'दूसरा पैक: पहली डिलीवरी के 7 दिन के भीतर एक बार में ₹500 या उससे अधिक का रिचार्ज — अगली डिलीवरी के साथ मुफ़्त।'),
            t('No minimum period. Pause, change or cancel any time, in two taps.',
              'कोई न्यूनतम अवधि नहीं। कभी भी रोकें, बदलें या बंद करें।'),
            t('This is additional quantity, not a discount — milk MRP does not change.',
              'यह अतिरिक्त मात्रा है, छूट नहीं — दूध की MRP में कोई बदलाव नहीं।'),
          ].map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={15} color={colors.flameDeep} style={{ marginTop: 2 }} />
              <TextBody style={{ fontSize: 12.5, lineHeight: 18, flex: 1 }}>{line}</TextBody>
            </View>
          ))}
          <Tap onPress={() => router.push('/terms')}>
            <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>{t('Full offer terms', 'पूरी शर्तें देखें')}</TextMed>
          </Tap>
        </View>

        {state === 'not_serviceable' ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 10 }}>
            <TextSemi style={{ fontSize: 14.5 }}>{t("We don't deliver to your area yet", 'हम अभी आपके क्षेत्र में डिलीवर नहीं करते')}</TextSemi>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>
              {t('Join the waitlist from your cart or address screen — your offer stays available, and we will tell you the day we reach you.',
                 'प्रतीक्षा-सूची से जुड़िए — आपका ऑफ़र बना रहेगा, और जिस दिन हम पहुँचेंगे, हम आपको बताएँगे।')}
            </TextBody>
          </View>
        ) : (
          <>
            {/* §6.3 — plan choice; alternate-day at equal prominence. */}
            <TextSemi style={{ fontSize: 15 }}>{t('Choose your milk', 'अपना दूध चुनिए')}</TextSemi>
            <View style={{ gap: 8 }}>
              {PLANS.map((p) => (
                <Tap key={p.id} onPress={() => setPlan(p)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: plan.id === p.id ? colors.flameDeep : colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name={plan.id === p.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={plan.id === p.id ? colors.flameDeep : colors.inkMute} />
                  <TextMed style={{ fontSize: 13.5, flex: 1 }}>{hi ? p.labelHi : p.label}</TextMed>
                  <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }}>{p.sub}</TextBody>
                </Tap>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['daily', 'alternate'] as const).map((f) => (
                <Tap key={f} onPress={() => setFreq(f)}
                  style={{ flex: 1, alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: freq === f ? colors.flameDeep : colors.line, paddingVertical: 12 }}>
                  <TextMed style={{ fontSize: 13.5 }} color={freq === f ? colors.flameDeep : colors.ink}>
                    {f === 'daily' ? t('Every morning', 'रोज़ सुबह') : t('Alternate mornings', 'एक दिन छोड़कर')}
                  </TextMed>
                </Tap>
              ))}
            </View>

            {error ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{error}</TextBody> : null}

            <Tap onPress={busy || state === 'loading' ? undefined : start} style={{ marginTop: 4 }}>
              <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                {busy ? <ActivityIndicator color={colors.white} /> : (
                  <>
                    <TextSemi color={colors.white} style={{ fontSize: 16 }}>
                      {state === 'address_required'
                        ? t('Add my address to start', 'शुरू करने के लिए पता जोड़ें')
                        : t('Start — first pack is free', 'शुरू कीजिए — पहला पैक मुफ़्त')}
                    </TextSemi>
                    <Ionicons name="arrow-forward" size={17} color={colors.white} />
                  </>
                )}
              </View>
            </Tap>
            <TextBody color={colors.inkMute} style={{ fontSize: 11.5, textAlign: 'center' }}>
              {t('No payment now. Milk is paid from your wallet at MRP only after your free first morning.',
                 'अभी कोई भुगतान नहीं। मुफ़्त पहली सुबह के बाद ही दूध MRP पर वॉलेट से कटता है।')}
            </TextBody>
          </>
        )}
      </ScrollView>
    </View>
  );
}
