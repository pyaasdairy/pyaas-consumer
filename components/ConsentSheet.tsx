import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '../lib/theme';
import { TextBody, TextMed, TextSemi, Tap } from './ui';
import { getUserId } from '../lib/session';
import { getRows, insertRow } from '../lib/localStore';

/**
 * Reusable consent capture for signup / onboarding.
 *
 * Records the user's explicit choices (Privacy Policy + Terms are required;
 * marketing / WhatsApp / SMS / email are optional) into the local 'consents'
 * table with a timestamp + app version, so we keep an auditable consent trail
 * (DPDP-style). The lead wires <ConsentSheet> into the signup screen and calls
 * recordConsents() on submit.
 *
 * apiClient seam: when the Go backend is live, POST the same payload to
 *   /users/me/consents
 * so consent lives server-side against the account; this local store becomes the
 * offline mirror.
 */

export type ConsentKey = 'privacy' | 'terms' | 'marketing' | 'whatsapp' | 'sms' | 'email';

export type ConsentChoices = Record<ConsentKey, boolean>;

export type ConsentRecord = {
  id: string;
  choices: ConsentChoices;
  app_version: string;
  policy_version: string; // bump when the policy text materially changes
  recorded_at: string; // ISO
};

// Bump when Privacy/Terms copy materially changes so re-consent can be prompted.
export const POLICY_VERSION = '2026-07';

const REQUIRED: ConsentKey[] = ['privacy', 'terms'];

const CONSENT_META: { key: ConsentKey; label: string; sub: string; required: boolean; route?: string }[] = [
  { key: 'privacy', label: 'I agree to the Privacy Policy', sub: 'How PYAAS collects and protects your data', required: true, route: '/privacy-policy' },
  { key: 'terms', label: 'I accept the Terms of Service', sub: 'The rules for using the PYAAS app', required: true, route: '/terms' },
  { key: 'marketing', label: 'Offers and updates', sub: 'Occasional news about products and prices', required: false },
  { key: 'whatsapp', label: 'WhatsApp updates', sub: 'Order and delivery alerts on WhatsApp', required: false },
  { key: 'sms', label: 'SMS updates', sub: 'Delivery and payment reminders by SMS', required: false },
  { key: 'email', label: 'Email updates', sub: 'Invoices and account emails', required: false },
];

export function defaultChoices(): ConsentChoices {
  return { privacy: false, terms: false, marketing: false, whatsapp: false, sms: false, email: false };
}

/** Persist a set of consent choices with timestamp + versions. */
export async function recordConsents(choices: ConsentChoices): Promise<ConsentRecord> {
  const uid = (await getUserId()) ?? 'anon';
  const rec: ConsentRecord = {
    id: `consent_${Date.now().toString(36)}`,
    choices,
    app_version: Constants.expoConfig?.version ?? '1.0.0',
    policy_version: POLICY_VERSION,
    recorded_at: new Date().toISOString(),
  };
  // Append-only so we keep the full consent history (never overwrite).
  await insertRow<ConsentRecord>('consents', uid, rec);
  // apiClient seam: await api.post('/users/me/consents', rec) when backend is live.
  return rec;
}

/** Read consent history + the latest choices for the signed-in user. */
export function useConsents(): {
  latest: ConsentChoices | null;
  history: ConsentRecord[];
  loading: boolean;
  reload: () => Promise<void>;
  save: (choices: ConsentChoices) => Promise<void>;
} {
  const [history, setHistory] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const uid = (await getUserId()) ?? 'anon';
    const rows = await getRows<ConsentRecord>('consents', uid);
    rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    setHistory(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (choices: ConsentChoices) => {
    await recordConsents(choices);
    await reload();
  }, [reload]);

  return { latest: history[0]?.choices ?? null, history, loading, reload, save };
}

/** Are the required consents (privacy + terms) all granted? */
export function requiredConsentsGiven(choices: ConsentChoices): boolean {
  return REQUIRED.every((k) => choices[k]);
}

// ── UI ────────────────────────────────────────────────────────────────────────
export function ConsentSheet({
  value,
  onChange,
  showRequiredHint,
}: {
  value: ConsentChoices;
  onChange: (next: ConsentChoices) => void;
  showRequiredHint?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={{ gap: 10 }}>
      {CONSENT_META.map((c) => {
        const checked = value[c.key];
        return (
          <View
            key={c.key}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              backgroundColor: colors.white,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: checked ? colors.flameDeep : colors.line,
              padding: spacing.md,
            }}
          >
            <Tap
              onPress={() => onChange({ ...value, [c.key]: !checked })}
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                borderWidth: 2,
                borderColor: checked ? colors.flameDeep : colors.line,
                backgroundColor: checked ? colors.flameDeep : colors.white,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {checked ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
            </Tap>
            <Tap
              haptic={false}
              onPress={() => onChange({ ...value, [c.key]: !checked })}
              style={{ flex: 1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <TextMed style={{ fontSize: 14 }}>{c.label}</TextMed>
                {c.required ? (
                  <View style={{ backgroundColor: colors.flameSoft, paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill }}>
                    <TextSemi color={colors.flameDeep} style={{ fontSize: 10.5 }}>Required</TextSemi>
                  </View>
                ) : null}
              </View>
              <TextBody color={colors.inkSoft} style={{ fontSize: 12, marginTop: 2 }}>{c.sub}</TextBody>
              {c.route ? (
                <Tap haptic={false} onPress={() => router.push(c.route as any)} style={{ marginTop: 4 }}>
                  <TextSemi color={colors.blue} style={{ fontSize: 12 }}>Read the document</TextSemi>
                </Tap>
              ) : null}
            </Tap>
          </View>
        );
      })}

      {showRequiredHint && !requiredConsentsGiven(value) ? (
        <TextBody color={colors.flameDeep} style={{ fontSize: 12.5 }}>
          Please accept the Privacy Policy and Terms to continue.
        </TextBody>
      ) : null}
    </View>
  );
}
