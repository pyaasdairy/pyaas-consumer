import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, BackButton } from '../../components/ui';
import { getOrder, type Order } from '../../lib/api';
import { getProfile, type Profile } from '../../lib/session';
import {
  buildInvoice,
  renderInvoiceText,
  invoiceSummaryRows,
  type Invoice,
} from '../../lib/invoice';

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const o = await getOrder(String(id));
        if (!o) {
          setError('Invoice not found for this order.');
          return;
        }
        const profile: Profile | null = await getProfile();
        setOrder(o);
        setInv(
          buildInvoice(o, {
            type: 'tax',
            buyer: {
              name: profile?.full_name || 'PYAAS customer',
              phone: profile?.phone ?? null,
              email: profile?.email ?? null,
              gstin: o.buyer_gstin ?? null,
            },
          }),
        );
      } catch (e: any) {
        setError(e?.message ?? 'Could not build this invoice.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function shareInvoice() {
    if (!inv) return;
    try {
      await Share.share({
        title: `${inv.seller.brand} ${inv.title} ${inv.invoice_no}`,
        message: renderInvoiceText(inv),
      });
    } catch {
      /* user dismissed the share sheet */
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.flameDeep} />
      </View>
    );
  }
  if (!inv || !order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton />
          <Serif style={{ fontSize: 22 }}>Invoice</Serif>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <TextBody>{error || 'Invoice not available.'}</TextBody>
        </View>
      </View>
    );
  }

  const s = inv.seller;
  const dateStr = new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 22 }}>Proforma Bill</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Billed by (PYAAS) */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 3, ...shadow.soft }}>
          <View style={{ height: 3, backgroundColor: colors.flameDeep, borderRadius: 3, marginBottom: 8, width: 44 }} />
          <TextBody color={colors.inkMute} style={{ fontSize: 11, letterSpacing: 0.5 }}>BILLED BY</TextBody>
          <TextSemi style={{ fontSize: 16 }}>{s.brand}</TextSemi>
          <TextBody color={colors.inkSoft} style={{ fontSize: 12.5 }}>{s.name}</TextBody>
          <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>
            GSTIN {s.gstin}{s.gstin_is_placeholder ? ' (to be updated)' : ''}
          </TextBody>
          {s.fssai !== inv.manufacturer.fssai ? (
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>
              FSSAI {s.fssai}{s.fssai_is_placeholder ? ' (to be updated)' : ''}
            </TextBody>
          ) : null}
          <TextBody color={colors.inkMute} style={{ fontSize: 11.5 }}>{s.address}</TextBody>
        </View>

        {/* Goods manufactured by (manufacturer block) */}
        <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 3 }}>
          <TextBody color={colors.inkMute} style={{ fontSize: 11, letterSpacing: 0.5 }}>GOODS MANUFACTURED BY</TextBody>
          <TextSemi style={{ fontSize: 14 }}>{inv.manufacturer.name}</TextSemi>
          {/* Never print a fabricated GSTIN on a document represented as a bill.
              Until the real Union GSTIN is issued the line is simply omitted. */}
          {!inv.manufacturer.gstin_is_placeholder ? (
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>
              GSTIN {inv.manufacturer.gstin}
            </TextBody>
          ) : null}
          <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>
            FSSAI {inv.manufacturer.fssai}{inv.manufacturer.fssai_is_placeholder ? ' (to be updated)' : ''}
          </TextBody>
        </View>

        {/* Invoice meta */}
        <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8 }}>
          <MetaRow label="Invoice no" value={inv.invoice_no} />
          <MetaRow label="Date" value={dateStr} />
          <MetaRow label="Order" value={inv.order_id} />
          <MetaRow label="Place of supply" value={`${inv.place_of_supply} (${inv.place_of_supply_code})`} />
          <MetaRow label="Billed to" value={inv.buyer.name + (inv.buyer.phone ? ` · ${inv.buyer.phone}` : '')} />
          {inv.buyer.gstin ? <MetaRow label="Buyer GSTIN" value={inv.buyer.gstin} /> : null}
          {inv.delivery_address ? <MetaRow label="Deliver to" value={inv.delivery_address} /> : null}
        </View>

        {/* Line items */}
        <TextSemi style={{ fontSize: 15, marginTop: 4 }}>Items</TextSemi>
        {inv.items.map((it, i) => (
          <View key={i} style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <TextMed style={{ flex: 1, fontSize: 14 }}>{it.name}</TextMed>
              <TextSemi style={{ fontSize: 14 }}>₹{it.gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TextSemi>
            </View>
            <TextBody color={colors.inkSoft} style={{ fontSize: 12 }}>{it.variant} · {it.qty} × ₹{it.unit_price}</TextBody>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip text={`HSN ${it.hsn}`} />
              <Chip text={`GST ${it.gst_rate}%`} />
              {/* 0%-rated items (milk, paneer): the taxable value equals the
                  line total and every tax chip is ₹0.00 — printing them just
                  repeated the amount. Chips render only when tax exists. */}
              {it.gst_rate > 0 ? (
                <>
                  <Chip text={`Taxable ₹${it.taxable.toFixed(2)}`} />
                  {inv.intra_state ? (
                    <>
                      <Chip text={`CGST ₹${it.cgst.toFixed(2)}`} />
                      <Chip text={`SGST ₹${it.sgst.toFixed(2)}`} />
                    </>
                  ) : (
                    <Chip text={`IGST ₹${it.igst.toFixed(2)}`} />
                  )}
                </>
              ) : null}
            </View>
          </View>
        ))}

        {/* Summary */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 9, ...shadow.soft }}>
          {invoiceSummaryRows(inv).map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {r.strong ? <TextSemi style={{ fontSize: 16 }}>{r.label}</TextSemi> : <TextBody color={colors.inkSoft} style={{ fontSize: 13.5 }}>{r.label}</TextBody>}
              {r.strong ? <Serif style={{ fontSize: 18 }}>{r.value}</Serif> : <TextMed style={{ fontSize: 13.5 }}>{r.value}</TextMed>}
            </View>
          ))}
        </View>

        <TextBody color={colors.inkMute} style={{ fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>
          Prices are inclusive of GST. This is a proforma bill (indicative), not a valid tax invoice, and does not require a signature.
        </TextBody>

        <Button title="Share bill" onPress={shareInvoice} />
      </ScrollView>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TextBody color={colors.inkMute} style={{ fontSize: 12.5, width: 108 }}>{label}</TextBody>
      <TextMed style={{ flex: 1, fontSize: 12.5 }}>{value}</TextMed>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.line }}>
      <TextMed color={colors.inkSoft} style={{ fontSize: 11 }}>{text}</TextMed>
    </View>
  );
}
