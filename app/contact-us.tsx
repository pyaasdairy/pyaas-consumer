import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { DocScreen, DocCard, DocLinkRow } from '../components/DocScreen';

import { CARE_EMAIL, CARE_PHONE, CARE_PHONE_TEL, SITE_URL } from '../lib/support';

export default function ContactUs() {
  return (
    <DocScreen
      title="Contact Us"
      intro="We are here to help with orders, subscriptions, payments and anything else about PYAAS. Reach us on any of the channels below and our team will get back to you."
      sections={[
        {
          heading: 'Customer care',
          blocks: [
            { kind: 'para', text: 'For the fastest help with an order, open the order in the app and use Help and support, so your order details reach us directly.' },
          ],
        },
      ]}
      footerNote="Phone number, hours and the registered office address shown here are placeholders to be confirmed by the operator before public release."
    >
      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="mail-outline" size={20} color={colors.flameDeep} />}
          label="Email"
          value={CARE_EMAIL}
          href={`mailto:${CARE_EMAIL}?subject=PYAAS%20support`}
        />
        <DocLinkRow
          icon={<Ionicons name="call-outline" size={20} color={colors.flameDeep} />}
          label="Customer care (placeholder)"
          value={`${CARE_PHONE} · Mon to Sat, 8am to 8pm`}
          href={`tel:${CARE_PHONE_TEL}`}
        />
        <DocLinkRow
          icon={<Ionicons name="logo-whatsapp" size={20} color={colors.flameDeep} />}
          label="WhatsApp"
          value="Chat with us for order updates"
          href={`https://wa.me/${CARE_PHONE_TEL}`}
        />
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
