import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Field, Tap, BackButton } from '../components/ui';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { submitLead } from '../lib/leads';
import { isBackendConfigured } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { haptics } from '../lib/haptics';
import { CARE_EMAIL, HAS_CARE_PHONE, SUPPORT, callCare, emailCare } from '../lib/support';

/**
 * BULK ORDER — its own screen (founder call, 21 Sep). It used to be the first
 * tab of "Partner with us", which made ordering milk for an office or an event
 * feel like applying for a partnership. Now it is as short as it can be:
 *   - name and phone come pre-filled from the account,
 *   - what you need is chips (milk, curd, paneer, the same three the old form
 *     listed), how often is one tap,
 *   - the only thing to type is how much.
 * It is still an ENQUIRY sent through the partner-leads rail (kind
 * 'bulk_order'): the team confirms price and delivery by phone.
 */
const PRODUCTS = ['Milk', 'Curd', 'Paneer'];
const HOW_OFTEN = ['One time', 'Every day'];

export default function BulkOrder() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const backendLive = isBackendConfigured();
  const [products, setProducts] = useState<string[]>(['Milk']);
  const [often, setOften] = useState(HOW_OFTEN[1]);
  const [qty, setQty] = useState('');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState((profile?.phone ?? '').replace(/^\+91/, ''));
  const [business, setBusiness] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  function toggle(p: string) {
    haptics.select();
    setProducts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  const summary = [
    `Products: ${products.join(', ') || 'not chosen'}`,
    `How often: ${often}`,
    `Quantity: ${qty.trim()}`,
    note.trim() ? `Note: ${note.trim()}` : '',
  ].filter(Boolean).join('\n');

  async function submit() {
    if (products.length === 0) { setErr('Pick at least one product.'); return; }
    if (!qty.trim()) { setErr('Tell us how much you need.'); return; }
    if (!name.trim() || !phone.trim()) { setErr('Name and phone are required.'); return; }
    setBusy(true); setErr('');
    try {
      await submitLead({ kind: 'bulk_order', name, phone, businessName: business, city: '', message: summary });
      if (!backendLive) {
        const opened = await emailCare(`PYAAS bulk order. ${name.trim()}`, `Bulk order\nName: ${name.trim()}\nPhone: ${phone.trim()}\n${business.trim() ? `Business: ${business.trim()}\n` : ''}${summary}\n\nSent from the PYAAS app`);
        if (!opened) {
          setErr(`Could not open your email app. Please write to ${CARE_EMAIL}${HAS_CARE_PHONE ? ` or call ${SUPPORT.careNumber}` : ''}.`);
          return;
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e: any) { setErr(e?.message ?? 'Could not send. Please try again.'); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton />
          <Serif style={{ fontSize: 24 }}>Request sent</Serif>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12 }}>
          <Ionicons name={backendLive ? 'checkmark-circle' : 'mail-open-outline'} size={64} color={colors.blue} />
          <Serif style={{ fontSize: 22, textAlign: 'center' }}>{backendLive ? 'We have your bulk order.' : 'One last tap.'}</Serif>
          <TextBody style={{ textAlign: 'center' }}>
            {backendLive
              ? `Our team will call you on ${phone} to confirm the price and the delivery.`
              : `We’ve opened your email app with this order. Send it to ${CARE_EMAIL} and our team replies there.`}
          </TextBody>
          {HAS_CARE_PHONE ? (
            <Tap onPress={callCare} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }}>
              <Ionicons name="call-outline" size={18} color={colors.flameDeep} />
              <TextMed color={colors.flameDeep} style={{ fontSize: 14 }}>Call {SUPPORT.careNumber}</TextMed>
            </Tap>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }}>Bulk order</Serif>
      </View>

      <KeyboardSafe>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextBody style={{ fontSize: 13 }} color={colors.inkSoft}>
            For offices, cafes, sweet shops and events. Tell us what you need and we call you to confirm.
          </TextBody>

          <TextSemi style={{ fontSize: 15 }}>What do you need?</TextSemi>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRODUCTS.map((p) => {
              const on = products.includes(p);
              return (
                <Tap key={p} haptic={false} onPress={() => toggle(p)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: radius.md, backgroundColor: on ? colors.flameSoft : colors.white, borderWidth: 1.5, borderColor: on ? colors.flameDeep : colors.line }}>
                  {on ? <Ionicons name="checkmark" size={15} color={colors.flameDeep} /> : null}
                  <TextMed color={on ? colors.flameDeep : colors.ink} style={{ fontSize: 13.5 }}>{p}</TextMed>
                </Tap>
              );
            })}
          </View>

          <TextSemi style={{ fontSize: 15 }}>How often?</TextSemi>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {HOW_OFTEN.map((o) => {
              const on = often === o;
              return (
                <Tap key={o} haptic={false} onPress={() => { haptics.select(); setOften(o); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.md, backgroundColor: on ? colors.flameSoft : colors.white, borderWidth: 1.5, borderColor: on ? colors.flameDeep : colors.line }}>
                  <TextMed color={on ? colors.flameDeep : colors.ink} style={{ fontSize: 13.5 }}>{o}</TextMed>
                </Tap>
              );
            })}
          </View>

          <Field label="How much? *" value={qty} onChangeText={setQty} placeholder={often === 'Every day' ? 'e.g. 20 L milk, 5 kg curd a day' : 'e.g. 50 L milk on Sunday'} />
          <Field label="Your name *" value={name} onChangeText={setName} placeholder="Full name" />
          <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" />
          <Field label="Business name" value={business} onChangeText={setBusiness} placeholder="Optional" />
          <Field label="Anything else?" value={note} onChangeText={setNote} placeholder="Optional" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

          {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}
          <Button title={backendLive ? 'Send bulk order' : 'Email this bulk order'} loading={busy} onPress={submit} />
        </ScrollView>
      </KeyboardSafe>
    </View>
  );
}
