import React, { useMemo, useState, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator, Modal, TextInput, Alert, Linking, BackHandler } from 'react-native';
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
import { PREPAID_TARGET } from '../lib/prepaid';
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
 * WebView navigation gate. When the member picks a UPI app (PhonePe / GPay / Paytm
 * / any UPI app) inside Razorpay's checkout, Razorpay navigates to a `upi:` /
 * `intent:` / app-scheme deep link. With `originWhitelist={['*']}` the WebView would
 * try to load that non-http URL INTERNALLY (it stalls / shows a blank), so the UPI
 * app never opens. Here we hand every non-http(s) scheme to the OS via Linking so
 * the chosen app launches, and keep http(s)/about/data/blob in the WebView (those
 * are Razorpay's own checkout pages + assets).
 */
function handleCheckoutNavigation(req: { url?: string }): boolean {
  const url = req?.url ?? '';
  if (!url || /^(https?:|about:|data:|blob:)/i.test(url)) return true;
  Linking.openURL(url).catch(() => { /* no UPI app for this scheme — stay in sheet */ });
  return false;
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
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<string | null>(null);
  const method = React.useRef('upi');
  // Synchronous re-entrancy guard: setBusy only disables the CTA after a re-render,
  // so a fast double-tap could enter recharge() twice and mint two Razorpay orders.
  const inFlight = React.useRef(false);
  // Track mount so the floating post-payment verify never setStates after unmount.
  const mounted = React.useRef(true);
  // Reason of the last in-sheet payment failure, surfaced only if the member then
  // backs out (we keep the sheet open so Razorpay's own retry screen can be used).
  const lastFail = React.useRef('');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Swallow Android hardware-back while a payment is opening/verifying (busy) so it
  // can't tear the screen out mid-flight. While the checkout modal is open busy is
  // false and the modal's own onRequestClose (confirm-cancel) handles back instead.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => busy);
    return () => sub.remove();
  }, [busy]);

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
    setVerifying(true);
    setError('');
    lastFail.current = '';
    try {
      const v = await verifyTopup(r);
      if (!v.verified) {
        if (mounted.current) setError('We could not verify that payment. If money was debited it will be refunded.');
        return;
      }
      if (!creditIsServerSide()) {
        await rechargeWallet(value, method.current, r.razorpay_payment_id);
      }
      await refresh();
      // Topping up may re-fund subscriptions paused for low balance.
      try { await reconcileWithBalance(useWallet.getState().balance); } catch { /* non-fatal */ }
      haptics.confirm();
      if (!mounted.current) return; // screen already left — don't navigate/setState
      // Checkout-when-short: hop straight back to finish the pending action.
      if (returnTo) { router.replace(returnTo as never); return; }
      setDone(true);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || 'Could not add money. Please try again.');
    } finally {
      if (mounted.current) { setBusy(false); setVerifying(false); }
    }
  }

  async function recharge() {
    haptics.press();
    setError('');
    if (value <= 0 || belowMin) return;
    if (inFlight.current) return; // synchronous double-tap guard (no duplicate orders)
    inFlight.current = true;
    lastFail.current = ''; // fresh attempt — don't carry a prior failure's reason

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
        inFlight.current = false;
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
        if (outcome.status === 'success') {
          // AWAIT so recharge()'s finally (which clears inFlight/busy) runs only
          // AFTER crediting — otherwise it clobbers creditFromPayment's own
          // busy/verifying state and re-enables the CTA mid-verify (double-charge).
          await creditFromPayment(outcome.result);
        } else {
          setBusy(false);
          if (outcome.status === 'failed') setError(outcome.error);
          // cancelled → do nothing (retryable, no charge)
        }
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
      inFlight.current = false;
    }
  }

  // Cancelling the in-progress payment: confirm first (a stray back tap shouldn't
  // silently abandon a payment the member may be mid-way through in a UPI app).
  function confirmCancelPayment() {
    Alert.alert(
      'Cancel this payment?',
      'Your recharge is not complete yet. If you cancel now, no money will be deducted.',
      [
        { text: 'Keep paying', style: 'cancel' },
        { text: 'Cancel payment', style: 'destructive', onPress: () => { setCheckout(null); setBusy(false); lastFail.current = ''; } },
      ],
    );
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
      // Keep the sheet mounted so Razorpay's own in-sheet retry (default
      // retry:enabled) still works — a recoverable failure (wrong UPI PIN, low
      // balance, declined card) shouldn't nuke the checkout. Stash the reason and
      // surface it only if the member then backs out instead of retrying.
      lastFail.current = typeof msg.error === 'string' ? msg.error : 'Payment failed. Please try again.';
    } else if (msg?.type === 'dismiss') {
      setCheckout(null); setBusy(false); // user backed out — retryable, no charge
      if (lastFail.current) { setError(lastFail.current); lastFail.current = ''; }
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
              const recommended = p === PREPAID_TARGET;
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
                    borderColor: on || recommended ? colors.flameDeep : colors.line,
                    paddingVertical: 16,
                    paddingHorizontal: 14,
                    gap: 2,
                    ...shadow.soft,
                  }}
                >
                  {recommended ? (
                    <View style={{ position: 'absolute', top: -9, right: 10, backgroundColor: colors.flameDeep, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <TextSemi color={colors.white} style={{ fontSize: 9, letterSpacing: 0.6 }}>RECOMMENDED</TextSemi>
                    </View>
                  ) : null}
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

        {/* Recharge summary — Amount to pay · Cashback · To be credited (the wallet
            is credited the full amount + bonus). */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.cream, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.flame, overflow: 'hidden', ...shadow.soft }}>
          {[
            { l: 'Amount to pay', v: rupee(value), c: colors.ink },
            { l: bonus?.kind === 'cashback' ? 'Cashback' : 'Bonus', v: bonus ? `+${rupee(bonus.bonus)}` : '—', c: bonus ? colors.flameDeep : colors.inkMute },
            { l: 'To be credited', v: rupee(credited), c: colors.blue, bold: true },
          ].map((s, i) => (
            <View key={s.l} style={{ flex: 1, alignItems: 'center', paddingVertical: 16, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: colors.line, backgroundColor: s.bold ? colors.blueSoft : 'transparent' }}>
              <TextBody style={{ fontSize: 11.5 }}>{s.l}</TextBody>
              <TextSemi style={{ fontSize: s.bold ? 19 : 17, ...tabular }} color={s.c}>{s.v}</TextSemi>
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
            <TextSemi color={colors.white} style={{ fontSize: 16.5, ...tabular }}>{busy ? (verifying ? 'Verifying payment…' : 'Opening payment…') : `Recharge ${rupee(value)}`}</TextSemi>
            {!busy ? <ShineSweep dur={2400} travel={320} bandWidth={70} angle="16deg" delay={400} /> : null}
          </View>
        </Tap>
      </View>

      {/* Razorpay WebView Standard Checkout overlay (fallback path) */}
      <Modal visible={!!checkout} animationType="slide" onRequestClose={confirmCancelPayment} presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: colors.cream }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.milk, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {/* Back = cancel (with confirm), top-left. */}
            <Tap onPress={confirmCancelPayment} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Tap>
            <Serif style={{ fontSize: 20, flex: 1 }}>Secure payment</Serif>
            <Ionicons name="lock-closed" size={16} color={colors.inkSoft} />
          </View>
          {checkout ? (
            <WebView
              source={{ html: checkout, baseUrl: 'https://checkout.razorpay.com' }}
              originWhitelist={['*']}
              onShouldStartLoadWithRequest={handleCheckoutNavigation}
              javaScriptEnabled
              domStorageEnabled
              onMessage={onCheckoutMessage}
              startInLoadingState
              renderLoading={() => (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, gap: 12 }}>
                  <ActivityIndicator color={colors.flameDeep} size="large" />
                  <TextBody style={{ fontSize: 13 }} color={colors.inkSoft}>Loading secure payment…</TextBody>
                  <TextBody style={{ fontSize: 11.5 }} color={colors.inkMute}>Use Back (top-left) to cancel anytime.</TextBody>
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
