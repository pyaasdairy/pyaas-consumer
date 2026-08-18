import React from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { recordLocationDisclosureAccepted } from '../lib/locationConsent';

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

  function agree() {
    haptics.confirm();
    void recordLocationDisclosureAccepted();
    onAgree();
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onDecline}>
      {/* Backdrop tap = decline, never consent. */}
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onDecline}>
        <Pressable onPress={() => { /* swallow taps inside the card */ }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md, ...shadow.card }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
            <View style={{ alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location-outline" size={32} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 22, textAlign: 'center' }}>Your location</Serif>

            <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21 }}>
              PYAAS collects your precise device location, only while you use the app and only when you tap a location button, to pin your exact delivery doorstep, check that we deliver in your area, and route your morning delivery.
            </TextBody>
            <TextBody color={colors.inkSoft} style={{ fontSize: 14, lineHeight: 21 }}>
              The point you choose is sent to and stored on PYAAS servers as your saved delivery address. It is never sold, never used for advertising, and never read in the background. We use precise location because a doorstep delivery needs an exact pin, not a neighbourhood.
            </TextBody>

            <Tap onPress={agree} style={{ alignSelf: 'stretch' }}>
              <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>Agree and continue</TextSemi>
              </View>
            </Tap>
            <Tap haptic={false} onPress={onDecline} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Not now</TextMed>
            </Tap>
            <TextBody color={colors.inkMute} style={{ fontSize: 11.5, textAlign: 'center' }}>
              You can always type your address or pick your city instead.
            </TextBody>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
