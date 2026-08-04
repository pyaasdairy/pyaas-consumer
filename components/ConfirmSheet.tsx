import React from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadow } from '../lib/theme';
import { TextSemi, TextBody, Button, Tap } from './ui';

export type ConfirmConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
};

/**
 * Branded confirm sheet — a white card with pink accents that slides up from the
 * bottom, matching the app's other bottom sheets. Replaces the OS Alert so the
 * cancel / pause / vacation prompts feel like PYAAS, not like a system dialog.
 * Controlled: pass a `config` to show it, `null` to hide. Tapping the dim
 * backdrop or the secondary button dismisses without firing `onConfirm`.
 */
export function ConfirmSheet({ config, onDismiss }: { config: ConfirmConfig | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!config} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Tap haptic={false} onPress={onDismiss} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(46,35,41,0.45)' }}>
          <View />
        </Tap>
        {config ? (
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: spacing.lg,
              paddingTop: 12,
              paddingBottom: insets.bottom + spacing.lg,
              gap: 12,
              ...shadow.card,
            }}
          >
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.flameSoft, marginBottom: 6 }} />
            <View style={{ alignSelf: 'center', width: 54, height: 54, borderRadius: 27, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Ionicons name={config.icon ?? 'help-circle-outline'} size={28} color={colors.flameDeep} />
            </View>
            <TextSemi style={{ fontSize: 19, textAlign: 'center' }}>{config.title}</TextSemi>
            <TextBody style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }} color={colors.inkSoft}>
              {config.message}
            </TextBody>
            <View style={{ gap: 10, marginTop: 6 }}>
              <Button title={config.confirmLabel} onPress={config.onConfirm} />
              <Button title={config.cancelLabel ?? 'Not now'} variant="ghost" onPress={onDismiss} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
