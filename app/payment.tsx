import React, { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../lib/haptics';
import { colors, radius, spacing, shadow, tabular, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, BackButton } from '../components/ui';
import { ShineSweep } from '../components/Fx';
import { useWallet } from '../store/wallet';
import { useAuth } from '../lib/auth';
import { rechargeBonus } from '../lib/pricing';
import { rechargeWallet } from '../lib/walletApi';
import { reconcileWithBalance } from '../lib/subscriptions';
import { createTopupOrder, checkoutHtml, verifyTopup, creditIsServerSide, WALLET_TEST_TOPUP, testTopup, type CheckoutResult } from '../lib/razorpay';

// Real brand marks (generated from the official single-colour logos).
const BRAND = {
  googlepay: require('../assets/brands/googlepay.png'),
  phonepe: require('../assets/brands/phonepe.png'),
  paytm: require('../assets/brands/paytm.png'),
  visa: require('../assets/brands/visa.png'),
  mastercard: require('../assets/brands/mastercard.png'),
};

const UPI_APPS = [
  { key: 'gpay', label: 'Google Pay', logo: BRAND.googlepay },
  { key: 'phonepe', label: 'PhonePe', logo: BRAND.phonepe },
  { key: 'paytm', label: 'Paytm', logo: BRAND.paytm },
];

/**
 * Wallet top-up via Razorpay. Choosing a method opens the Razorpay Standard
 * Checkout inside a WebView; the wallet is credited only AFTER the payment
 * succeeds (server-verified when a backend is configured, provisionally in the
 * offline demo). See lib/razorpay.ts for the security model and what the
 * backend/key_secret must do. No tap ever credits money without a payment.
 */
export default function Payment() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { amount } = useLocalSearchParams<{ amount: string }>();
  const value = Math.max(0, Number(amount) || 0);
  const refresh = useWallet((s) => s.refresh);
  const bonus = rechargeBonus(value);
  const credited = value + (bonus?.bonus ?? 0);

  const [crediting, setCrediting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  // The Razorpay Standard Checkout runs inside this WebView overlay.
  const [checkout, setCheckout] = useState<string | null>(null);
  const method = React.useRef('upi');

  // Credit the wallet ONLY after a payment succeeds. With a backend, the server
  // verifies the signature and credits; locally (demo) we credit here against
  // the razorpay_payment_id so the ledger row carries the receipt.
  async function creditFromPayment(r: CheckoutResult) {
    setCrediting(true); setError('');
    try {
      const v = await verifyTopup(r);
      if (!v.verified) { setError('We could not verify that payment. If money was debited it will be refunded.'); return; }
      if (!creditIsServerSide()) {
        await rechargeWallet(value, method.current, r.razorpay_payment_id);
      }
      await refresh();
      // Topping up may re-fund subscriptions paused for low balance.
      try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
      haptics.confirm();
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not add money. Please try again.');
    } finally { setCrediting(false); }
  }

  async function pay(m: string) {
    haptics.press();
    setError('');
    method.current = m;
    if (value <= 0) return;
    // TEST mode: credit directly, no payment gateway (see razorpay.ts).
    if (WALLET_TEST_TOPUP) {
      setCrediting(true);
      try {
        await testTopup(value);
        await refresh();
        try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
        haptics.confirm();
        setDone(true);
      } catch (e: any) {
        setError(e?.message || 'Could not add test money. Please try again.');
      } finally { setCrediting(false); }
      return;
    }
    setCrediting(true);
    try {
      const order = await createTopupOrder(Math.round(value * 100));
      const html = checkoutHtml({
        keyId: order.keyId,
        amountPaise: order.amountPaise,
        orderId: order.orderId,
        name: profile?.full_name ?? '',
        contact: (profile as any)?.phone ?? '',
        email: (profile as any)?.email ?? '',
        themeColor: colors.flameDeep,
      });
      setCheckout(html);
    } catch (e: any) {
      setError(e?.message || 'Could not start the payment. Please try again.');
    } finally { setCrediting(false); }
  }

  function onCheckoutMessage(e: WebViewMessageEvent) {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg?.type === 'success') {
      setCheckout(null);
      void creditFromPayment({
        razorpay_payment_id: String(msg.razorpay_payment_id ?? ''),
        razorpay_order_id: msg.razorpay_order_id,
        razorpay_signature: msg.razorpay_signature,
      });
    } else if (msg?.type === 'failed') {
      setCheckout(null);
      setError(typeof msg.error === 'string' ? msg.error : 'Payment failed. Please try again.');
    } else if (msg?.type === 'dismiss') {
      setCheckout(null);
    }
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
        <Ionicons name="checkmark-circle" size={72} color={colors.blue} />
        <Serif style={{ fontSize: 24, ...tabular }}>{rupee(credited)} added</Serif>
        <TextBody style={{ textAlign: 'center' }}>
          {bonus ? `Includes ${rupee(bonus.bonus)} ${bonus.kind === 'cashback' ? 'cashback' : 'bonus'}. ` : ''}It is in your PYAAS Wallet and logged in your transactions.
        </TextBody>
        <Button title="Back to wallet" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    );
  }

  // No / invalid amount → don't show a misleading "Pay ₹0" sheet.
  if (value <= 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
        <Ionicons name="wallet-outline" size={56} color={colors.inkMute} />
        <Serif style={{ fontSize: 22 }}>No amount selected</Serif>
        <TextBody style={{ textAlign: 'center' }}>Pick a top-up amount from your wallet to continue.</TextBody>
        <Button title="Back to wallet" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    );
  }

  const busy = crediting;

  // ── Payment options ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.milk }}>
        <BackButton />
        <Serif style={{ fontSize: 22, flex: 1 }}>Add money</Serif>
      </View>

      {/* Summary */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.milk, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {[
          { l: 'You pay', v: rupee(value), c: colors.ink },
          // Bonus cell only when one actually exists (recharge bonuses retired:
          // the wallet is credited exactly what is paid).
          ...(bonus && bonus.bonus > 0 ? [{ l: bonus.kind === 'cashback' ? 'Cashback' : 'Bonus', v: rupee(bonus.bonus), c: colors.flameDeep }] : []),
          { l: 'Credited', v: rupee(credited), c: colors.blue },
        ].map((s, i) => (
          <View key={s.l} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.line }}>
            <TextBody style={{ fontSize: 11.5 }}>{s.l}</TextBody>
            <TextSemi style={{ fontSize: 17, ...tabular }} color={s.c}>{s.v}</TextSemi>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        {error ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{error}</TextBody> : null}

        {/* UPI apps · real brand logos */}
        <Section title="UPI">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {UPI_APPS.map((a) => (
              <Tap key={a.key} onPress={() => pay('upi')} disabled={busy} style={{ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
                <Image source={a.logo} style={{ width: 40, height: 40 }} contentFit="contain" />
                <TextBody style={{ fontSize: 11.5, textAlign: 'center' }} numberOfLines={1}>{a.label}</TextBody>
              </Tap>
            ))}
          </View>
          <MethodRow icon="at-outline" label="Add UPI ID" sub="Pay from any UPI app" tint={colors.flameDeep} onPress={() => pay('upi')} disabled={busy} />
        </Section>

        {/* Cards · real network logos */}
        <Section title="Cards">
          <Tap onPress={() => pay('card')} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="card-outline" size={18} color={colors.flameDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <TextMed style={{ fontSize: 14.5 }}>Credit or Debit card</TextMed>
              <TextBody style={{ fontSize: 11.5 }}>Visa, Mastercard, RuPay</TextBody>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Image source={BRAND.visa} style={{ width: 30, height: 20 }} contentFit="contain" />
              <Image source={BRAND.mastercard} style={{ width: 26, height: 20 }} contentFit="contain" />
            </View>
          </Tap>
        </Section>

        {/* Netbanking */}
        <Section title="Netbanking">
          <MethodRow icon="business-outline" label="All Indian banks" sub="Pay straight from your bank" tint={colors.blue} onPress={() => pay('netbanking')} disabled={busy} />
        </Section>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 4, paddingHorizontal: spacing.md }}>
          <Ionicons name="lock-closed" size={14} color={colors.inkMute} />
          <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
            256-bit encrypted · your card details are never stored on PYAAS.
          </TextBody>
        </View>
      </ScrollView>

      {/* Sticky pay */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: 'rgba(255,255,255,0.95)', borderTopWidth: 1, borderTopColor: colors.line }}>
        <Tap onPress={() => pay('upi')} disabled={busy}>
          <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.flameDeep, height: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
            {busy ? <ActivityIndicator color={colors.white} /> : null}
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>{busy ? 'Adding money…' : `Pay ${rupee(value)}`}</TextSemi>
            {!busy ? <ShineSweep dur={2400} travel={320} bandWidth={70} angle="16deg" delay={400} /> : null}
          </View>
        </Tap>
      </View>

      {/* Razorpay Standard Checkout (WebView overlay) */}
      <Modal visible={!!checkout} animationType="slide" onRequestClose={() => setCheckout(null)} presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.milk, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Tap onPress={() => setCheckout(null)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Tap>
            <Serif style={{ fontSize: 20, flex: 1 }}>Secure payment</Serif>
            <Ionicons name="lock-closed" size={16} color={colors.inkSoft} />
          </View>
          {checkout ? (
            <WebView
              source={{ html: checkout, baseUrl: 'https://checkout.razorpay.com' }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              onMessage={onCheckoutMessage}
              startInLoadingState
              renderLoading={() => (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
                  <ActivityIndicator color={colors.flameDeep} size="large" />
                </View>
              )}
              style={{ flex: 1, backgroundColor: colors.cream }}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <TextSemi style={{ fontSize: 13.5 }} color={colors.inkSoft}>{title}</TextSemi>
      <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8, ...shadow.soft }}>
        {children}
      </View>
    </View>
  );
}

function MethodRow({ icon, label, sub, tint, onPress, disabled }: { icon: any; label: string; sub?: string; tint: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Tap onPress={onPress} disabled={disabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <TextMed style={{ fontSize: 14.5 }}>{label}</TextMed>
        {sub ? <TextBody style={{ fontSize: 11.5 }}>{sub}</TextBody> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Tap>
  );
}
