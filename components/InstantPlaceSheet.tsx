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
 * TWO PAYMENT METHODS, TWO BEHAVIOURS — and the split is load-bearing:
 *
 *   COD    → the 3-second auto-place runs. Defensible because (1) the
 *            affirmative action is the "Place order" tap that OPENED this
 *            sheet, so the countdown is a cancel-grace, not a zero-action
 *            commitment; (2) NOTHING is charged at placement — a missed
 *            cancel costs a phone call, not money; (3) every escape hatch
 *            (back button, backdrop) cancels, never confirms.
 *   WALLET → NO auto-place. Placing debits real balance immediately, and a
 *            timer that takes money on its own is precisely the dark pattern
 *            the consent rules exist to stop. The member must tap
 *            "Place and pay" themselves.
 *
 * Do not merge the two paths: if a future payment method moves money at
 * placement, it takes the wallet behaviour, never the COD one.
 */

const PLACE_GRACE_MS = 3000;

type Props = {
  visible: boolean;
  /** How this order is paid. Drives the auto-place split documented above. */
  method: 'wallet' | 'cod';
  /** Rupees debited from the wallet at placement, or collected on delivery. */
  total: number;
  /** "Home" / "Flat" — the saved address label. */
  addressLabel: string;
  /** One-line address the order is going to. */
  addressText: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function InstantPlaceSheet({ visible, method, total, addressLabel, addressText, onConfirm, onCancel }: Props) {
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
    fill.value = 0;
    // WALLET debits at placement, so it NEVER auto-places — explicit tap only.
    if (method !== 'cod') return clearTimers;
    setSecondsLeft(PLACE_GRACE_MS / 1000);
    fill.value = withTiming(1, { duration: PLACE_GRACE_MS, easing: Easing.linear });
    placeTimer.current = setTimeout(confirmOnce, PLACE_GRACE_MS);
    tickTimer.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, method]);

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
                {method === 'wallet'
                  ? `${rupee(total)} is paid from your PYAAS Wallet when you place. Cancel before pickup and it comes straight back.`
                  : 'Nothing is charged now. Pay by UPI while we deliver, or cash at the door.'}
              </TextBody>
            </View>

            <View style={{ gap: 12, backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cash-outline" size={19} color={colors.flameDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextSemi style={{ fontSize: 16 }}>{rupee(total)}</TextSemi>
                  <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }}>
                    {method === 'wallet' ? 'From your PYAAS Wallet' : 'To pay on delivery'}
                  </TextBody>
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

            {/* COD: the auto-filling confirm — a tap places immediately, doing
                nothing places when the fill completes. WALLET: a plain button;
                only an explicit tap moves money. */}
            <Tap
              onPress={confirmOnce}
              accessibilityLabel={method === 'cod'
                ? `Place order now, placing automatically in ${secondsLeft} seconds`
                : `Place order and pay ${total} rupees from your wallet`}
            >
              <View style={{ height: 56, borderRadius: radius.pill, backgroundColor: method === 'cod' ? colors.flame : colors.flameDeep, overflow: 'hidden', justifyContent: 'center', ...shadow.card }}>
                {method === 'cod' ? (
                  <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.flameDeep }, fillStyle]} />
                ) : null}
                <View style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                  <TextSemi color={colors.white} style={{ fontSize: 16.5 }}>
                    {method === 'wallet' ? `Place and pay ${rupee(total)}` : 'Place order now'}
                  </TextSemi>
                  {method === 'cod' ? (
                    <TextMed color={colors.white} style={{ fontSize: 13, opacity: 0.85 }}>· {secondsLeft}s</TextMed>
                  ) : null}
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
