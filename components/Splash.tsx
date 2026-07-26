import React, { useEffect, useRef } from 'react';
import { Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
import { colors } from '../lib/theme';

const BADGE = 168; // white badge that holds the colourful PARAG sunburst logo

/**
 * Branded launch splash. Overlays the app and fades out when it's ready, so the
 * hand-off is a single smooth cross-fade · no second flash. The logo starts at
 * roughly the native-splash size and grows in (it never blinks from opacity 0,
 * which is what made it look like it flashed twice).
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const logoScale = useSharedValue(0.64); // ≈ native wordmark size → grows to full
  const tagOpacity = useSharedValue(0);
  const tagY = useSharedValue(10);
  const fade = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) });
    tagOpacity.value = withDelay(380, withTiming(1, { duration: 480 }));
    tagY.value = withDelay(380, withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [logoScale, tagOpacity, tagY]);

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
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.value, transform: [{ translateY: tagY.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }, overlayStyle]}
    >
      <Animated.View style={logoStyle}>
        <Image
          source={require('../assets/parag-logo.png')}
          style={{ width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: colors.white }}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[{ position: 'absolute', top: '62%', color: 'rgba(255,255,255,0.92)', fontWeight: '600', fontSize: 13, letterSpacing: 2.5 }, tagStyle]}>
        PURE · NATURAL · GOOD HEALTH
      </Animated.Text>
    </Animated.View>
  );
}
