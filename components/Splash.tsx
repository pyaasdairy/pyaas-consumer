import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, Easing, runOnJS } from 'react-native-reanimated';
import { colors } from '../lib/theme';

const LOGO_W = 240;
const LOGO_RATIO = 317 / 1127; // pyaas-logo-white-trim.png aspect (h/w)
const LOGO_H = LOGO_W * LOGO_RATIO;
// The write-on: PYAAS appears left to right over ~1.8s, then a soft settle.
const WRITE_MS = 1800;
const WRITE_DELAY_MS = 180;

/**
 * Branded launch splash — the wordmark WRITES ITSELF onto a solid brand-pink
 * field.
 *
 * Why this shape: the native splash is now a PLAIN #F36CB5 field (the
 * expo-splash-screen image is a transparent png), because Android 12+ masks
 * the native splash image to a circle and was clipping the wide PYAAS
 * wordmark — the "cut out PYAAS" launch glitch. A pure colour field has
 * nothing to clip on any OS, so the native → JS hand-off is invisible: pink
 * to identical pink. This component then plays the brand moment: the wordmark
 * reveals left-to-right (a clipping wipe, like being written), settles with a
 * breath of scale, and cross-fades into the app once it is ready.
 *
 * The background hex must stay EXACTLY in sync with the expo-splash-screen
 * plugin backgroundColor in app.json (#F36CB5 = colors.flameDeep) — any drift
 * reintroduces a visible colour jump at hand-off.
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reveal = useSharedValue(0);   // 0 → 1: the left-to-right write-on
  const settle = useSharedValue(0);   // post-write breath (scale 1 → 1.015 → 1)
  const fade = useSharedValue(1);     // overlay opacity for the exit
  const [writeDone, setWriteDone] = useState(false);

  useEffect(() => {
    reveal.value = withDelay(
      WRITE_DELAY_MS,
      // NOTE: no `if (finished)` guard. An interrupted timing reports
      // finished=false — which happens routinely when iOS backgrounds the app
      // during a cold start — and gating writeDone on it left the overlay
      // mounted forever, i.e. a pink screen the app never came back from.
      withTiming(1, { duration: WRITE_MS, easing: Easing.inOut(Easing.cubic) }, () => {
        runOnJS(setWriteDone)(true);
      }),
    );
    // Belt and braces: if the animation is cancelled outright its callback may
    // never run at all, so writeDone must not depend solely on Reanimated.
    const watchdog = setTimeout(
      () => setWriteDone(true),
      WRITE_DELAY_MS + WRITE_MS + 400,
    );
    return () => clearTimeout(watchdog);
  }, [reveal]);

  // The settle plays once, right as the last letter lands.
  useEffect(() => {
    if (!writeDone) return;
    settle.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
    );
  }, [writeDone, settle]);

  // Exit only after BOTH the app is ready AND the write-on has finished — the
  // brand moment always completes; it is never cut. onDone via a ref so a
  // re-render can't restart the fade.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const started = useRef(false);
  useEffect(() => {
    if (!ready || !writeDone || started.current) return;
    started.current = true;
    // Same reasoning as the write-on: an interrupted fade must still hand the
    // app back, otherwise the overlay outlives the animation that hides it.
    fade.value = withDelay(160, withTiming(0, { duration: 480, easing: Easing.inOut(Easing.ease) }, () => {
      runOnJS(onDoneRef.current)();
    }));
  }, [ready, writeDone, fade]);

  // ABSOLUTE BACKSTOP. This overlay covers a fully working app, so no animation
  // outcome may be allowed to strand the user on it. Whatever happens above,
  // hand control back. Cheap insurance against a class of bug that presents to
  // the user as "the app froze on launch".
  useEffect(() => {
    const bail = setTimeout(() => {
      started.current = true;
      onDoneRef.current();
    }, WRITE_DELAY_MS + WRITE_MS + 2500);
    return () => clearTimeout(bail);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const wipeStyle = useAnimatedStyle(() => ({ width: reveal.value * LOGO_W }));
  const settleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + settle.value * 0.015 }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }, overlayStyle]}
    >
      <Animated.View style={settleStyle}>
        {/* Fixed-size stage so the reveal clips inside it and nothing reflows. */}
        <View style={{ width: LOGO_W, height: LOGO_H }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: LOGO_H, overflow: 'hidden' }, wipeStyle]}>
            {/* The image keeps its FULL width inside the clipping window, so
                letters emerge in place, left to right — written, not stretched. */}
            <Image
              source={require('../assets/pyaas-logo-white-trim.png')}
              style={{ width: LOGO_W, height: LOGO_H }}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
