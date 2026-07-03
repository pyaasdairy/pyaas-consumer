import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Modal, TextInput, Keyboard } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap } from '../../components/ui';
import { normalizeBatchCode } from '../../lib/saathi';
import { warmOpsApi } from '../../lib/opsPassport';

const FRAME = Math.min(280, Dimensions.get('window').width - 80);
const MASK = 'rgba(18,6,12,0.6)';

// The label printer stamps the batch code as a 1D barcode and/or a QR of the
// plain code — read every common symbology, not just QR.
const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'codabar', 'itf14'];

export default function KnowYourMilkScanner() {
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
      warmOpsApi(); // wake the ops backend now so the passport resolves fast on scan
      scan.value = withRepeat(withSequence(
        withTiming(FRAME - 12, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      ), -1, false);
      if (!permission?.granted) requestPermission();
      return () => { setFocused(false); setTorch(false); cancelAnimation(scan); };
    }, [permission?.granted, requestPermission, scan])
  );

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value }] }));

  const open = useCallback((raw: string | null) => {
    // The batch code is the token; know-your-milk normalizes again + resolves
    // via /traceability/:batchCode.
    router.push(raw ? { pathname: '/know-your-milk', params: { token: raw } } : '/know-your-milk');
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
    <Modal visible={manual} transparent animationType="fade" onRequestClose={() => setManual(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,6,12,0.55)', justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md }}>
          <Serif style={{ fontSize: 22 }}>Enter batch code</Serif>
          <TextBody color={colors.inkMute} style={{ fontSize: 13 }}>It’s printed on your pack near the MFG/EXP date.</TextBody>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="PYAAS-LKO-20260612-M-007"
            placeholderTextColor={colors.inkMute}
            returnKeyType="search"
            onSubmitEditing={submitManual}
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink, letterSpacing: 0.5 }}
          />
          <Button title="Find my milk" onPress={submitManual} style={{ alignSelf: 'stretch' }} />
          <Tap haptic={false} onPress={() => { setManual(false); Keyboard.dismiss(); }} style={{ alignSelf: 'center' }}>
            <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Cancel</TextMed>
          </Tap>
        </View>
      </View>
    </Modal>
  );

  if (!permission || !permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.roseSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="barcode-outline" size={36} color={colors.roseDeep} />
        </View>
        <Serif style={{ fontSize: 25, textAlign: 'center' }}>Know your milk</Serif>
        <TextBody style={{ textAlign: 'center' }}>Scan the barcode on your pack, or type the batch code printed on it, to see the farmer, farm and lab test behind it.</TextBody>
        <Button title="Allow camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        <Tap haptic={false} onPress={() => setManual(true)}>
          <TextMed color={colors.roseDeep} style={{ fontSize: 14 }}>Enter the batch code instead</TextMed>
        </Tap>
        <Tap haptic={false} onPress={() => router.push('/know-your-milk')}>
          <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>View my latest milk passport</TextMed>
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
        {/* Top mask + title · hugs the frame; the frame sits above centre so the
            controls below never crowd the floating tab bar */}
        <View style={{ flex: 1, backgroundColor: MASK, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 22, paddingTop: insets.top + 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="scan-outline" size={18} color={colors.roseSoft} />
            <TextSemi color={colors.white} style={{ fontSize: 19 }}>Know your milk</TextSemi>
          </View>
          <TextBody color="rgba(255,255,255,0.82)" style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>Point at the barcode or QR on your PYAAS pack</TextBody>
        </View>

        {/* Frame row */}
        <View style={{ flexDirection: 'row', height: FRAME }}>
          <View style={{ flex: 1, backgroundColor: MASK }} />
          <View style={{ width: FRAME, height: FRAME, overflow: 'hidden', borderRadius: radius.lg }}>
            <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
            <Animated.View style={[{ position: 'absolute', left: 14, right: 14, height: 2.5, borderRadius: 2, backgroundColor: colors.roseDeep, shadowColor: colors.roseDeep, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }, lineStyle]} />
          </View>
          <View style={{ flex: 1, backgroundColor: MASK }} />
        </View>

        {/* Bottom mask + controls · hug the frame (symmetric with the title above),
            leaving clean space down to the floating tab bar */}
        <View style={{ flex: 1.7, backgroundColor: MASK, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 22, paddingBottom: insets.bottom + 24 }}>
          <Tap onPress={() => setTorch((t) => !t)} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: torch ? colors.white : 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={23} color={torch ? colors.roseDeep : colors.white} />
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
  const base: any = { position: 'absolute', width: L, height: L, borderColor: colors.white };
  const map: any = {
    tl: { top: 0, left: 0, borderTopWidth: T, borderLeftWidth: T, borderTopLeftRadius: 18 },
    tr: { top: 0, right: 0, borderTopWidth: T, borderRightWidth: T, borderTopRightRadius: 18 },
    bl: { bottom: 0, left: 0, borderBottomWidth: T, borderLeftWidth: T, borderBottomLeftRadius: 18 },
    br: { bottom: 0, right: 0, borderBottomWidth: T, borderRightWidth: T, borderBottomRightRadius: 18 },
  };
  return <View style={[base, map[pos]]} />;
}
