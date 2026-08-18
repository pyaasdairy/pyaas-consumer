import React from 'react';
import { View, ScrollView } from 'react-native';
import { SafeModal } from './SafeModal';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { discStrings, setDiscLang, useDiscLang, type DiscLang } from '../lib/i18n';

/**
 * PROMINENT DISCLOSURE — shown BEFORE the app reads or sends the phone number.
 *
 * Google Play removed this app under the User Data policy: "Your app is
 * uploading users' phone number information without a prominent disclosure."
 * This screen is the remedy, and it is built against the enforcement notice's
 * own rules rather than against a general idea of "showing a policy":
 *
 *   Disclosure rule 1 — comprehensively disclose collection, USE and SHARING.
 *     Every row below names the data, the purpose, and where it goes, including
 *     the third party (our SMS provider) that the phone number is sent to.
 *   Disclosure rule 2 — inside the app, in normal usage, NOT behind a menu.
 *     This is presented on the sign-in screen itself, before the field is usable.
 *   Disclosure rule 3 — cannot live only in a privacy policy or ToS.
 *     The full text is HERE. The policy links are an addition, not the disclosure.
 *   Disclosure rule 4 — must not be bundled with unrelated disclosures.
 *     Deliberately says nothing about marketing, WhatsApp, email or offers. That
 *     is why this is NOT components/ConsentSheet.tsx, which bundles all of those.
 *
 *   Consent rule 1 — clear and unambiguous: one button, one meaning.
 *   Consent rule 2 — affirmative action: nothing proceeds without the tap.
 *   Consent rule 3 — navigating away is NOT consent. onRequestClose (Android
 *     back) routes to onDecline, never onAccept, and there is no tap-outside-to-
 *     dismiss because the backdrop is not pressable.
 *   Consent rule 4 — not auto-dismissing and never expires on a timer.
 *   Consent rule 5 — granted BEFORE collection: the caller must not read, fill
 *     or transmit a number until onAccept has fired.
 */

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/** One icon per disclosed flow, in the FIXED order of the `flows` tuple in
 *  lib/i18n.ts (which now owns the copy in both languages, along with the
 *  per-flow compliance rationale comments — SIM read, Google Places, OSM
 *  tiles). The tuple type there guarantees neither language can drop a flow. */
const FLOW_ICONS: React.ComponentProps<typeof Ionicons>['name'][] = [
  'call-outline',              // your mobile number (incl. the SIM read)
  'chatbubble-ellipses-outline', // the sign-in code we text you
  'location-outline',          // delivery address and location
  'search-outline',            // address-search keystrokes → Google Maps
  'map-outline',               // map tiles → OpenStreetMap
  'phone-portrait-outline',    // device identifier
  'card-outline',              // payment details → Razorpay
  'receipt-outline',           // orders and wallet activity
];

export type Flow = { icon: React.ComponentProps<typeof Ionicons>['name']; what: string; why: string };

/** The disclosed data flows, in the requested language. Exported as the single
 *  source of truth: the full-screen ConsentWelcome and this modal must always
 *  disclose the identical set of flows. */
export function FLOWS(lang: DiscLang): Flow[] {
  const strings = discStrings(lang).flows;
  return FLOW_ICONS.map((icon, i) => ({ icon, ...strings[i] }));
}

/** The English/Hindi switch shared by all three consent surfaces (this modal,
 *  ConsentWelcome, LocationDisclosure). It flips the ONE store in lib/i18n, so
 *  every surface follows, and the acceptance records capture whichever language
 *  is showing at the moment of the Agree tap. Label names the language you
 *  would switch TO, written in that language. */
export function DiscLangToggle({ style }: { style?: object }) {
  const lang = useDiscLang();
  return (
    <Tap
      haptic={false}
      onPress={() => setDiscLang(lang === 'en' ? 'hi' : 'en')}
      accessibilityRole="button"
      accessibilityLabel={lang === 'en' ? 'हिंदी में देखें' : 'View in English'}
      style={style}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 11,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.cream,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Ionicons name="language-outline" size={13} color={colors.flameDeep} />
        <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>{lang === 'en' ? 'हिंदी' : 'English'}</TextMed>
      </View>
    </Tap>
  );
}

export function DataDisclosure({ visible, onAccept, onDecline }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useDiscLang();
  const s = discStrings(lang);
  const flows = FLOWS(lang);

  return (
    <SafeModal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back = decline, NEVER an implicit accept (consent rule 3).
      onRequestClose={onDecline}
    >
      {/* Backdrop is a plain View, not a Tap: tapping away must not dismiss, because
          a dismissal would otherwise read as consent (consent rule 3). */}
      <View style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: '88%',
            gap: spacing.md,
            ...shadow.card,
          }}
        >
          {/* Language switch, top-right, ABOVE the fold: a member who cannot
              read the English text must find the Hindi one before anything
              asks them to agree. */}
          <View style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2 }}>
            <DiscLangToggle />
          </View>

          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 23, textAlign: 'center' }}>{s.data.title}</Serif>
            <TextBody color={colors.inkMute} style={{ fontSize: 14, textAlign: 'center' }}>
              {s.data.intro}
            </TextBody>
          </View>

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 14, paddingVertical: 4 }}>
              {flows.map((f) => (
                <View key={f.icon} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    <Ionicons name={f.icon} size={17} color={colors.flameDeep} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <TextSemi style={{ fontSize: 15 }}>{f.what}</TextSemi>
                    <TextBody color={colors.inkMute} style={{ fontSize: 13.5, lineHeight: 19 }}>{f.why}</TextBody>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: colors.cream, borderRadius: radius.md, padding: spacing.md, marginTop: 14, gap: 6 }}>
              <TextBody style={{ fontSize: 13, lineHeight: 19 }}>
                {s.data.neverSell}
              </TextBody>
            </View>
          </ScrollView>

          {/* The ONLY path that grants consent. */}
          <Tap onPress={onAccept}>
            <View style={{ height: 54, borderRadius: radius.md, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>{s.agree}</TextSemi>
            </View>
          </Tap>

          <Tap haptic={false} onPress={onDecline} style={{ alignItems: 'center', paddingVertical: 2 }}>
            <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>{s.notNow}</TextMed>
          </Tap>

          {/* An ADDITION to the disclosure above, never a substitute for it (rule 3). */}
          <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.inkMute}>
            {s.fullDetails.prefix}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/privacy-policy')}>{s.fullDetails.privacy}</TextMed>
            {s.fullDetails.middle}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/terms')}>{s.fullDetails.terms}</TextMed>
            {s.fullDetails.suffix}
          </TextBody>
        </View>
      </View>
    </SafeModal>
  );
}
