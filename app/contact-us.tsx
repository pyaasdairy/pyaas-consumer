import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { DocScreen, DocCard, DocLinkRow } from '../components/DocScreen';

import { CARE_EMAIL, CARE_PHONE, CARE_PHONE_TEL, HAS_CARE_PHONE, HAS_WHATSAPP, SITE_URL, WHATSAPP_URL } from '../lib/support';

export default function ContactUs() {
  return (
    <DocScreen
      title="Contact Us"
      intro="We are here to help with orders, subscriptions, payments and anything else about PYAAS. Email is the channel we answer, and every message reaches the same team."
      sections={[
        {
          heading: 'Customer care',
          blocks: [
            { kind: 'para', text: 'Email us with your registered phone number and the order date, and we will reply on the same thread. The in-app chat and the complaint form draft that email for you — they open your mail app with what you told us already filled in.' },
            ...(HAS_CARE_PHONE
              ? []
              : [{ kind: 'note' as const, text: 'We do not have a published phone or WhatsApp line yet, so we do not list one. Until we do, email is the only way to reach us.' }]),
          ],
        },
      ]}
      footerNote="The registered office address shown here is a placeholder to be confirmed by the operator before public release."
    >
      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="mail-outline" size={20} color={colors.flameDeep} />}
          label="Email"
          value={CARE_EMAIL}
          href={`mailto:${CARE_EMAIL}?subject=PYAAS%20support`}
        />
        {/* Both rows are configuration-gated: an unset number must show NOTHING.
            The old placeholders dialled a live third-party toll-free line and a
            stranger's WhatsApp, and the "(placeholder)" label did not stop a
            customer tapping them. Hours are gone too — we cannot staff a line
            we have not published. */}
        {HAS_CARE_PHONE ? (
          <DocLinkRow
            icon={<Ionicons name="call-outline" size={20} color={colors.flameDeep} />}
            label="Customer care"
            value={CARE_PHONE}
            href={`tel:${CARE_PHONE_TEL}`}
          />
        ) : null}
        {HAS_WHATSAPP ? (
          <DocLinkRow
            icon={<Ionicons name="logo-whatsapp" size={20} color={colors.flameDeep} />}
            label="WhatsApp"
            value="Chat with us for order updates"
            // wa.me needs a FULL international number — never the toll-free digits.
            href={WHATSAPP_URL}
          />
        ) : null}
        <DocLinkRow
          icon={<Ionicons name="globe-outline" size={20} color={colors.flameDeep} />}
          label="Website"
          value="pyaasdairy.in"
          href={SITE_URL}
          last
        />
      </DocCard>

      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="business-outline" size={20} color={colors.inkSoft} />}
          label="Registered office (placeholder)"
          value="PYAAS Dairy Private Limited, Lucknow, Uttar Pradesh"
          last
        />
      </DocCard>
    </DocScreen>
  );
}
