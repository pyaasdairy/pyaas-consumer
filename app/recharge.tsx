import React, { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import { colors, radius, spacing, shadow, tabular, rupee, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { ShineSweep } from '../components/Fx';
import { useWallet } from '../store/wallet';
import { useAuth } from '../lib/auth';
import { rechargeBonus } from '../lib/pricing';
import { rechargeWallet } from '../lib/walletApi';
import { reconcileWithBalance } from '../lib/subscriptions';
import {
  createTopupOrder,
  checkoutHtml,
  verifyTopup,
  creditIsServerSide,
  openCheckout,
  isNativeCheckoutAvailable,
  WALLET_TEST_TOPUP,
  testTopup,
  type CheckoutResult,
} from '../lib/razorpay';

// Country-Delight-style recharge grid. Custom lets the member type any amount.
const PACKS = [100, 250, 500, 1000];

/** Snap a required minimum up to a clean amount the grid can preselect. */
function snapUp(min: number): number {
  const hit = PACKS.find((p) => p >= min);
  if (hit) return hit;
  return Math.ceil(min / 100) * 100; // above the grid → next ₹100
}

/**
 * WALLET RECHARGE — the single wallet-first top-up surface. Reached from the
 * wallet tab, the low-balance promo modal, and checkout-when-short (cart). Pick
 * an amount → Recharge → the best available Razorpay sheet opens (native
 * multi-method when a dev build is present, else the WebView sheet, else a dev
 * mock) → on success the wallet is credited (server-verified with a backend).
 *
 * Params:
 *   amount?   preselect this amount
 *   min?      minimum required (a shortfall) — CTA blocks below it
 *   returnTo? route to return to after a successful credit (e.g. /cart)
 *   reason?   short context line ("to place your order")
 */
export default function Recharge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ amount?: string; min?: string; returnTo?: string; reason?: string }>();
  const min = Math.max(0, Math.round(Number(params.min) || 0));
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '';
  const reason = typeof params.reason === 'string' ? params.reason : '';

  const balance = useWallet((s) => s.balance);
  const refresh = useWallet((s) => s.refresh);

  const initial = useMemo(() => {
    const a = Math.round(Number(params.amount) || 0);
    if (a > 0) return Math.max(a, min || 0);
    if (min > 0) return snapUp(min);
    return 500;
  }, [params.amount, min]);

  // `amount` is the string the custom field holds; `selected` is the committed value.
  const [selected, setSelected] = useState<number>(initial);
  const [custom, setCustom] = useState('');
  const value = custom.trim() ? Math.max(0, Math.round(Number(custom) || 0)) : selected;
  const bonus = rechargeBonus(value);
  const credited = value + (bonus?.bonus ?? 0);
  const belowMin = min > 0 && value < min;

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<string | null>(null);
  const method = React.useRef('upi');

  function pick(v: number) {
    haptics.select();
    setCustom('');
    setSelected(v);
    setError('');
  }

  // Credit the wallet ONLY after a verified payment. With a backend the server
  // verifies the signature + credits; offline demo credits here against the
  // payment id so the ledger row carries the receipt (idempotent per payment).
  async function creditFromPayment(r: CheckoutResult) {
    setBusy(true);
    setError('');
    try {
      const v = await verifyTopup(r);
      if (!v.verified) {
        setError('We could not verify that payment. If money was debited it will be refunded.');
        return;
      }
      if (!creditIsServerSide()) {
        await rechargeWallet(value, method.current, r.razorpay_payment_id);
      }
      await refresh();
      // Topping up may re-fund subscriptions paused for low balance.
      try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
      haptics.confirm();
      // Checkout-when-short: hop straight back to finish the pending action.
      if (returnTo) { router.replace(returnTo as never); return; }
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not add money. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function recharge() {
    haptics.press();
    setError('');
    if (value <= 0 || belowMin) return;

    // TEST mode: credit directly, no gateway (dev before payments are wired).
    if (WALLET_TEST_TOPUP) {
      setBusy(true);
      try {
        await testTopup(value);
        await refresh();
        try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
        haptics.confirm();
        if (returnTo) { router.replace(returnTo as never); return; }
        setDone(true);
      } catch (e: any) {
        setError(e?.message || 'Could not add test money. Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      // Amount-bound order (server-side when a backend is configured).
      const order = await createTopupOrder(Math.round(value * 100));
      const prefill = {
        name: profile?.full_name ?? '',
        contact: (profile as any)?.phone ?? '',
        email: (profile as any)?.email ?? '',
      };

      // 1) NATIVE sheet (dev build + module) — best multi-method UX.
      if (isNativeCheckoutAvailable()) {
        const outcome = await openCheckout({
          amountPaise: order.amountPaise,
          orderId: order.orderId,
          description: 'PYAAS wallet recharge',
          prefill,
          themeColor: colors.flameDeep,
        });
        setBusy(false);
        if (outcome.status === 'success') { void creditFromPayment(outcome.result); }
        else if (outcome.status === 'failed') { setError(outcome.error); }
        // cancelled → do nothing (retryable, no charge)
        return;
      }

      // 2) WebView Standard Checkout — real sheet, no native module needed.
      const html = checkoutHtml({
        keyId: order.keyId,
        amountPaise: order.amountPaise,
        orderId: order.orderId,
        name: prefill.name,
        contact: prefill.contact,
        email: prefill.email,
        themeColor: colors.flameDeep,
      });
      setCheckout(html);
    } catch (e: any) {
      setError(e?.message || 'Could not start the payment. Please try again.');
    } finally {
      setBusy(false);
    }
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
      setCheckout(null); // user backed out — retryable, no charge
    }
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
        <Ionicons name="checkmark-circle" size={72} color={colors.blue} />
        <Serif style={{ fontSize: 24, ...tabular }}>{rupee(credited)} added</Serif>
        <TextBody style={{ textAlign: 'center' }}>
          {bonus ? `Includes ${rupee(bonus.bonus)} ${bonus.kind === 'cashback' ? 'cashback' : 'bonus'}. ` : ''}It is in your PYAAS Wallet and logged in your statement.
        </TextBody>
        <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/wallet'))} style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
            <TextSemi color={colors.white} style={{ fontSize: 16 }}>Done</TextSemi>
          </View>
        </Tap>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.milk }}>
        <BackButton />
        <Serif style={{ fontSize: 22, flex: 1 }}>Recharge wallet</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 130 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Current balance + why we're here */}
        <Animated.View entering={FadeInDown.duration(420)}>
          <View style={{ backgroundColor: colors.flameDeep, borderRadius: radius.xl, overflow: 'hidden', padding: spacing.lg, gap: 4, ...shadow.card }}>
            <TextMed color="rgba(255,255,255,0.9)" style={{ fontSize: 12.5 }}>Wallet balance</TextMed>
            <Serif color={colors.white} style={{ fontFamily: fonts.serifBlack, fontSize: 38, letterSpacing: -0.5, ...tabular }}>{rupee(balance)}</Serif>
            {min > 0 ? (
              <TextBody color="rgba(255,255,255,0.92)" style={{ fontSize: 12.5, marginTop: 4 }}>
                Add at least {rupee(min)} {reason || 'to continue'}.
              </TextBody>
            ) : null}
            <ShineSweep dur={3200} travel={420} bandWidth={90} delay={500} />
          </View>
        </Animated.View>

        {/* Amount grid */}
        <Animated.View entering={FadeInDown.duration(420).delay(60)} style={{ gap: 12 }}>
          <TextSemi style={{ fontSize: 16 }}>Choose an amount</TextSemi>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PACKS.map((p) => {
              const on = !custom.trim() && selected === p;
              const b = rechargeBonus(p);
              const disabled = min > 0 && p < min;
              return (
                <Tap
                  key={p}
                  onPress={() => !disabled && pick(p)}
                  scaleTo={0.95}
                  style={{
                    width: '47%',
                    opacity: disabled ? 0.4 : 1,
                    backgroundColor: on ? colors.flameSoft : colors.white,
                    borderRadius: radius.md,
                    borderWidth: 1.5,
                    borderColor: on ? colors.flameDeep : colors.line,
                    paddingVertical: 16,
                    paddingHorizontal: 14,
                    gap: 2,
                    ...shadow.soft,
                  }}
                >
                  <TextSemi style={{ fontSize: 20, ...tabular }} color={on ? colors.flameDeep : colors.ink}>{rupee(p)}</TextSemi>
                  {b ? (
                    <TextBody style={{ fontSize: 11.5, ...tabular }} color={colors.blue}>+{rupee(b.bonus)} {b.kind === 'cashback' ? 'cashback' : 'free'}</TextBody>
                  ) : (
                    <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>Top up</TextBody>
                  )}
                </Tap>
              );
            })}
          </View>

          {/* Custom amount */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: custom.trim() ? colors.flameDeep : colors.line, paddingHorizontal: 14, height: 54 }}>
            <Serif style={{ fontSize: 20 }} color={colors.inkMute}>₹</Serif>
            <TextInput
              value={custom}
              onChangeText={(t) => { setCustom(t.replace(/[^0-9]/g, '')); setError(''); }}
              keyboardType="number-pad"
              placeholder="Enter a custom amount"
              placeholderTextColor={colors.inkMute}
              style={{ flex: 1, fontFamily: fonts.sansSemi, fontSize: 18, color: colors.ink, ...tabular }}
            />
          </View>
          {belowMin ? (
            <TextMed color={colors.danger} style={{ fontSize: 12.5 }}>Enter at least {rupee(min)} {reason || 'to continue'}.</TextMed>
          ) : bonus ? (
            <Animated.View entering={FadeIn.duration(220)}>
              <TextMed color={colors.blue} style={{ fontSize: 12.5 }}>
                You will get {rupee(bonus.bonus)} {bonus.kind === 'cashback' ? 'cashback' : 'free'} on this recharge.
              </TextMed>
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* To be credited */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, ...shadow.soft }}>
          {[
            { l: 'You pay', v: rupee(value), c: colors.ink },
            { l: bonus?.kind === 'cashback' ? 'Cashback' : 'Bonus', v: rupee(bonus?.bonus ?? 0), c: colors.flameDeep },
            { l: 'To be credited', v: rupee(credited), c: colors.blue },
          ].map((s, i) => (
            <View key={s.l} style={{ flex: 1, alignItems: 'center', paddingVertical: 16, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.line }}>
              <TextBody style={{ fontSize: 11.5 }}>{s.l}</TextBody>
              <TextSemi style={{ fontSize: 17, ...tabular }} color={s.c}>{s.v}</TextSemi>
            </View>
          ))}
        </View>

        {error ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{error}</TextBody> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={13} color={colors.inkMute} />
          <TextBody style={{ fontSize: 11.5, textAlign: 'center' }}>
            256-bit encrypted · UPI, cards, netbanking & wallets via Razorpay.
          </TextBody>
        </View>
      </ScrollView>

      {/* Sticky recharge CTA */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderTopColor: colors.line }}>
        <Tap onPress={recharge} disabled={busy || value <= 0 || belowMin}>
          <View style={{ borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.flameDeep, height: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: value <= 0 || belowMin ? 0.5 : 1, ...shadow.card }}>
            {busy ? <ActivityIndicator color={colors.white} /> : null}
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>{busy ? 'Opening payment…' : `Recharge ${rupee(value)}`}</TextSemi>
            {!busy ? <ShineSweep dur={2400} travel={320} bandWidth={70} angle="16deg" delay={400} /> : null}
          </View>
        </Tap>
      </View>

      {/* Razorpay WebView Standard Checkout overlay (fallback path) */}
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
