import React, { useEffect, useState } from 'react';
import { View, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [rows, setRows] = useState<Address[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let on = true;
    listAddresses().then((r) => { if (on) setRows(r); }).catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, [visible]);

  async function pick(a: Address) {
    if (busyId) return;
    setBusyId(a.id);
    haptics.select();
    try {
      await setDefaultAddress(a.id);
      onPicked(a);
    } finally {
      setBusyId(null);
    }
  }

  const card = (
    <Pressable onPress={() => { /* swallow taps inside the card */ }}>
      <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: '75%', gap: spacing.md, ...shadow.card }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        <Serif style={{ fontSize: 22 }}>Deliver to</Serif>

        <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
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
                  {a.is_default ? <Ionicons name="checkmark-circle" size={20} color={colors.flameDeep} /> : null}
                </View>
              </Tap>
            ))}
            {rows.length === 0 ? (
              <TextBody color={colors.inkMute} style={{ fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                No saved addresses yet. Add your first one below.
              </TextBody>
            ) : null}
          </View>
        </ScrollView>

        <Tap haptic={false} onPress={() => { haptics.press(); onAddNew(); }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, backgroundColor: colors.white }}>
            <Ionicons name="add" size={18} color={colors.flameDeep} />
            <TextMed color={colors.flameDeep} style={{ fontSize: 14.5 }}>Add a new address</TextMed>
          </View>
        </Tap>
      </View>
    </Pressable>
  );

  if (embedded) {
    if (!visible) return null;
    return (
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }]} onPress={onClose}>
        {card}
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,10,6,0.55)', justifyContent: 'flex-end' }} onPress={onClose}>
        {card}
      </Pressable>
    </Modal>
  );
}
