import React, { useEffect, useRef } from 'react';
import { Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
import { colors } from '../lib/theme';

const LOGO_W = 220;
const LOGO_RATIO = 317 / 1127; // pyaas-logo-white-trim.png aspect (w:h)

/**
 * Branded launch splash: solid brand pink with the white PYAAS wordmark and
 * nothing else, matching the native splash exactly so the hand-off is a single
 * smooth cross-fade. The wordmark starts at roughly the native-splash size and
 * settles in (it never blinks from opacity 0).
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const logoScale = useSharedValue(0.92);
  const fade = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) });
  }, [logoScale]);

  // Arm the fade-out exactly once when ready first flips true. onDone is read
  // from a ref so a re-render (e.g. a route change) can never restart the fade.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    fade.value = withDelay(120, withTiming(0, { duration: 520, easing: Easing.inOut(Easing.ease) }, (finished) => {
      if (finished) runOnJS(onDoneRef.current)();
    }));
  }, [ready, fade]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }, overlayStyle]}
    >
      <Animated.View style={logoStyle}>
        <Image
          source={require('../assets/pyaas-logo-white-trim.png')}
          style={{ width: LOGO_W, height: LOGO_W * LOGO_RATIO }}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}
