import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { KeyboardSafe } from '../components/KeyboardSafe';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Field, Tap, BackButton, Pill } from '../components/ui';
import { haptics } from '../lib/haptics';
import { listOrders, type Order } from '../lib/api';
import {
  COMPLAINT_CATEGORIES,
  STATUS_COPY,
  categoryLabel,
  escalateByEmail,
  fileComplaint,
  useComplaints,
  type Complaint,
  type ComplaintCategory,
} from '../lib/complaints';
import { CARE_PHONE, HAS_CARE_PHONE, callCare, GRIEVANCE_EMAIL, GRIEVANCE_OFFICER } from '../lib/support';

/**
 * COMPLAINT REGISTER — file a complaint, get a reference, follow its status.
 *
 * This replaces "we don't have an in-app complaints desk yet, so this opens
 * your email app". Every complaint now gets a PYS-XXXXX reference the moment
 * it is filed, appears in "My complaints" with a status, and is POSTed to the
 * backend register when that endpoint is live (lib/complaints holds the
 * contract and retries anything filed offline).
 *
 * The grievance officer named in the Privacy Policy is printed at the bottom,
 * because the Consumer Protection (E-commerce) Rules expect an escalation path
 * that does not depend on the app working.
 */
export default function Complaints() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; category?: string }>();
  const rows = useComplaints((s) => s.rows);
  const loading = useComplaints((s) => s.loading);
  const refresh = useComplaints((s) => s.refresh);

  const [category, setCategory] = useState<ComplaintCategory>(
    (COMPLAINT_CATEGORIES.find((c) => c.key === params.category)?.key as ComplaintCategory) ?? 'missing',
  );
  const [detail, setDetail] = useState('');
  const [orderId, setOrderId] = useState<string | null>(typeof params.orderId === 'string' ? params.orderId : null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<Complaint | null>(null);
  const [err, setErr] = useState('');

  useFocusEffect(
    useCallback(() => {
      void refresh();
      // Recent orders so a complaint can be pinned to the delivery it is about.
      listOrders()
        .then((os) => setOrders(os.slice(0, 6)))
        .catch(() => setOrders([]));
    }, [refresh]),
  );

  const open = useMemo(() => rows.filter((r) => r.status !== 'resolved' && r.status !== 'closed'), [rows]);

  async function submit() {
    if (detail.trim().length < 8) {
      setErr('Please tell us a little more, so we can actually fix it.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const c = await fileComplaint({ category, detail, orderId });
      haptics.confirm();
      setFiled(c);
      setDetail('');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not register that. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Filed confirmation ─────────────────────────────────────────────────────
  if (filed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => setFiled(null)} />
          <Serif style={{ fontSize: 24, flex: 1 }}>Complaint filed</Serif>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', gap: 12, paddingVertical: spacing.lg }}>
            <Ionicons name="checkmark-circle" size={68} color={colors.live} />
            <Serif style={{ fontSize: 26 }}>{filed.ref}</Serif>
            <TextBody style={{ fontSize: 13.5, textAlign: 'center', lineHeight: 20 }} color={colors.inkSoft}>
              {categoryLabel(filed.category)} is on our register. Quote this reference if you call us. {STATUS_COPY[filed.status].sub}
            </TextBody>
          </Animated.View>
          {HAS_CARE_PHONE ? (
            <Tap onPress={callCare} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameDeep, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft }}>
              <Ionicons name="call-outline" size={20} color={colors.white} />
              <View style={{ flex: 1 }}>
                <TextSemi color={colors.white} style={{ fontSize: 15 }}>Call customer care</TextSemi>
                <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 12 }}>{CARE_PHONE}</TextBody>
              </View>
            </Tap>
          ) : null}
          <Tap onPress={() => { void escalateByEmail(filed); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
            <Ionicons name="mail-outline" size={20} color={colors.flameDeep} />
            <View style={{ flex: 1 }}>
              <TextSemi style={{ fontSize: 15 }}>Also email it to the team</TextSemi>
              <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>Opens your mail app with {filed.ref} filled in</TextBody>
            </View>
          </Tap>
          <Tap onPress={() => setFiled(null)}>
            <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>Back to my complaints</TextSemi>
            </View>
          </Tap>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24, flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>Register a complaint</Serif>
      </View>

      <KeyboardSafe>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TextBody style={{ fontSize: 13, lineHeight: 19, textAlign: 'justify' }} color={colors.inkSoft}>
            Tell us what went wrong and it goes straight on our register with a reference number. You can follow its status right here, and we reply on the number and email in your profile.
          </TextBody>

          {/* What happened */}
          <TextSemi style={{ fontSize: 15.5 }}>What is this about?</TextSemi>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COMPLAINT_CATEGORIES.map((c) => {
              const on = c.key === category;
              return (
                <Tap
                  key={c.key}
                  haptic={false}
                  onPress={() => { haptics.select(); setCategory(c.key); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '47%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: on ? colors.flameSoft : colors.white, borderWidth: 1.5, borderColor: on ? colors.flameDeep : colors.line }}
                >
                  <Ionicons name={c.icon as never} size={17} color={on ? colors.flameDeep : colors.inkMute} />
                  {/* Two lines allowed: a category the member cannot read is
                      worse than a chip one line taller. */}
                  <TextMed color={on ? colors.flameDeep : colors.ink} style={{ fontSize: 12.5, flex: 1, lineHeight: 16 }} numberOfLines={2}>{c.label}</TextMed>
                </Tap>
              );
            })}
          </View>

          {/* Which order (optional) */}
          {orders.length > 0 ? (
            <>
              <TextSemi style={{ fontSize: 15.5 }}>Which delivery? (optional)</TextSemi>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {orders.map((o) => {
                  const on = orderId === o.id;
                  return (
                    <Tap
                      key={o.id}
                      haptic={false}
                      onPress={() => { haptics.select(); setOrderId(on ? null : o.id); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? colors.flameDeep : colors.white, borderWidth: 1, borderColor: on ? colors.flameDeep : colors.line }}
                    >
                      <TextMed color={on ? colors.white : colors.ink} style={{ fontSize: 12.5 }}>
                        {new Date(o.placed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </TextMed>
                      <TextBody color={on ? 'rgba(255,255,255,0.85)' : colors.inkMute} style={{ fontSize: 11 }}>
                        {o.lane === 'instant' ? 'Instant' : 'Morning'}
                      </TextBody>
                    </Tap>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <Field
            label="What happened?"
            value={detail}
            onChangeText={(t: string) => { setDetail(t); setErr(''); }}
            placeholder="Describe it in your own words"
            multiline
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          {err ? <TextBody color={colors.dangerDeep} style={{ fontSize: 13 }}>{err}</TextBody> : null}

          <Tap onPress={busy ? undefined : submit}>
            <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
              {busy ? <ActivityIndicator color={colors.white} /> : null}
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>{busy ? 'Registering…' : 'Register complaint'}</TextSemi>
            </View>
          </Tap>

          {/* My complaints */}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextSemi style={{ fontSize: 16, flex: 1 }}>My complaints</TextSemi>
            {open.length > 0 ? <Pill small label={`${open.length} OPEN`} bg={colors.flameSoft} color={colors.flameDeep} /> : null}
          </View>

          {loading && rows.length === 0 ? (
            <ActivityIndicator color={colors.flameDeep} style={{ marginTop: 12 }} />
          ) : rows.length === 0 ? (
            <TextBody style={{ fontSize: 13 }} color={colors.inkMute}>Nothing filed yet</TextBody>
          ) : (
            rows.map((c, i) => (
              <Animated.View key={c.id} entering={FadeInDown.duration(360).delay(Math.min(i, 5) * 40)}>
                <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8, ...shadow.soft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextSemi style={{ fontSize: 14.5, flex: 1 }}>{c.ref}</TextSemi>
                    <Pill
                      small
                      label={STATUS_COPY[c.status].label.toUpperCase()}
                      bg={c.status === 'resolved' || c.status === 'closed' ? colors.liveSoft : c.status === 'queued' ? colors.cream : colors.flameSoft}
                      color={c.status === 'resolved' || c.status === 'closed' ? colors.live : c.status === 'queued' ? colors.inkSoft : colors.flameDeep}
                    />
                  </View>
                  <TextMed style={{ fontSize: 13 }}>{categoryLabel(c.category)}</TextMed>
                  <TextBody style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.inkSoft} numberOfLines={3}>{c.detail}</TextBody>
                  {c.resolution ? (
                    <View style={{ backgroundColor: colors.liveSoft, borderRadius: radius.sm, padding: 10 }}>
                      <TextBody style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.ink}>{c.resolution}</TextBody>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextMed style={{ fontSize: 11, flex: 1 }} color={colors.inkMute}>
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TextMed>
                    <Tap haptic={false} onPress={() => { void escalateByEmail(c); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="mail-outline" size={13} color={colors.flameDeep} />
                      <TextMed color={colors.flameDeep} style={{ fontSize: 12 }}>Email it</TextMed>
                    </Tap>
                  </View>
                </View>
              </Animated.View>
            ))
          )}

          {/* Escalation — the path that does not depend on the app. */}
          <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, gap: 4, marginTop: spacing.sm }}>
            <TextSemi style={{ fontSize: 13.5 }}>Not resolved?</TextSemi>
            <TextBody style={{ fontSize: 12, lineHeight: 18 }} color={colors.inkSoft}>
              Escalate to our grievance officer, {GRIEVANCE_OFFICER}, at {GRIEVANCE_EMAIL}. We reply within the timelines in our published terms.
            </TextBody>
            <Tap haptic={false} onPress={() => router.push('/support')} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <TextMed color={colors.flameDeep} style={{ fontSize: 12.5 }}>All the ways to reach us</TextMed>
            </Tap>
          </View>
        </ScrollView>
      </KeyboardSafe>
    </View>
  );
}
