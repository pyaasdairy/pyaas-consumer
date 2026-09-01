import React from 'react';
import { View, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Pill } from './ui';
import { useDiscLang } from '../lib/i18n';

const PACK_IMG = require('../assets/products/gold.png');

/**
 * The Welcome Litre POPUP — the old 2+2 modal's proven STRUCTURE (pack hero →
 * headline → benefit rows → primary CTA → soft dismiss), re-worded entirely
 * from the published offer (campaign §15.6 landing copy + offer terms). The
 * founder's rule: reuse the pattern, never the old promise.
 *
 * Behavior contract (CCPA + the no-local-state rule):
 *  - renders ONLY when the server says `eligible` (the caller gates on
 *    GET /crm/eligibility — no AsyncStorage seen/snooze machinery);
 *  - once per app LAUNCH (in-memory ref in the caller), always dismissible,
 *    no countdowns, no confirm-shaming — "Maybe later" is a plain later.
 */
export function WelcomeLitrePopup({ visible, onStart, onClose }: {
  visible: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  const hi = useDiscLang() === 'hi';
  const t = (en: string, hiText: string) => (hi ? hiText : en);

  const rows: [string, string, string][] = [
    ['gift', t('First morning: 500 ml Full Cream free — no payment, no wallet balance', 'पहली सुबह: 500 मि.ली. फुल क्रीम मुफ़्त — कोई भुगतान नहीं'),
      'row1'],
    ['wallet', t('Add ₹500 once within 7 days — your second 500 ml pack is free too', '7 दिन में एक बार ₹500 डालिए — दूसरा 500 मि.ली. पैक भी मुफ़्त'),
      'row2'],
    ['sunny', t('Fresh Parag milk at your door by 7 am, every morning', 'रोज़ सुबह 7 बजे तक पराग का ताज़ा दूध आपके दरवाज़े'),
      'row3'],
    ['pause', t('No minimum period — pause, change or cancel any time', 'कोई न्यूनतम अवधि नहीं — कभी भी रोकें, बदलें या बंद करें'),
      'row4'],
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,10,14,0.55)', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', maxHeight: '88%', ...shadow.card }}>
          <ScrollView bounces={false}>
            <Tap onPress={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={colors.flameDeep} />
            </Tap>

            {/* Hero — the litre itself (structure from the old modal). */}
            <View style={{ alignItems: 'center', paddingTop: 26, paddingBottom: 6, backgroundColor: colors.flameSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Image source={PACK_IMG} style={{ width: 84, height: 84, transform: [{ rotate: '-7deg' }], marginRight: -12 }} contentFit="contain" />
                <Image source={PACK_IMG} style={{ width: 96, height: 96, transform: [{ rotate: '5deg' }] }} contentFit="contain" />
              </View>
              <View style={{ marginTop: 8, marginBottom: 14, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, ...shadow.soft }}>
                <TextSemi color={colors.flameDeep} style={{ fontSize: 12 }}>
                  {t('FREE — nothing to pay now', 'मुफ़्त — अभी कोई भुगतान नहीं')}
                </TextSemi>
              </View>
            </View>

            <View style={{ padding: spacing.lg, gap: 12 }}>
              <Serif style={{ fontSize: 24, textAlign: 'center' }}>
                {t('Your first litre is on us', 'पहला लीटर हमारी ओर से')}
              </Serif>
              <TextBody color={colors.inkSoft} style={{ fontSize: 13, textAlign: 'center' }}>
                {t('Parag milk you already trust, delivered to your door by PYAAS.',
                   'पराग का भरोसेमंद दूध, PYAAS की डिलीवरी से सीधे आपके दरवाज़े।')}
              </TextBody>

              <View style={{ backgroundColor: colors.flameSoft, borderRadius: radius.lg, padding: spacing.md, gap: 12 }}>
                {rows.map(([icon, text, key]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={icon as never} size={16} color={colors.flameDeep} />
                    </View>
                    <TextBody style={{ fontSize: 12.5, lineHeight: 17, flex: 1 }}>{text}</TextBody>
                  </View>
                ))}
              </View>

              <Tap onPress={onStart}>
                <View style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                  <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>
                    {t('See the offer — start free', 'ऑफ़र देखिए — मुफ़्त शुरू कीजिए')}
                  </TextSemi>
                  <Ionicons name="arrow-forward" size={17} color={colors.white} />
                </View>
              </Tap>
              <Tap onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>{t('Maybe later', 'बाद में')}</TextMed>
              </Tap>
              <TextBody color={colors.inkMute} style={{ fontSize: 10.5, textAlign: 'center' }}>
                {t('New households · selected areas · one per mobile number and address · T&C apply',
                   'नए ग्राहक · चुनिंदा क्षेत्र · एक नंबर और एक पते पर एक · शर्तें लागू')}
              </TextBody>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
