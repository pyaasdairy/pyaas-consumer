import React, { useCallback, useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, fonts, tabular } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, Divider, BackButton } from '../components/ui';
import { fireHaptic } from '../lib/haptics';
import { getLedger, type WalletLedgerRow, type LedgerType } from '../lib/walletApi';
import { renderStatementHtml } from '../lib/statement';

// Filter tabs across the top of the statement.
const FILTERS: { key: LedgerType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'credit', label: 'Added' },
  { key: 'debit', label: 'Spent' },
  { key: 'reward', label: 'Rewards' },
  { key: 'refund', label: 'Refunds' },
  { key: 'adjustment', label: 'Adjust' },
];

// Money-in vs money-out for colour + sign.
const isCredit = (t: LedgerType) => t !== 'debit';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WalletStatement() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<WalletLedgerRow[]>([]);
  const [filter, setFilter] = useState<LedgerType | 'all'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setRows(await getLedger());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.type !== filter) return false;
      if (q) {
        const hay = `${r.remark ?? ''} ${r.ref_type} ${r.type} ${r.ref_id ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (downloading) return;
    fireHaptic('medium');
    setDownloading(true);
    try {
      // Current balance = closing balance of the most recent ledger row.
      const current = rows.length
        ? rows.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b)).closing_balance
        : 0;
      const filterLabel = FILTERS.find((f) => f.key === filter && f.key !== 'all')?.label;
      const html = renderStatementHtml(shown, {
        generatedAt: new Date().toLocaleString('en-IN'),
        balance: current,
        filterLabel: filterLabel ? `${filterLabel} only` : undefined,
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'PYAAS Wallet statement', UTI: 'com.adobe.pdf' });
      }
    } catch {
      /* user dismissed, or print/share unavailable */
    } finally {
      setDownloading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }}>Statement</Serif>
        <Tap onPress={download} disabled={downloading} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.flameDeep, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, opacity: downloading ? 0.7 : 1, ...shadow.soft }}>
          <Ionicons name="document-text-outline" size={15} color={colors.white} />
          <TextMed color={colors.white} style={{ fontSize: 12.5 }}>{downloading ? 'Preparing…' : 'PDF'}</TextMed>
        </Tap>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 46 }}>
          <Ionicons name="search" size={16} color={colors.inkMute} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search transactions" placeholderTextColor={colors.inkMute} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink }} />
          {search ? (
            <Tap onPress={() => setSearch('')} haptic={false}><Ionicons name="close-circle" size={16} color={colors.inkMute} /></Tap>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8, alignItems: 'center' }}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Tap key={f.key} onPress={() => setFilter(f.key)} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? colors.flameDeep : colors.white, borderWidth: 1, borderColor: on ? colors.flameDeep : colors.line }}>
              <TextMed color={on ? colors.white : colors.inkSoft} style={{ fontSize: 13 }}>{f.label}</TextMed>
            </Tap>
          );
        })}
      </Animated.ScrollView>

      <Animated.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }} showsVerticalScrollIndicator={false}>
        {shown.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Ionicons name="receipt-outline" size={40} color={colors.inkMute} />
            <TextBody style={{ fontSize: 14 }}>No transactions to show.</TextBody>
          </View>
        ) : (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, ...shadow.soft }}>
            {shown.map((r, i) => (
              <Animated.View key={r.id} layout={LinearTransition.springify().damping(18).stiffness(200)} entering={FadeInDown.duration(320).delay(Math.min(i, 10) * 35)}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isCredit(r.type) ? colors.blueSoft : colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={isCredit(r.type) ? 'arrow-down' : 'arrow-up'} size={16} color={isCredit(r.type) ? colors.blue : colors.flameDeep} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <TextMed style={{ fontSize: 14 }} numberOfLines={1}>{r.remark ?? labelFor(r.type)}</TextMed>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TextBody style={{ fontSize: 11, ...tabular }}>{fmtDate(r.created_at)}</TextBody>
                      <Tag text={r.bucket === 'promo' ? 'REWARDS' : 'CASH'} />
                      {r.status !== 'success' ? <Tag text={r.status.toUpperCase()} tone="warn" /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <TextSemi color={isCredit(r.type) ? colors.blue : colors.ink} style={{ fontSize: 15, ...tabular }}>
                      {isCredit(r.type) ? '+' : '−'}{rupee(r.amount)}
                    </TextSemi>
                    <TextBody style={{ fontSize: 10.5, ...tabular }}>Bal {rupee(r.closing_balance)}</TextBody>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function labelFor(t: LedgerType): string {
  return t === 'credit' ? 'Money added' : t === 'debit' ? 'Order payment' : t === 'reward' ? 'Reward credited' : t === 'refund' ? 'Refund' : 'Adjustment';
}

function Tag({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'warn' }) {
  const bg = tone === 'warn' ? colors.flameSoft : colors.cream;
  const fg = tone === 'warn' ? colors.flameDeep : colors.inkMute;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1.5 }}>
      <TextMed color={fg} style={{ fontSize: 9.5, letterSpacing: 0.3 }}>{text}</TextMed>
    </View>
  );
}
