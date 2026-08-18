import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, TextInput, Keyboard, Linking } from 'react-native';
import { SafeModal } from '../../components/SafeModal';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap } from '../../components/ui';
import { normalizeBatchCode } from '../../lib/milk';

const FRAME = Math.min(280, Dimensions.get('window').width - 80);
const MASK = 'rgba(18,10,6,0.6)';

// The pack label carries the batch code as a QR and/or a 1D barcode, so read
// every common symbology, not just QR.
const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'codabar', 'itf14'];

export default function Traceability() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const handled = useRef(false);
  const scan = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      handled.current = false; // re-arm so a second scan works on return
      scan.value = withRepeat(withSequence(
        withTiming(FRAME - 12, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      ), -1, false);
      // Deliberately NO requestPermission() here. Firing the system camera alert
      // the instant the tab is opened gives the member no context for the ask
      // (Guideline 5.1.1), and a reflexive "Don't Allow" permanently bricks the
      // scanner for the rest of the session — including for an App Review tester.
      // The "Allow camera" button further down this screen is the trigger, and it
      // explains why we need it first.
      return () => { setFocused(false); setTorch(false); cancelAnimation(scan); };
    }, [permission?.granted, requestPermission, scan])
  );

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value }] }));

  // Open the passport for a scanned/typed code. know-your-milk normalizes again
  // and resolves the batch via lib/milk.
  const open = useCallback((raw: string | null) => {
    router.push(raw ? { pathname: '/know-your-milk', params: { code: raw } } : '/know-your-milk');
  }, [router]);

  const onScan = useCallback(({ data }: { data?: string }) => {
    if (handled.current) return;
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    open(normalizeBatchCode(data ?? '') ?? ((data ?? '').trim() || null));
  }, [open]);

  const submitManual = useCallback(() => {
    const c = code.trim();
    if (!c) return;
    Keyboard.dismiss();
    setManual(false);
    setCode('');
    open(c);
  }, [code, open]);

  const enterModal = (
    <SafeModal visible={manual} transparent animationType="fade" onRequestClose={() => setManual(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md }}>
          <Serif style={{ fontSize: 22 }}>Enter batch code</Serif>
          <TextBody color={colors.inkMute} style={{ fontSize: 13 }}>It is printed on your pack near the MFG and best-before date.</TextBody>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Batch code from your pack"
            placeholderTextColor={colors.inkMute}
            returnKeyType="search"
            onSubmitEditing={submitManual}
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink, letterSpacing: 0.5 }}
          />
          <Button title="Trace my milk" onPress={submitManual} style={{ alignSelf: 'stretch' }} />
          <Tap haptic={false} onPress={() => { setManual(false); Keyboard.dismiss(); }} style={{ alignSelf: 'center' }}>
            <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Cancel</TextMed>
          </Tap>
        </View>
      </View>
    </SafeModal>
  );

  if (!permission || !permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="barcode-outline" size={36} color={colors.flameDeep} />
        </View>
        <Serif style={{ fontSize: 25, textAlign: 'center' }}>Know your milk</Serif>
        <TextBody style={{ textAlign: 'center' }}>Scan the QR or barcode on your pack, or type the batch code printed on it, to see the member dairy union and the quality tests behind it.</TextBody>
        {permission && !permission.granted && permission.canAskAgain === false ? (
          // Permanently denied — requestPermission() would no-op, so send them to Settings.
          <Button title="Open settings to allow camera" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch' }} />
        ) : (
          <Button title="Allow camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        )}
        <Tap haptic={false} onPress={() => setManual(true)}>
          <TextMed color={colors.flameDeep} style={{ fontSize: 14 }}>Enter the batch code instead</TextMed>
        </Tap>
        <Tap haptic={false} onPress={() => router.push('/know-your-milk')}>
          <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>How cooperative tracing works</TextMed>
        </Tap>
        {enterModal}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }} onBarcodeScanned={onScan} />
      ) : null}

      <View style={{ flex: 1 }}>
        {/* Top mask + title */}
        <View style={{ flex: 1, backgroundColor: MASK, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 22, paddingTop: insets.top + 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="scan-outline" size={18} color={colors.flameSoft} />
            <TextSemi color={colors.white} style={{ fontSize: 19 }}>Know your milk</TextSemi>
          </View>
          <TextBody color="rgba(255,255,255,0.82)" style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>Point at the barcode or QR on your PYAAS pack</TextBody>
        </View>

        {/* Frame row */}
        <View style={{ flexDirection: 'row', height: FRAME }}>
          <View style={{ flex: 1, backgroundColor: MASK }} />
          <View style={{ width: FRAME, height: FRAME, overflow: 'hidden', borderRadius: radius.lg }}>
            <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
            <Animated.View style={[{ position: 'absolute', left: 14, right: 14, height: 2.5, borderRadius: 2, backgroundColor: colors.flameDeep }, lineStyle]} />
          </View>
          <View style={{ flex: 1, backgroundColor: MASK }} />
        </View>

        {/* Bottom mask + controls */}
        <View style={{ flex: 1.7, backgroundColor: MASK, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 22, paddingBottom: insets.bottom + 24 }}>
          <Tap onPress={() => setTorch((t) => !t)} accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'} accessibilityState={{ selected: torch }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: torch ? colors.white : 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={23} color={torch ? colors.flameDeep : colors.white} />
          </Tap>
          <TextBody color="rgba(255,255,255,0.6)" style={{ fontSize: 11.5, marginTop: 8 }}>{torch ? 'Torch on' : 'Tap for torch'}</TextBody>
          <Tap haptic={false} onPress={() => setManual(true)} style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <TextMed color={colors.white} style={{ fontSize: 14 }}>Enter code manually</TextMed>
          </Tap>
        </View>
      </View>
      {enterModal}
    </View>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const L = 34, T = 4;
  const base = { position: 'absolute' as const, width: L, height: L, borderColor: colors.white };
  const map: Record<string, object> = {
    tl: { top: 0, left: 0, borderTopWidth: T, borderLeftWidth: T, borderTopLeftRadius: 18 },
    tr: { top: 0, right: 0, borderTopWidth: T, borderRightWidth: T, borderTopRightRadius: 18 },
    bl: { bottom: 0, left: 0, borderBottomWidth: T, borderLeftWidth: T, borderBottomLeftRadius: 18 },
    br: { bottom: 0, right: 0, borderBottomWidth: T, borderRightWidth: T, borderBottomRightRadius: 18 },
  };
  return <View style={[base, map[pos]]} />;
}
