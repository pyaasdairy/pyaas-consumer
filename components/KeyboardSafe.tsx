import React from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * KEYBOARD SAFE — one wrapper, one mechanism per platform.
 *
 * Android runs edge-to-edge (SDK 56 default), which quietly disables the
 * `adjustResize` window shrink the app used to rely on: with the keyboard up
 * nothing moved and inputs sat underneath it (seen on the emulator: sign-in
 * field fully covered). KeyboardAvoidingView's `padding` behaviour listens to
 * the keyboard events directly, so it works regardless of resize.
 *
 * iOS screens already lift their focused input via the ScrollView's
 * `automaticallyAdjustKeyboardInsets`; stacking a KAV on top would shift the
 * content twice, so here iOS gets a plain View.
 */
export function KeyboardSafe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  if (Platform.OS === 'android') {
    return <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>{children}</KeyboardAvoidingView>;
  }
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
