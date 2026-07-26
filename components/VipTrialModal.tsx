import React from 'react';
import { View, Modal, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { ShineSweep } from './Fx';
import { PLUS_TRIAL_DAYS } from '../lib/vip';

// Gold is the membership accent, used only on the badge/foil here. The card body
// stays on the warm-ink surface so the gold reads as a real foil, never a wash.
const INK = colors.ink;
const GOLD = colors.gold;

const PERKS: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }[] = [
  { icon: 'flash', text: 'Priority morning delivery slots', color: colors.flameDeep },
  { icon: 'bicycle', text: 'Free delivery on every order', color: colors.blue },
  { icon: 'gift', text: 'Member-only offers and early access', color: colors.flame },
];

/** Plus free-trial popout. {days} free, then the monthly price. Honest, no fake
 *  savings; decline is a quiet "Maybe later". */
export function VipTrialModal({ visible, onAccept, onDeny }: { visible: boolean; onAccept: () => void; onDeny: () => void }) {
  if (!visible) return null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onDeny}>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Animated.View entering={FadeInDown.duration(340)} style={{ width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
          {/* Warm-ink luxe header with a gold foil number. */}
          <View style={{ backgroundColor: INK, padding: spacing.lg, alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(253,184,19,0.14)', borderWidth: 1.5, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="star" size={26} color={GOLD} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 52, fontFamily: fonts.serifBlack, ...tabular, color: GOLD, letterSpacing: -2 }}>{PLUS_TRIAL_DAYS}</Text>
              <Text style={{ fontSize: 16, fontFamily: fonts.sansBold, color: colors.white, letterSpacing: 1, marginBottom: 10, marginLeft: 6 }}>DAYS FREE</Text>
            </View>
            <Serif color={colors.white} style={{ fontSize: 20, textAlign: 'center' }}>of PARAG Plus</Serif>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13, textAlign: 'center' }}>On us. No card needed. Cancel anytime.</TextBody>
            <ShineSweep dur={3200} travel={360} bandWidth={90} delay={500} />
          </View>

          {/* Perks with solid icon badges (gold reserved for the header foil). */}
          <View style={{ padding: spacing.lg, gap: 14 }}>
            {PERKS.map((p) => (
              <View key={p.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.icon} size={18} color={colors.white} />
                </View>
                <TextMed style={{ flex: 1, fontSize: 14 }}>{p.text}</TextMed>
              </View>
            ))}

            <Tap onPress={onAccept} weight="medium" style={{ marginTop: 6 }}>
              <View style={{ height: 54, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>Start my {PLUS_TRIAL_DAYS}-day free trial</TextSemi>
                <ShineSweep dur={2400} travel={340} bandWidth={64} angle="16deg" delay={500} />
              </View>
            </Tap>

            <Tap haptic={false} onPress={onDeny} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>Maybe later</TextMed>
            </Tap>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
