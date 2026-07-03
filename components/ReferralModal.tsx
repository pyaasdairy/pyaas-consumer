import React, { useState } from 'react';
import { View, Modal, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';

/** "Have a Referral Code?" bottom sheet, shown once after first login. */
export function ReferralModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!code.trim()) return;
    setBusy(true); setMsg('');
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        // Record the referrer's code (full ₹100 credit is granted at signup via
        // metadata; this stores it for users who add it afterwards).
        await supabase.from('profiles').update({ referred_by: code.trim().toUpperCase() }).eq('id', uid);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      setMsg('Could not apply that code.');
    } finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        <Animated.View entering={SlideInDown.duration(300)} style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, ...shadow.card }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line }} />
          <Serif style={{ fontSize: 22, textAlign: 'center' }}>Have a referral code?</Serif>
          <TextBody style={{ fontSize: 13.5, textAlign: 'center' }}>Add a friend’s code - they earn ₹100 in their PYAAS Wallet.</TextBody>

          <View style={{ borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 52, justifyContent: 'center' }}>
            <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Enter referral code" placeholderTextColor={colors.inkMute} style={{ fontFamily: fonts.sansMed, fontWeight: '500', fontSize: 16, color: colors.ink, letterSpacing: 1 }} />
          </View>
          {msg ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{msg}</TextBody> : null}

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Tap haptic={false} onPress={onClose} style={{ flex: 1, height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
              <TextSemi color={colors.inkSoft} style={{ fontSize: 15 }}>Skip</TextSemi>
            </Tap>
            <Tap onPress={apply} style={{ flex: 1 }}>
              <LinearGradient colors={[colors.roseDeep, colors.rose]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: code.trim() && !busy ? 1 : 0.6 }}>
                <TextSemi color={colors.white} style={{ fontSize: 15 }}>Apply</TextSemi>
              </LinearGradient>
            </Tap>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
