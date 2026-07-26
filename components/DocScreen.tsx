import React from 'react';
import { View, ScrollView, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from './ui';

/**
 * Shared layout for the consumer legal / policy / info screens (privacy, terms,
 * refunds, shipping, about, FSSAI, FAQ, contact). Keeps every mandatory page on
 * one honest, readable template so copy is the only thing that varies. Solid
 * colours only, no gradients. PARAG is a multi-dairy cooperative (Pradeshik
 * Cooperative Dairy Federation, UP), so copy never tells a single-farm story.
 */

export type DocBlock =
  | { kind: 'para'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'note'; text: string }; // muted callout for placeholders / disclaimers

export type DocSection = {
  heading?: string;
  blocks: DocBlock[];
};

export function DocScreen({
  title,
  intro,
  updated,
  sections,
  footerNote,
  children,
}: {
  title: string;
  intro?: string;
  updated?: string; // e.g. "1 July 2026"
  sections: DocSection[];
  footerNote?: string;
  children?: React.ReactNode; // extra interactive content (e.g. contact rows)
}) {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 22, flex: 1 }} numberOfLines={2}>{title}</Serif>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {updated ? (
          <TextMed color={colors.inkMute} style={{ fontSize: 12.5 }}>Last updated {updated}</TextMed>
        ) : null}
        {intro ? <TextBody style={{ fontSize: 14.5, lineHeight: 21 }}>{intro}</TextBody> : null}

        {sections.map((s, i) => (
          <View key={i} style={{ gap: 8 }}>
            {s.heading ? <TextSemi style={{ fontSize: 16, marginTop: 6 }}>{s.heading}</TextSemi> : null}
            {s.blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </View>
        ))}

        {children}

        {footerNote ? (
          <View style={{ backgroundColor: colors.cream, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.sm }}>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12.5, lineHeight: 18 }}>{footerNote}</TextBody>
          </View>
        ) : null}

        <View style={{ alignItems: 'center', gap: 3, marginTop: spacing.md }}>
          <TextBody style={{ fontSize: 12 }}>PARAG · Pradeshik Cooperative Dairy Federation, UP</TextBody>
          <TextBody style={{ fontSize: 11.5 }}>App version {version}</TextBody>
        </View>
      </ScrollView>
    </View>
  );
}

function Block({ block }: { block: DocBlock }) {
  if (block.kind === 'para') {
    return <TextBody style={{ fontSize: 14, lineHeight: 21 }}>{block.text}</TextBody>;
  }
  if (block.kind === 'bullets') {
    return (
      <View style={{ gap: 7 }}>
        {block.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.flameDeep, marginTop: 8 }} />
            <TextBody style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>{it}</TextBody>
          </View>
        ))}
      </View>
    );
  }
  // note
  return (
    <View style={{ backgroundColor: colors.goldSoft, borderRadius: radius.sm, padding: 12, borderWidth: 1, borderColor: colors.line }}>
      <TextMed color={colors.goldDeep} style={{ fontSize: 12.5, lineHeight: 18 }}>{block.text}</TextMed>
    </View>
  );
}

/** A tappable contact / link row for use inside a DocScreen's children. */
export function DocLinkRow({
  icon,
  label,
  value,
  href,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  href?: string;
  last?: boolean;
}) {
  return (
    <Tap
      haptic={false}
      onPress={href ? () => Linking.openURL(href) : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <TextMed style={{ fontSize: 14 }}>{label}</TextMed>
        {value ? <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>{value}</TextBody> : null}
      </View>
    </Tap>
  );
}

/** A white card wrapper for grouped rows inside a DocScreen. */
export function DocCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, ...shadow.soft }}>
      {children}
    </View>
  );
}
