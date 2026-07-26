import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function PrivacyPolicy() {
  return (
    <DocScreen
      title="Privacy Policy"
      updated="1 July 2026"
      intro="PARAG (operated by the Pradeshik Cooperative Dairy Federation, Uttar Pradesh) respects your privacy. This policy explains what we collect when you use the PYAAS app, why we collect it, and the choices you have. It is written to align with the Digital Personal Data Protection Act, 2023."
      sections={[
        {
          heading: 'Information we collect',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Account details: your name, mobile number, email and profile photo.',
                'Delivery details: saved addresses, delivery slot and delivery instructions.',
                'Order and payment history: what you ordered, subscriptions, invoices and wallet transactions. Card and UPI details are handled by our payment partner and are not stored by us.',
                'Location: your device location, only when you grant permission, to help place a pin on the delivery map and find your area.',
                'Device and usage data: app version, device model and basic diagnostics that help us fix crashes.',
              ],
            },
          ],
        },
        {
          heading: 'How we use it',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'To deliver your milk and dairy orders and manage your subscriptions.',
                'To process payments, wallet recharges, refunds and issue proforma bills with GST.',
                'To send order, delivery and payment updates on the channels you agree to (app, SMS, WhatsApp or email).',
                'To provide support, prevent fraud and keep the service secure.',
                'To improve the app and, where you consent, to share offers.',
              ],
            },
          ],
        },
        {
          heading: 'Your consent and choices',
          blocks: [
            { kind: 'para', text: 'Marketing, WhatsApp, SMS and email updates are optional and off unless you turn them on. You can change these anytime from your profile, and you can unsubscribe from any marketing message. We keep a record of the consents you give, with a timestamp.' },
          ],
        },
        {
          heading: 'Sharing',
          blocks: [
            { kind: 'para', text: 'We share the minimum data needed with our delivery partners (to deliver to you), payment gateway (to process payments) and communication providers (to send your updates). We do not sell your personal data.' },
          ],
        },
        {
          heading: 'Retention and security',
          blocks: [
            { kind: 'para', text: 'We keep order and invoice records for as long as the law requires for tax and accounting, and other data for as long as your account is active. We use reasonable technical safeguards to protect your information.' },
          ],
        },
        {
          heading: 'Your rights',
          blocks: [
            { kind: 'para', text: 'You can access or correct your profile in the app, request deletion of your account, and withdraw optional consents. To exercise these rights, contact our Grievance Officer below.' },
          ],
        },
        {
          heading: 'Contact',
          blocks: [
            { kind: 'para', text: 'Grievance Officer, PARAG. Email hello@paragdairy.app. We aim to respond within a reasonable time as required by law.' },
          ],
        },
      ]}
      footerNote="This policy is a placeholder template for the PYAAS app. The registered entity details, retention periods and the named Grievance Officer are to be confirmed by the operator before public release."
    />
  );
}
