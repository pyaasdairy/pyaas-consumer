import React from 'react';
import { View, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';

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

/** One disclosed data flow: what we take, why, and who else sees it. */
const FLOWS: { icon: React.ComponentProps<typeof Ionicons>['name']; what: string; why: string }[] = [
  {
    // Names the SIM read explicitly. This is the exact capability Google
    // enforced on: the Play Services chooser reads the number off the SIM, and
    // because that API needs no Android permission the OS shows no dialog. If
    // the disclosure does not say it, nothing does.
    icon: 'call-outline',
    what: 'Your mobile number',
    why: 'Sent to PYAAS servers, and to our SMS provider, to text you a one-time code and create your account. If you tap "use the number on this phone", we read the number from your SIM so you do not have to type it.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    what: 'The sign-in code we text you',
    why: 'On Android we read that one message automatically so the code fills itself in. We cannot read any of your other messages.',
  },
  {
    icon: 'location-outline',
    what: 'Your delivery address and location',
    why: 'Stored on PYAAS servers so we know where to deliver. Only collected when you set an address or tap "use my location".',
  },
  {
    // The address-search field streams what you type to Google on a 250ms
    // debounce (lib/places.ts). That is a third-party recipient of address data,
    // and it was previously disclosed nowhere — the same defect shape that had
    // this app removed, on a second data type.
    icon: 'search-outline',
    what: 'What you type in address search',
    why: 'Sent to Google Maps as you type, so it can suggest real addresses. Skip it by picking your city and dropping a pin on the map instead.',
  },
  {
    // Tile requests carry z/x/y plus the IP, which tells OpenStreetMap which
    // block is on screen. leafletAssets.ts already inlines the Leaflet library
    // to remove one undisclosed third-party call; the tiles were the hole left
    // in that reasoning.
    icon: 'map-outline',
    what: 'The map, when you open it',
    why: 'Map images come from OpenStreetMap, so it can see roughly which area you are looking at.',
  },
  {
    icon: 'phone-portrait-outline',
    what: 'A device identifier',
    why: 'A random id stored on this phone, so a one-time offer cannot be claimed over and over on the same device. It is not your advertising id and we do not track you with it.',
  },
  {
    icon: 'receipt-outline',
    what: 'Your orders and wallet activity',
    why: 'Stored on PYAAS servers to run deliveries, subscriptions and refunds, and to issue your bills.',
  },
];

export function DataDisclosure({ visible, onAccept, onDecline }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Modal
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
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 23, textAlign: 'center' }}>Before you sign in</Serif>
            <TextBody color={colors.inkMute} style={{ fontSize: 14, textAlign: 'center' }}>
              Here is exactly what PYAAS collects, what we use it for, and who else sees it.
            </TextBody>
          </View>

          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 14, paddingVertical: 4 }}>
              {FLOWS.map((f) => (
                <View key={f.what} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
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
                We never sell your personal data. You can delete your account and its data at any
                time from your profile.
              </TextBody>
            </View>
          </ScrollView>

          {/* The ONLY path that grants consent. */}
          <Tap onPress={onAccept}>
            <View style={{ height: 54, borderRadius: radius.md, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Agree and continue</TextSemi>
            </View>
          </Tap>

          <Tap haptic={false} onPress={onDecline} style={{ alignItems: 'center', paddingVertical: 2 }}>
            <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Not now</TextMed>
          </Tap>

          {/* An ADDITION to the disclosure above, never a substitute for it (rule 3). */}
          <TextBody style={{ fontSize: 12, textAlign: 'center' }} color={colors.inkMute}>
            Full details in our{' '}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/privacy-policy')}>Privacy Policy</TextMed>
            {' '}and{' '}
            <TextMed color={colors.flameDeep} onPress={() => router.push('/terms')}>Terms</TextMed>.
          </TextBody>
        </View>
      </View>
    </Modal>
  );
}
