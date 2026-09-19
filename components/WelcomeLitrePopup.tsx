import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeModal } from './SafeModal';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap, Pill } from './ui';
import { useAutoPopup } from '../lib/popupGate';
import { useDiscLang } from '../lib/i18n';
import type { WelcomeFunnelState } from '../lib/crm';

const PACK_IMG = require('../assets/products/gold.png');

// Once per app launch — a popup that re-fires on every Home focus is a nag,
// not an introduction. The home card remains the persistent surface.
let shownThisLaunch = false;

/**
 * WELCOME LITRE first-landing popup — the campaign's ONE self-presenting
 * acquisition surface (§15.6 copy), replacing the retired 2+2 confetti modal
 * and claim popup. Renders only on the server's say-so (eligible /
 * address_required), once per launch, through the popup arbiter's atomic
 * claim so it can never stack or oscillate. Every commitment happens on the
 * /welcome-offer screen behind the §15.7 terms — this sheet only introduces.
 */
export function WelcomeLitrePopup({ state }: { state: WelcomeFunnelState | null }) {
  const router = useRouter();
  const hi = useDiscLang() === 'hi';
  const t = (en: string, hiText: string) => (hi ? hiText : en);

  const want = !shownThisLaunch && (state === 'eligible' || state === 'address_required');
  const show = useAutoPopup(want);
  const [dismissed, setDismissed] = React.useState(false);
  const visible = show && !dismissed;

  const close = () => { shownThisLaunch = true; setDismissed(true); };

  return (
    <SafeModal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: -8 }} />
          <View style={{ alignItems: 'center', marginTop: -60 }}>
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.white, ...shadow.card }}>
              <Image transition={220} source={PACK_IMG} style={{ width: 78, height: 78 }} contentFit="contain" />
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Pill small label={t('FREE · NO PAYMENT NOW', 'मुफ़्त · अभी कोई भुगतान नहीं')} bg={colors.flameSoft} color={colors.flameDeep} />
            <Serif style={{ fontSize: 24, textAlign: 'center' }}>{t('Your first litre is on us', 'पहला लीटर हमारी ओर से')}</Serif>
          </View>
          {[
            t('First morning: 500 ml Full Cream, free', 'पहली सुबह: 500 मि.ली. फुल क्रीम दूध मुफ़्त'),
            // "within 7 days" is a MATERIAL term of the offer (offer terms,
            // pack 2) — carried over from the co-dev's parallel popup at merge.
            t('Recharge ₹500 once within 7 days → second 500 ml pack free too', '7 दिन में एक बार ₹500 का रिचार्ज → दूसरा 500 मि.ली. पैक भी मुफ़्त'),
            t('No payment to start · pause or cancel any time', 'शुरू करने के लिए कोई भुगतान नहीं · कभी भी रोकें या बंद करें'),
          ].map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.flameDeep} style={{ marginTop: 1.5 }} />
              <TextBody style={{ fontSize: 13, lineHeight: 18, flex: 1, textAlign: 'justify' }}>{line}</TextBody>
            </View>
          ))}
          <Tap
            onPress={() => { close(); router.push('/welcome-offer'); }}
            style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4, ...shadow.soft }}
          >
            <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>{t('See the offer', 'ऑफ़र देखिए')}</TextSemi>
            <Ionicons name="arrow-forward" size={16} color={colors.white} />
          </Tap>
          <Tap haptic={false} onPress={close} style={{ alignSelf: 'center', paddingVertical: 6 }}>
            <TextBody color={colors.inkMute} style={{ fontSize: 13.5 }}>{t('Not now', 'अभी नहीं')}</TextBody>
          </Tap>
        </View>
      </View>
    </SafeModal>
  );
}
