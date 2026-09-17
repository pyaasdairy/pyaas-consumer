import React, { useEffect, useState } from 'react';
import { View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radius, rupee, shadow, spacing, tabular } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import {
  AMOUNT_CHOICES,
  THRESHOLD_CHOICES,
  hydrateAutoTopup,
  setAutoTopup,
  useAutoTopup,
} from '../lib/autoTopup';

/**
 * AUTO TOP-UP CARD — offered BEFORE the custom-amount box on both the wallet
 * and the recharge screen, so the member's first option is "never think about
 * this again" rather than "type a number".
 *
 * The promise is deliberately the one the app can keep today: we watch the
 * balance and tell you the moment it dips, with a one-tap recharge for the
 * amount you chose. See lib/autoTopup for why this is a watch and not a UPI
 * mandate yet, and what the co-dev has to wire to make it one.
 */
export function AutoTopupCard() {
  const prefs = useAutoTopup();
  const [open, setOpen] = useState(false);

  useEffect(() => { void hydrateAutoTopup(); }, []);

  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: prefs.on ? colors.flameDeep : colors.line, padding: spacing.md, gap: 10, ...shadow.soft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="repeat" size={19} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextSemi style={{ fontSize: 15 }}>Auto top-up</TextSemi>
          <TextBody style={{ fontSize: 12 }} color={colors.inkSoft} numberOfLines={2}>
            {prefs.on
              ? `On · we tell you below ${rupee(prefs.threshold)}, ready to add ${rupee(prefs.amount)}`
              : 'Never run dry. Set it once and forget the balance.'}
          </TextBody>
        </View>
        <Switch
          value={prefs.on}
          onValueChange={(v) => {
            haptics.select();
            void setAutoTopup({ on: v });
            if (v) setOpen(true);
          }}
          trackColor={{ true: colors.flameDeep, false: colors.line }}
          thumbColor={colors.white}
        />
      </View>

      {prefs.on ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 10 }}>
          {open ? (
            <>
              <View style={{ gap: 6 }}>
                <TextMed style={{ fontSize: 12.5 }} color={colors.inkSoft}>Tell me when the balance falls below</TextMed>
                <Row options={THRESHOLD_CHOICES} value={prefs.threshold} onChange={(v) => setAutoTopup({ threshold: v })} />
              </View>
              <View style={{ gap: 6 }}>
                <TextMed style={{ fontSize: 12.5 }} color={colors.inkSoft}>and get me ready to add</TextMed>
                <Row options={AMOUNT_CHOICES} value={prefs.amount} onChange={(v) => setAutoTopup({ amount: v })} />
              </View>
              <Tap haptic={false} onPress={() => setOpen(false)} style={{ alignSelf: 'flex-start' }}>
                <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>Done</TextMed>
              </Tap>
            </>
          ) : (
            <Tap haptic={false} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
              <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>Change the amounts</TextMed>
            </Tap>
          )}
          {/* Says exactly what happens. No claim of an automatic debit. */}
          <TextBody style={{ fontSize: 11, lineHeight: 16, textAlign: 'justify' }} color={colors.inkMute}>
            You stay in control: we send a reminder with the amount pre-filled and nothing is charged until you pay. Automatic UPI debits arrive in a later update.
          </TextBody>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Row({ options, value, onChange }: { options: number[]; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Tap
            key={o}
            haptic={false}
            onPress={() => { haptics.select(); onChange(o); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? colors.flameDeep : colors.wash, borderWidth: 1, borderColor: on ? colors.flameDeep : colors.line }}
          >
            <TextSemi color={on ? colors.white : colors.ink} style={{ fontSize: 14, ...tabular }}>{rupee(o)}</TextSemi>
          </Tap>
        );
      })}
    </View>
  );
}

export default AutoTopupCard;
