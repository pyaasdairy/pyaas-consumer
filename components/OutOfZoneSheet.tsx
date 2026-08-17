import React from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';

/**
 * OUT-OF-ZONE POPOUT — one plain statement, one tap, move on. Shown once per
 * explicitly-set unserviceable location (the caller persists the ack); the
 * browse-only shop stays fully usable behind and after it.
 */
export function OutOfZoneSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

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
            <Serif style={{ fontSize: 23, textAlign: 'center' }}>We're unserviceable here</Serif>
            <TextBody color={colors.inkMute} style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 }}>
              PYAAS doesn't deliver at this location yet. You can still look around. Ordering opens the day we reach you.
            </TextBody>

            <Tap onPress={() => { haptics.press(); onClose(); }} style={{ alignSelf: 'stretch' }}>
              <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>Continue</TextSemi>
              </View>
            </Tap>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
