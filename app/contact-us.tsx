import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { DocScreen, DocCard, DocLinkRow } from '../components/DocScreen';

const EMAIL = 'hello@paragdairy.app';
const PHONE = '18001033611'; // Parag Customer Care (toll-free)
const SITE = 'https://www.paragdairy.com';

export default function ContactUs() {
  return (
    <DocScreen
      title="Contact Us"
      intro="We are here to help with orders, subscriptions, payments and anything else about PARAG. Reach us on any of the channels below and our team will get back to you."
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
          value={EMAIL}
          href={`mailto:${EMAIL}?subject=PYAAS%20support`}
        />
        <DocLinkRow
          icon={<Ionicons name="call-outline" size={20} color={colors.flameDeep} />}
          label="Customer care (placeholder)"
          value="+91 80000 00000 · Mon to Sat, 8am to 8pm"
          href={`tel:${PHONE}`}
        />
        <DocLinkRow
          icon={<Ionicons name="logo-whatsapp" size={20} color={colors.flameDeep} />}
          label="WhatsApp"
          value="Chat with us for order updates"
          href={`https://wa.me/${PHONE.replace('+', '')}`}
        />
        <DocLinkRow
          icon={<Ionicons name="globe-outline" size={20} color={colors.flameDeep} />}
          label="Website"
          value="paragdairy.com"
          href={SITE}
          last
        />
      </DocCard>

      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="business-outline" size={20} color={colors.inkSoft} />}
          label="Registered office (placeholder)"
          value="Pradeshik Cooperative Dairy Federation, Lucknow, Uttar Pradesh 226001"
          last
        />
      </DocCard>
    </DocScreen>
  );
}
