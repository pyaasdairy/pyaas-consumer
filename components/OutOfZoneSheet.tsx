import React from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { useUserLocation } from '../lib/userLocation';
import { useServiceability } from '../lib/serviceability';

// The launch zone the switch button jumps to. Mirrors lib/serviceability's
// SERVICE_AREA default (Sushant Golf City, Lucknow).
const ZONE = { lat: 26.7715, lng: 81.0176, city: 'Lucknow', label: 'Golf City, Lucknow' };

/**
 * OUT-OF-ZONE POPOUT — slides up the moment a member's picked location
 * resolves unserviceable. One clear ask: switch to the launch zone (which
 * un-greys the whole shop), or keep browsing where they are. Dismissal is
 * always available (backdrop, back button, Not now) — it is a nudge, not a
 * wall; the browse-only shop stays fully usable behind it.
 */
export function OutOfZoneSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const setFromAddress = useUserLocation((s) => s.setFromAddress);
  const svcCheck = useServiceability((s) => s.check);

  const switchToZone = async () => {
    haptics.press();
    // A zone-centre jump is browsing intent, not an exact door (exact: false —
    // the address flow still captures the real pin before any delivery).
    await setFromAddress(ZONE.city, { lat: ZONE.lat, lng: ZONE.lng }, false);
    await svcCheck({ force: true });
    onClose();
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => { /* swallow taps inside the card */ }}>
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: insets.bottom + spacing.lg,
              gap: spacing.md,
              alignItems: 'center',
              ...shadow.card,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sad-outline" size={34} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 23, textAlign: 'center' }}>We're not here yet</Serif>
            <TextBody color={colors.inkMute} style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 }}>
              PYAAS doesn't deliver at this location yet. We're live in Sushant Golf City, Lucknow, and expanding fast.
            </TextBody>

            <Tap onPress={() => { void switchToZone(); }} style={{ alignSelf: 'stretch' }}>
              <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                <Ionicons name="location" size={18} color={colors.white} />
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>Switch to {ZONE.label}</TextSemi>
              </View>
            </Tap>

            <Tap haptic={false} onPress={onClose} style={{ alignItems: 'center', paddingVertical: 2 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Not now, keep browsing</TextMed>
            </Tap>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
