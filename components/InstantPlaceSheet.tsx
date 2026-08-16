import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';

/**
 * INSTANT-LANE PLACE SHEET — "order now, pay on delivery", with a short
 * auto-place window.
 *
 * Flow: the member taps "Place order" on the cart, this sheet slides up with
 * the amount and address, and the confirm button fills over PLACE_GRACE_MS.
 * When the fill completes the order places itself; tapping Cancel (or the
 * Android back button, or the backdrop) stops it.
 *
 * WHY THIS IS OKAY under the consent rules this app was already enforced on,
 * and the three properties that keep it so:
 *   1. The affirmative action is the "Place order" tap that OPENED this sheet.
 *      The countdown is a cancel-grace on an action the member already took,
 *      not a zero-action commitment.
 *   2. NOTHING is charged at placement. Instant orders are COD: the member
 *      pays by UPI while the rider rides, or cash at the door. The wallet is
 *      never touched, so the worst case of a missed cancel is a phone call,
 *      not a debit.
 *   3. Every escape hatch cancels. Back button and backdrop tap both route to
 *      onCancel — dismissal is NEVER treated as confirmation.
 * If instant ever stops being pay-on-delivery, this auto-place pattern must be
 * removed in the same commit.
 */

const PLACE_GRACE_MS = 3000;

type Props = {
  visible: boolean;
  /** Rupees the rider will collect (or the member pays by UPI en route). */
  total: number;
  /** "Home" / "Flat" — the saved address label. */
  addressLabel: string;
  /** One-line address the order is going to. */
  addressText: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function InstantPlaceSheet({ visible, total, addressLabel, addressText, onConfirm, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(PLACE_GRACE_MS / 1000);
  const fill = useSharedValue(0);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The confirm can fire exactly once, whether from the timer or a manual tap
  // on the filling button — a race between the two must not place twice.
  const fired = useRef(false);

  const clearTimers = () => {
    if (placeTimer.current) { clearTimeout(placeTimer.current); placeTimer.current = null; }
    if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null; }
  };

  const confirmOnce = () => {
    if (fired.current) return;
    fired.current = true;
    clearTimers();
    haptics.confirm();
    onConfirm();
  };

  const cancel = () => {
    clearTimers();
    cancelAnimation(fill);
    haptics.press();
    onCancel();
  };

  useEffect(() => {
    if (!visible) { clearTimers(); fill.value = 0; return; }
    fired.current = false;
    setSecondsLeft(PLACE_GRACE_MS / 1000);
    fill.value = 0;
    fill.value = withTiming(1, { duration: PLACE_GRACE_MS, easing: Easing.linear });
    placeTimer.current = setTimeout(confirmOnce, PLACE_GRACE_MS);
    tickTimer.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={cancel}>
      {/* Backdrop tap = cancel. Cancelling is the safe direction; placing never is. */}
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={cancel}>
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
              ...shadow.card,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
            <View style={{ gap: 4 }}>
              <Serif style={{ fontSize: 24 }}>Placing your order</Serif>
              <TextBody color={colors.inkMute} style={{ fontSize: 13.5 }}>
                Nothing is charged now. Pay by UPI while we deliver, or cash at the door.
              </TextBody>
            </View>

            <View style={{ gap: 12, backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cash-outline" size={19} color={colors.flameDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 16 }}>{rupee(total)}</TextSemi>
                  <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }}>To pay on delivery</TextBody>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: colors.line }} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="home-outline" size={18} color={colors.flameDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 14.5 }}>Delivering to {addressLabel}</TextSemi>
                  <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }} numberOfLines={2}>{addressText}</TextBody>
                </View>
              </View>
            </View>

            {/* The auto-filling confirm. A tap places immediately; doing nothing
                places when the fill completes; Cancel below stops everything. */}
            <Tap onPress={confirmOnce} accessibilityLabel={`Place order now, placing automatically in ${secondsLeft} seconds`}>
              <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.flame, overflow: 'hidden', justifyContent: 'center', ...shadow.card }}>
                <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.flameDeep }, fillStyle]} />
                <View style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                  <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>Place order now</TextSemi>
                  <TextMed color={colors.white} style={{ fontSize: 13, opacity: 0.85 }}>· {secondsLeft}s</TextMed>
                </View>
              </View>
            </Tap>

            <Tap haptic={false} onPress={cancel} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <TextSemi color={colors.flameDeep} style={{ fontSize: 15 }}>Cancel order</TextSemi>
            </Tap>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
