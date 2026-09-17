import React, { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeModal } from './SafeModal';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';

/**
 * SELECT — a labelled dropdown in the app's own language, used by the society
 * address flow (Society → Tower → Floor → Flat).
 *
 * It looks like the society's own "Add Home" form (a bordered field with a
 * chevron) and opens a bottom sheet with the options. Lists over ~12 entries
 * get a search box, because one tower can hold three hundred flats and nobody
 * should scroll that on a phone at 5 AM.
 *
 * Disabled until its parent is chosen: picking a floor before a tower is
 * meaningless, so the field stays inert and says what it is waiting for.
 */
export type SelectOption = { value: string; label: string; sub?: string };

export function Select({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  disabledHint,
  searchable,
  sheetTitle,
}: {
  label: string;
  value: string | null;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown in the field while it is disabled ("Pick a tower first"). */
  disabledHint?: string;
  /** Force the search box on or off; defaults to on above 12 options. */
  searchable?: boolean;
  sheetTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value) ?? null;
  const withSearch = searchable ?? options.length > 12;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || (o.sub ?? '').toLowerCase().includes(needle),
    );
  }, [options, q]);

  function pick(v: string) {
    haptics.select();
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <View style={{ gap: 6 }}>
      <TextMed style={{ fontSize: 13 }} color={colors.inkSoft}>{label}</TextMed>
      <Tap
        haptic={false}
        // Clear any previous search as the sheet opens: reopening the floor
        // list still filtered by the last thing typed reads as a list with
        // missing rows (caught on the emulator, 18 Sep).
        onPress={disabled ? undefined : () => { setQ(''); setOpen(true); }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        accessibilityLabel={`${label}. ${current?.label ?? placeholder}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 50,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: current ? colors.flameDeep : colors.line,
          backgroundColor: disabled ? colors.wash : colors.white,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <TextMed
          style={{ flex: 1, fontSize: 15 }}
          color={current ? colors.ink : colors.inkMute}
          numberOfLines={1}
        >
          {current?.label ?? (disabled ? disabledHint ?? placeholder : placeholder)}
        </TextMed>
        <Ionicons name="chevron-down" size={18} color={disabled ? colors.inkMute : colors.flameDeep} />
      </Tap>

      <SafeModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <Animated.View
            entering={FadeInDown.duration(260)}
            style={{ backgroundColor: colors.milk, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 10, paddingBottom: insets.bottom + 10, maxHeight: '76%', ...shadow.card }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, marginBottom: 10 }}>
              <Serif style={{ fontSize: 20, flex: 1 }} numberOfLines={1}>{sheetTitle ?? label}</Serif>
              <Tap haptic={false} onPress={() => setOpen(false)} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Tap>
            </View>

            {withSearch ? (
              <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }}>
                  <Ionicons name="search" size={16} color={colors.inkMute} />
                  <TextInput
                    value={q}
                    onChangeText={setQ}
                    placeholder="Search"
                    placeholderTextColor={colors.inkMute}
                    autoCorrect={false}
                    autoCapitalize="characters"
                    style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }}
                  />
                  {q ? (
                    <Tap haptic={false} onPress={() => setQ('')} accessibilityLabel="Clear search" style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={16} color={colors.inkMute} />
                    </Tap>
                  ) : null}
                </View>
              </View>
            ) : null}

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 8, gap: 8 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {shown.length === 0 ? (
                <TextBody style={{ fontSize: 13, paddingVertical: 18, textAlign: 'center' }} color={colors.inkMute}>
                  Nothing matches that
                </TextBody>
              ) : (
                shown.map((o) => {
                  const on = o.value === value;
                  return (
                    <Tap
                      key={o.value}
                      haptic={false}
                      onPress={() => pick(o.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? colors.flameSoft : colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.flameDeep : colors.line, paddingHorizontal: 14, paddingVertical: 13 }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TextSemi style={{ fontSize: 15 }} color={on ? colors.flameDeep : colors.ink} numberOfLines={1}>{o.label}</TextSemi>
                        {o.sub ? <TextBody style={{ fontSize: 12 }} color={colors.inkMute} numberOfLines={1}>{o.sub}</TextBody> : null}
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={20} color={colors.flameDeep} /> : null}
                    </Tap>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </SafeModal>
    </View>
  );
}

export default Select;
