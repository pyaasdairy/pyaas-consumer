import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeModal } from './SafeModal';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, fonts, tabular } from '../lib/theme';
import { TextSemi, TextBody, Tap } from './ui';
import { WEEK_HEADERS, monthGrid, monthLabel, isoOf, parseISO } from '../lib/dates';

/**
 * PYAAS start-date calendar. Parent mounts/unmounts it (so it reopens fresh).
 * Dates before `minISO` are disabled. Confirm fires onConfirm(selectedISO).
 */
export function StartDatePicker({ value, minISO, onConfirm, onClose }: {
  value: string; minISO: string; onConfirm: (iso: string) => void; onClose: () => void;
}) {
  const min = parseISO(minISO);
  const init = parseISO(value < minISO ? minISO : value);
  const [sel, setSel] = useState(value < minISO ? minISO : value);
  const [y, setY] = useState(init.getFullYear());
  const [m, setM] = useState(init.getMonth());

  const minY = min.getFullYear();
  const minM = min.getMonth();
  const canPrev = y > minY || (y === minY && m > minM);
  const weeks = monthGrid(y, m);

  function shift(delta: number) {
    let nm = m + delta;
    let ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    if (ny < minY || (ny === minY && nm < minM)) return;
    Haptics.selectionAsync();
    setM(nm); setY(ny);
  }

  function pick(day: number) {
    const iso = isoOf(new Date(y, m, day));
    if (iso < minISO) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSel(iso);
  }

  return (
    <SafeModal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.duration(300)} style={{ width: '100%', maxWidth: 384, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, gap: 14, ...shadow.card }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TextSemi style={{ fontSize: 20 }}>Start Date</TextSemi>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Tap haptic={false} onPress={() => shift(-1)} disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.25, padding: 2 }}>
                <Ionicons name="chevron-back" size={24} color={colors.flameDeep} />
              </Tap>
              <TextSemi style={{ fontSize: 16, minWidth: 116, textAlign: 'center' }}>{monthLabel(y, m)}</TextSemi>
              <Tap haptic={false} onPress={() => shift(1)} style={{ padding: 2 }}>
                <Ionicons name="chevron-forward" size={24} color={colors.flameDeep} />
              </Tap>
            </View>
          </View>

          {/* Weekday row */}
          <View style={{ flexDirection: 'row' }}>
            {WEEK_HEADERS.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.sansSemi, color: colors.inkMute, fontSize: 13 }}>{w}</Text>
            ))}
          </View>

          {/* Weeks */}
          <View key={`${y}-${m}`} style={{ gap: 6 }}>
            {weeks.map((week, wi) => (
              <Animated.View key={wi} entering={FadeIn.duration(220).delay(wi * 35)} style={{ flexDirection: 'row' }}>
                {week.map((day, di) => {
                  if (day == null) return <View key={di} style={{ flex: 1, aspectRatio: 1 }} />;
                  const iso = isoOf(new Date(y, m, day));
                  const disabled = iso < minISO;
                  const selected = iso === sel;
                  return (
                    <View key={di} style={{ flex: 1, aspectRatio: 1, padding: 3 }}>
                      <Tap
                        haptic={false}
                        disabled={disabled}
                        scaleTo={0.82}
                        onPress={() => pick(day)}
                        style={{ flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: selected ? 'transparent' : 'transparent' }}
                      >
                        {selected ? (
                          <View style={[StyleSheet.absoluteFill, { borderRadius: radius.md, backgroundColor: colors.flameDeep }]} />
                        ) : null}
                        <Text style={{ fontSize: 16, fontFamily: fonts.sansSemi, ...tabular, color: selected ? colors.white : disabled ? '#D8CCD2' : colors.ink }}>{day}</Text>
                      </Tap>
                    </View>
                  );
                })}
              </Animated.View>
            ))}
          </View>

          <TextBody style={{ fontSize: 12, textAlign: 'center', marginTop: 2 }}>Order by 11:59 PM · delivered by 7 AM</TextBody>

          {/* Done */}
          <Tap onPress={() => onConfirm(sel)} style={{ alignSelf: 'center', marginTop: 2 }}>
            <View style={{ backgroundColor: colors.flameDeep, paddingHorizontal: 56, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>Done</TextSemi>
            </View>
          </Tap>
        </Animated.View>
      </Animated.View>
    </SafeModal>
  );
}
