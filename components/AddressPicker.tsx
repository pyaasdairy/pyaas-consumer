import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeModal } from './SafeModal';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { listAddresses, setDefaultAddress, type Address } from '../lib/api';

/**
 * SAVED-ADDRESS PICKER — the ordering flows show the member their saved
 * addresses and let them choose (or add a new one) instead of silently using
 * the default or reopening a blank capture form. Picking sets the default and
 * hands the row back; "Add a new address" defers to the caller's capture flow.
 *
 * `embedded` renders the picker as an absolute overlay INSIDE the caller's own
 * Modal instead of presenting a second native Modal. iOS silently drops a
 * modal presented while another is mid-dismissal, so any caller that itself
 * lives in a Modal (SubscribeSheet) MUST use embedded mode; full screens
 * (cart) keep the default Modal presentation.
 */

// ONLY rows with a real map pin: the delivery flows (sheet gate, sweep)
// all require coordinates, so offering a pin-less row here would show
// "Delivering to X" while the morning order silently ships elsewhere.
const hasPin = (a: Address) => {
  const g = a as unknown as { lat?: number | null; lng?: number | null };
  return g.lat != null && g.lng != null;
};

// The last fetched rows outlive one open/close, so reopening paints the saved
// addresses on the FIRST frame — the network pass only freshens them.
let cachedRows: Address[] | null = null;

export function AddressPicker({
  visible,
  onClose,
  onPicked,
  onAddNew,
  embedded = false,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen (now-default) address. */
  onPicked: (a: Address) => void;
  /** Open the full capture flow for a brand-new address. */
  onAddNew: () => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Address[]>(cachedRows ?? []);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let on = true;
    setBusyId(null);
    if (cachedRows) setRows(cachedRows);
    listAddresses()
      .then((r) => {
        const withPin = r.filter(hasPin);
        cachedRows = withPin;
        if (on) setRows(withPin);
      })
      .catch(() => { if (on && !cachedRows) setRows([]); });
    return () => { on = false; };
  }, [visible]);

  async function pick(a: Address) {
    if (busyId) return;
    setBusyId(a.id); // the chosen row shows its spinner on THIS frame
    haptics.select();
    try {
      await setDefaultAddress(a.id);
      onPicked(a);
    } catch {
      // Setting the default failed (offline blip) — stay open, let them retry.
    } finally {
      setBusyId(null);
    }
  }

  // The card is a DIRECT child of the full-height backdrop so its %-maxHeight
  // resolves against a definite height. The previous shape (an auto-height
  // tap-swallow Pressable AROUND a %-maxHeight View) left the percentage with
  // no definite parent — Yoga collapsed the inner ScrollView to a sliver and
  // the saved addresses were clipped invisible under the "Deliver to" title,
  // with dead empty space below. flexGrow:0 + flexShrink:1 lets the list hug
  // its content and shrink only when it would overflow the card.
  const card = (
    <Animated.View
      entering={embedded ? FadeInDown.duration(240) : undefined}
      onStartShouldSetResponder={() => true} // swallow taps inside the card
      style={{ backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: '78%', gap: spacing.md, ...shadow.card }}
    >
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
      <Serif style={{ fontSize: 22 }}>Deliver to</Serif>

      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {rows.map((a) => (
          <Tap key={a.id} haptic={false} onPress={() => { void pick(a); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: a.is_default ? colors.flameDeep : colors.line, backgroundColor: a.is_default ? colors.flameSoft : colors.white, borderRadius: radius.lg, padding: spacing.md, opacity: busyId && busyId !== a.id ? 0.6 : 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
                <Ionicons name={a.label?.toLowerCase().includes('work') ? 'briefcase-outline' : 'home-outline'} size={18} color={colors.flameDeep} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextSemi style={{ fontSize: 14.5 }} numberOfLines={1}>{a.label}{a.is_default ? ' · current' : ''}</TextSemi>
                <TextBody color={colors.inkMute} style={{ fontSize: 12.5 }} numberOfLines={2}>
                  {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} - {a.pincode}
                </TextBody>
              </View>
              {busyId === a.id ? (
                <ActivityIndicator size="small" color={colors.flameDeep} />
              ) : a.is_default ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.flameDeep} />
              ) : null}
            </View>
          </Tap>
        ))}
        {rows.length === 0 ? (
          <TextBody color={colors.inkMute} style={{ fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
            No saved addresses yet. Add your first one below.
          </TextBody>
        ) : null}
      </ScrollView>

      <Tap haptic={false} onPress={() => { haptics.press(); onAddNew(); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, backgroundColor: colors.white }}>
          <Ionicons name="add" size={18} color={colors.flameDeep} />
          <TextMed color={colors.flameDeep} style={{ fontSize: 14.5 }}>Add a new address</TextMed>
        </View>
      </Tap>
    </Animated.View>
  );

  if (embedded) {
    if (!visible) return null;
    // zIndex for iOS stacking, elevation for Android paint order — the sheet
    // body behind carries elevation 6 (shadow.card) and would otherwise draw
    // OVER this overlay on Android, leaving the picker invisible.
    return (
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { zIndex: 20, elevation: 20 }]}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
          {card}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <SafeModal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
        {card}
      </Pressable>
    </SafeModal>
  );
}
