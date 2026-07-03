import React from 'react';
import { View, Modal, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { VIP_TRIAL_DAYS } from '../lib/pricing';
import { ShineSweep } from './VipFx';

const INK = '#2A1018';
const GOLD = '#F4D061';
const GOLD_DEEP = '#C9A24B';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }[] = [
  { icon: 'pricetags', text: 'Member prices on every product', color: GOLD_DEEP },
  { icon: 'flash', text: 'Priority morning delivery slots', color: colors.roseDeep },
  { icon: 'gift', text: 'Exclusive founding-family offers', color: colors.rose },
];

/** VIP trial popout. 120 days free; decline with "No thanks, I'm rich". */
export function VipTrialModal({ visible, onAccept, onDeny }: { visible: boolean; onAccept: () => void; onDeny: () => void }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDeny}>
      <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Animated.View entering={FadeInDown.duration(340)} style={{ width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
          {/* Dark luxe header · solid INK, gold foil "120" */}
          <View style={{ backgroundColor: INK, padding: spacing.lg, alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(244,208,97,0.14)', borderWidth: 1.5, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="diamond" size={26} color={GOLD} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 52, fontFamily: fonts.serifBlack, ...tabular, color: GOLD, letterSpacing: -2 }}>{VIP_TRIAL_DAYS}</Text>
              <Text style={{ fontSize: 16, fontFamily: fonts.serifBlack, color: '#fff', letterSpacing: 1, marginBottom: 10, marginLeft: 6 }}>DAYS FREE</Text>
            </View>
            <Serif color={colors.white} style={{ fontSize: 20, textAlign: 'center' }}>of PYAAS VIP</Serif>
            <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 13, textAlign: 'center' }}>On us. No card needed. Cancel anytime.</TextBody>
            <ShineSweep dur={3200} travel={360} bandWidth={90} delay={500} />
          </View>

          {/* Perks · solid icon badges */}
          <View style={{ padding: spacing.lg, gap: 14 }}>
            {PERKS.map((p) => (
              <View key={p.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={p.icon} size={18} color="#fff" />
                </View>
                <TextMed style={{ flex: 1, fontSize: 14 }}>{p.text}</TextMed>
              </View>
            ))}

            <Tap onPress={onAccept} style={{ marginTop: 6 }}>
              <View style={{ height: 54, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.roseDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 16 }}>Start my {VIP_TRIAL_DAYS} days free</TextSemi>
                <ShineSweep dur={2400} travel={340} bandWidth={64} angle="16deg" delay={500} />
              </View>
            </Tap>

            <Tap haptic={false} onPress={onDeny} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 14 }}>No thanks, I’m rich</TextMed>
            </Tap>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
