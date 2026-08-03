import React, { useState } from 'react';
import { View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, rupee, tabular } from '../lib/theme';
import { TextBody, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { variantLabel } from '../lib/catalog';
import type { Product } from '../constants/products';

/**
 * VARIANT SELECTOR — one control, two shapes.
 *   • ≤ 3 variants → a segmented pill toggle (500 ml · 1 L), always visible.
 *   • > 3 variants → a compact dropdown that opens a tap-to-pick list.
 * Selection is local to the parent (it holds `selectedId`); picking never
 * reloads anything — the parent re-renders price / image / stock from the
 * already-loaded variant. An out-of-stock variant stays selectable (so its
 * price/attrs show) but is marked; the parent greys its own Add button.
 * Renders nothing for a single-variant base (no size choice to make).
 */
export function VariantSelector({
  variants,
  selectedId,
  onSelect,
  compact = false,
}: {
  variants: Product[];
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  if (variants.length <= 1) return null;
  if (variants.length <= 3) {
    // Compact (grid-card) mode stays on ONE row — wrapping to a second row made
    // three-size cards taller than two-size ones and broke the grid's symmetry.
    return (
      <View style={{ flexDirection: 'row', flexWrap: compact ? 'nowrap' : 'wrap', gap: compact ? 5 : 8 }}>
        {variants.map((v) => {
          const active = v.id === selectedId;
          const oos = !!v.outOfStock;
          return (
            <Tap
              key={v.id}
              haptic={false}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => { if (!active) { haptics.select(); onSelect(v.id); } }}
              style={{
                flexShrink: 1,
                paddingHorizontal: compact ? 9 : 13,
                paddingVertical: compact ? 5 : 8,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: active ? colors.flameDeep : colors.line,
                backgroundColor: active ? colors.flameDeep : colors.white,
              }}
            >
              <TextSemi
                numberOfLines={1}
                color={active ? colors.white : oos ? colors.inkMute : colors.ink}
                style={{ fontSize: compact ? 11.5 : 13.5, textDecorationLine: oos && !active ? 'line-through' : 'none' }}
              >
                {variantLabel(v)}
              </TextSemi>
            </Tap>
          );
        })}
      </View>
    );
  }
  return <VariantDropdown variants={variants} selectedId={selectedId} onSelect={onSelect} compact={compact} />;
}

function VariantDropdown({ variants, selectedId, onSelect, compact }: { variants: Product[]; selectedId: string; onSelect: (id: string) => void; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const sel = variants.find((v) => v.id === selectedId) ?? variants[0];
  return (
    <View>
      <Tap
        haptic={false}
        onPress={() => { haptics.select(); setOpen(true); }}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: compact ? 10 : 14, paddingVertical: compact ? 7 : 11, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, backgroundColor: colors.white }}
      >
        <TextSemi numberOfLines={1} color={colors.ink} style={{ fontSize: compact ? 12 : 14 }}>{variantLabel(sel)}</TextSemi>
        <Ionicons name="chevron-down" size={compact ? 14 : 16} color={colors.flameDeep} />
      </Tap>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Tap haptic={false} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <View style={{ alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <TextSemi style={{ fontSize: 15 }}>Choose a size</TextSemi>
            </View>
            {variants.map((v) => {
              const active = v.id === selectedId;
              return (
                <Tap
                  key={v.id}
                  haptic={false}
                  onPress={() => { haptics.select(); onSelect(v.id); setOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: active ? colors.flameSoft : colors.white }}
                >
                  <TextSemi color={active ? colors.flameDeep : colors.ink} style={{ fontSize: 14.5 }}>{variantLabel(v)}</TextSemi>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {v.outOfStock ? (
                      <TextBody color={colors.inkMute} style={{ fontSize: 11.5 }}>Out of stock</TextBody>
                    ) : (
                      <TextSemi style={{ fontSize: 13.5, ...tabular }} color={colors.ink}>{rupee(v.price)}</TextSemi>
                    )}
                    {active ? <Ionicons name="checkmark" size={17} color={colors.flameDeep} /> : null}
                  </View>
                </Tap>
              );
            })}
          </View>
        </Tap>
      </Modal>
    </View>
  );
}
