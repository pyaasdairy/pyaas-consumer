import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CARE_PHONE } from '../lib/support';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { TextBody, TextMed, Tap, Pill } from './ui';

/**
 * §15.7 OFFER TERMS SUMMARY — every material condition of the Welcome Litre,
 * shown BEFORE the customer invests any effort (campaign A-2: "offer terms
 * screen shown before registration"; §16: nothing in fine print). Rendered on
 * the pre-registration offer-terms screen AND inside the in-app funnel screen,
 * from this single source so the two can never drift.
 *
 * The line list is load-bearing compliance copy (campaign §15.7, Hindi
 * binding) — restyle freely, never trim or soften a line.
 */
export function OfferTermsSummary({ hi }: { hi: boolean }) {
  const router = useRouter();
  const t = (en: string, hiText: string) => (hi ? hiText : en);
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.flame, padding: spacing.md, gap: 8, ...shadow.card }}>
      <Pill small label={t('FREE · NOTHING TO PAY NOW', 'मुफ़्त · अभी कोई भुगतान नहीं')} bg={colors.flameSoft} color={colors.flameDeep} />
      {[
        t('Who: new PYAAS households in our delivery area, one offer per mobile number and address.',
          'कौन: हमारे डिलीवरी क्षेत्र के नए ग्राहक। एक मोबाइल नंबर और एक पते पर एक ऑफ़र।'),
        t('Free: 2 packs of 500 ml Parag Full Cream, 1 litre in total.',
          'क्या मुफ़्त: पराग फुल क्रीम दूध के 2 × 500 मि.ली. पैक, कुल 1 लीटर।'),
        t('Pack 1 arrives with your first delivery. No payment or wallet balance needed to start.',
          'पहला पैक: पहली डिलीवरी के साथ। शुरू करने के लिए किसी भुगतान या वॉलेट बैलेंस की ज़रूरत नहीं।'),
        t('Pack 2: add ₹500 or more in ONE recharge within 7 days of the first delivery. It comes free with your next delivery.',
          'दूसरा पैक: पहली डिलीवरी के 7 दिन के भीतर एक बार में ₹500 या उससे अधिक का रिचार्ज। अगली डिलीवरी के साथ मुफ़्त।'),
        t('A subscription is needed; there is no minimum period. Pause, change or cancel any time, in two taps.',
          'सब्सक्रिप्शन ज़रूरी है। कोई न्यूनतम अवधि नहीं। कभी भी रोकें, बदलें या बंद करें।'),
        t('Available only in our current delivery areas, while stocks last.',
          'केवल हमारे मौजूदा डिलीवरी क्षेत्र में, स्टॉक रहने तक।'),
        t('This is additional quantity, not a discount. Milk MRP does not change.',
          'यह अतिरिक्त मात्रा है, छूट नहीं। दूध की MRP में कोई बदलाव नहीं।'),
        // The REGISTERED care line (lib/support.CARE_PHONE). The published
        // PDFs still print the old 99996 80081; the app carries the number the
        // company actually answers, so this is derived, never retyped.
        t(`Help: ${CARE_PHONE}`, `सहायता: ${CARE_PHONE}`),
      ].map((line, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={15} color={colors.flameDeep} style={{ marginTop: 2 }} />
          <TextBody style={{ fontSize: 12.5, lineHeight: 18, flex: 1, textAlign: 'justify' }}>{line}</TextBody>
        </View>
      ))}
      <Tap onPress={() => router.push('/terms')}>
        <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>{t('Full offer terms', 'पूरी शर्तें देखें')}</TextMed>
      </Tap>
    </View>
  );
}
