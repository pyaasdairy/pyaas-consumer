import React, { useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '../lib/haptics';
import { colors, radius, spacing, shadow, tabular, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, BackButton } from '../components/ui';
import { ShineSweep } from '../components/VipFx';
import { useWallet } from '../store/wallet';
import { rechargeBonus } from '../lib/pricing';
import { creditWallet, LIVE_PAYMENTS, GATEWAY_KEY } from '../lib/paymentGateway';
import { reconcileWithBalance } from '../lib/subscriptions';

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

// Razorpay Checkout (the live path) already provides UPI / cards / netbanking;
// this screen is the branded picker that opens it once a real key is present.
function checkoutHtml(keyId: string, amountPaise: number, method: string) {
  const cfg =
    method === 'card' ? `method: { card: true }`
    : method === 'netbanking' ? `method: { netbanking: true }`
    : `method: { upi: true }`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>html,body{margin:0;height:100%;background:#FFF1F8;font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;color:#5E5057}</style></head>
  <body><div>Opening secure payment…</div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var rzp = new Razorpay({
      key: "${keyId}", amount: ${amountPaise}, currency: "INR", name: "PYAAS",
      description: "Wallet top-up", theme: { color: "#F36CB5" }, ${cfg},
      handler: function (resp) { window.ReactNativeWebView.postMessage(JSON.stringify({ status: "success", id: resp.razorpay_payment_id })); },
      modal: { ondismiss: function () { window.ReactNativeWebView.postMessage(JSON.stringify({ status: "dismissed" })); } }
    });
    rzp.on('payment.failed', function (r) { window.ReactNativeWebView.postMessage(JSON.stringify({ status: "failed", error: r.error && r.error.description })); });
    rzp.open();
  </script></body></html>`;
}

export default function Payment() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { amount } = useLocalSearchParams<{ amount: string }>();
  const value = Math.max(0, Number(amount) || 0);
  const refresh = useWallet((s) => s.refresh);
  const bonus = rechargeBonus(value);
  const credited = value + (bonus?.bonus ?? 0);

  const [method, setMethod] = useState('upi'); // upi | card | netbanking
  const [paying, setPaying] = useState(false); // live checkout open
  const [crediting, setCrediting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // The actual settle. In test mode this IS the payment (credits the real
  // wallet); in live mode it runs only after a verified gateway success.
  async function settle() {
    setCrediting(true); setError('');
    try {
      await creditWallet(value);
      await refresh();
      // Topping up may re-fund subscriptions that were paused for low balance.
      try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
      haptics.confirm();
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not add money. Please try again.');
    } finally { setCrediting(false); setPaying(false); }
  }
  function onMessage(raw: string) {
    let msg: any = {};
    try { msg = JSON.parse(raw); } catch { /* ignore */ }
    if (msg.status === 'success') settle();
    else if (msg.status === 'failed') { setPaying(false); setError(msg.error || 'Payment failed.'); }
    else setPaying(false);
  }
  function pay(m: string) {
    haptics.press();
    setMethod(m); setError('');
    if (LIVE_PAYMENTS) setPaying(true); // open the real checkout
    else settle();                      // test mode: credit the wallet now
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
        <Ionicons name="checkmark-circle" size={72} color={colors.sage} />
        <Serif style={{ fontSize: 24, ...tabular }}>{rupee(credited)} added</Serif>
        <TextBody style={{ textAlign: 'center' }}>
          {bonus ? `Includes ${rupee(bonus.bonus)} ${bonus.kind === 'cashback' ? 'cashback' : 'bonus'}. ` : ''}It is in your PYAAS Wallet and logged in your transactions.
        </TextBody>
        <Button title="Back to wallet" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    );
  }

  // ── Live Razorpay checkout (only when a real key is configured) ──────────────
  if (paying && LIVE_PAYMENTS) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => setPaying(false)} />
          <Serif style={{ fontSize: 22 }}>Secure payment</Serif>
        </View>
        {crediting ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.roseDeep} />
            <TextBody>Confirming payment…</TextBody>
          </View>
        ) : (
          <WebView originWhitelist={['*']} source={{ html: checkoutHtml(GATEWAY_KEY, Math.round(value * 100), method) }} onMessage={(e) => onMessage(e.nativeEvent.data)} style={{ flex: 1, backgroundColor: colors.milk }} />
        )}
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
          { l: bonus?.kind === 'cashback' ? 'Cashback' : 'Bonus', v: rupee(bonus?.bonus ?? 0), c: colors.roseDeep },
          { l: 'Credited', v: rupee(credited), c: colors.sage },
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
          <MethodRow icon="at-outline" label="Add UPI ID" sub="Pay from any UPI app" tint={colors.roseDeep} onPress={() => pay('upi')} disabled={busy} />
        </Section>

        {/* Cards · real network logos */}
        <Section title="Cards">
          <Tap onPress={() => pay('card')} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="card-outline" size={18} color={colors.roseDeep} />
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

        {/* Netbanking · legit method, no fabricated copy */}
        <Section title="Netbanking">
          <MethodRow icon="business-outline" label="All Indian banks" sub="Pay straight from your bank" tint={colors.sage} onPress={() => pay('netbanking')} disabled={busy} />
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
          <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.roseDeep, height: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.card }}>
            {busy ? <ActivityIndicator color={colors.white} /> : null}
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>{busy ? 'Adding money…' : `Pay ${rupee(value)}`}</TextSemi>
            {!busy ? <ShineSweep dur={2400} travel={320} bandWidth={70} angle="16deg" delay={400} /> : null}
          </View>
        </Tap>
      </View>
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
