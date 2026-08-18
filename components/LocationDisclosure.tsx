import React from 'react';
import { View, Pressable } from 'react-native';
import { SafeModal } from './SafeModal';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { recordLocationDisclosureAccepted } from '../lib/locationConsent';
import { DiscLangToggle } from './DataDisclosure';
import { discStrings, getDiscLang, useDiscLang } from '../lib/i18n';

/**
 * LOCATION PROMINENT DISCLOSURE sheet. Shown ONCE, immediately before the
 * first OS location-permission prompt (Play User Data / Permissions policy:
 * the runtime request must be immediately preceded by an in-app disclosure
 * with an affirmative action; navigating away is never consent).
 *
 * Truthful scope, mirrored from what the code actually does:
 *  - PRECISE (fine) location, foreground only, only when the member taps a
 *    location button. There is no background collection anywhere in the app.
 *  - Used to pin the exact delivery doorstep, check serviceability, and
 *    route the morning delivery. Precise rather than approximate because a
 *    doorstep delivery needs an exact pin, not a neighbourhood.
 *  - The chosen point is sent to and stored on PYAAS servers as the saved
 *    delivery address. Never sold, never used for advertising.
 *
 * "Not now" is a genuine decline: the sheet closes, no OS prompt fires, and
 * every flow still works by typing an address or picking a city instead.
 */
export function LocationDisclosure({
  visible,
  onAgree,
  onDecline,
}: {
  visible: boolean;
  /** Record acceptance, then the caller may fire the OS permission prompt. */
  onAgree: () => void;
  /** Close with NO permission prompt; typed address / city pick still work. */
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Shared disclosure language (lib/i18n) — same store as the sign-in
  // disclosures, so the sheet appears in whichever language the member chose.
  const s = discStrings(useDiscLang());

  function agree() {
    haptics.confirm();
    // Record WHICH language the sheet was showing at the moment of the tap.
    void recordLocationDisclosureAccepted(getDiscLang());
    onAgree();
  }

  return (
    <SafeModal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onDecline}>
      {/* Backdrop tap = decline, never consent. */}
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onDecline}>
        <Pressable onPress={() => { /* swallow taps inside the card */ }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md, ...shadow.card }}>
            {/* Language switch, top-right — same shared store as the sign-in
                disclosures, so one choice follows the member everywhere. */}
            <View style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2 }}>
              <DiscLangToggle />
            </View>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
            <View style={{ alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location-outline" size={32} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 22, textAlign: 'center' }}>{s.location.title}</Serif>

            <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21 }}>
              {s.location.para1}
            </TextBody>
            <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21 }}>
              {s.location.para2}
            </TextBody>

            <Tap onPress={agree} style={{ alignSelf: 'stretch' }}>
              <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>{s.agree}</TextSemi>
              </View>
            </Tap>
            <Tap haptic={false} onPress={onDecline} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>{s.notNow}</TextMed>
            </Tap>
            <TextBody color={colors.inkMute} style={{ fontSize: 11.5, textAlign: 'center' }}>
              {s.location.fallback}
            </TextBody>
          </View>
        </Pressable>
      </Pressable>
    </SafeModal>
  );
}
