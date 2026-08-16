import React from 'react';
import { DocScreen } from '../components/DocScreen';
import { CARE_EMAIL, GRIEVANCE_OFFICER } from '../lib/support';

/**
 * PRIVACY POLICY — the in-app rendering of the published policy of
 * PYAAS DAIRY PRIVATE LIMITED (v1.0, effective 3 August 2026).
 *
 * This replaced a placeholder template whose own footer admitted the registered
 * entity, retention periods and Grievance Officer were unconfirmed. Google Play
 * removed this app under the User Data policy, and a reviewer re-checking a
 * suspended app opens this screen first — a policy that declares itself
 * provisional is not a valid privacy policy.
 *
 * ACCURACY RULE FOR ANYONE EDITING THIS FILE: a policy that under-states what
 * the code does is itself a violation. Every third-party recipient named in
 * "Who else sees your data" is one the app genuinely contacts:
 *   Google Maps / Places  lib/places.ts        (address text you type, place ids)
 *   SMS provider          lib/msg91.ts         (mobile number + the one-time code)
 *   Razorpay              lib/razorpay.ts      (payment session)
 *   OpenStreetMap         components/MapPicker.tsx, RiderTrackMap.tsx (map tiles)
 * If you add a network call that carries personal data, add it here, to
 * components/DataDisclosure.tsx, and to the Play Data safety form — all three.
 */
export default function PrivacyPolicy() {
  return (
    <DocScreen
      title="Privacy Policy"
      updated="3 August 2026 · v1.0"
      intro="At PYAAS our promise is simple — Know Your Milk. You should always be able to see where your milk came from, who produced it, how it was tested, and how it reached your home. You deserve that same clarity about your personal information. This policy explains what PYAAS DAIRY PRIVATE LIMITED collects, why, who we share it with, and how you stay in control. It is written to comply with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000, and the SPDI Rules, 2011."
      sections={[
        {
          heading: 'Who we are',
          blocks: [
            { kind: 'para', text: 'PYAAS DAIRY PRIVATE LIMITED is the Data Fiduciary; you are the Data Principal. CIN U46302UP2026PTC255483. GSTIN 09AARCP2552Q1ZI. Registered office: A-107, Omicron-II, Greater Noida, Gautam Buddha Nagar, Uttar Pradesh 201310, India. Website www.pyaasdairy.com.' },
            { kind: 'para', text: 'During our launch pilot we deliver Parag milk and dairy products in association with the Pradeshik Cooperative Dairy Federation (PCDF) / Lucknow Milk Union. Parag is a brand of PCDF; PYAAS operates the digital ordering and delivery service.' },
          ],
        },
        {
          heading: 'Information we collect',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Account and identity: your name, mobile number, email address and profile photo.',
                'Delivery information: your addresses, flat or house number, society, landmark, PIN code, gate instructions, delivery preferences and the recipient’s name.',
                'Orders and subscriptions: products, quantities, delivery slots, schedules, pauses and order history.',
                'Payment information: UPI ID, wallet balance and credits, transaction records, and your GST number if you give one. Full card details are handled by our payment partner and are never stored by us.',
                'Communications: your messages to support, complaints, ratings and survey responses.',
                'Location: precise or approximate location, only with your permission, to check we deliver in your area, place your delivery pin and guide the rider.',
                'Device and technical data: device model, operating system, app version and basic error logs. These stay on your device unless you send them to us with a support request.',
                'Know Your Milk scans: when you scan the QR on a pack we record the scan, the batch identifier and the time, so we can show you that pack’s traceability record.',
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
                'To create your account and sign you in with a one-time code.',
                'To deliver your orders and run your subscriptions.',
                'To process payments, wallet recharges and refunds, and to issue your GST bill.',
                'To send order, delivery and payment updates on the channels you have agreed to.',
                'To provide support, prevent fraud and keep the service secure.',
                'To improve the app, and — only where you have consented — to share offers.',
              ],
            },
          ],
        },
        {
          heading: 'Who else sees your data',
          blocks: [
            { kind: 'para', text: 'We never sell your personal data. We share the minimum necessary, with parties bound to protect it:' },
            {
              kind: 'bullets',
              items: [
                'Our SMS provider — receives your mobile number and the one-time code, so we can text it to you when you sign in.',
                'Google Maps — receives what you type in address search, so it can suggest real addresses. You can avoid this by choosing your city and dropping a pin instead.',
                'OpenStreetMap — serves the map tiles shown when you place a delivery pin or track a rider, which reveals the approximate area you are viewing.',
                'Razorpay — our payment gateway, to take payments and process refunds securely.',
                'Delivery partners and riders — your name, address, phone number and delivery instructions, so your order reaches you.',
                'PCDF / Lucknow Milk Union and dairy supply partners — for fulfilment, quality assurance and traceability, on a need-to-know basis.',
                'Cloud hosting, communications and support providers, under confidentiality obligations.',
                'Legal and regulatory authorities, where required by law.',
              ],
            },
            { kind: 'para', text: 'Some of these providers process data outside India. Where that happens we apply the safeguards required by the DPDP Act.' },
          ],
        },
        {
          heading: 'Your consent and choices',
          blocks: [
            { kind: 'para', text: 'Before we collect your mobile number we show you exactly what we collect and who receives it, and we ask you to agree. Nothing is sent until you do. Marketing, WhatsApp, SMS and email updates are separate, optional, and off unless you turn them on. You can withdraw any consent as easily as you gave it.' },
          ],
        },
        {
          heading: 'Retention and security',
          blocks: [
            { kind: 'para', text: 'We keep your data only as long as needed for the purposes above and to meet our legal, tax and accounting obligations. Order and invoice records are retained for the periods the law requires. When data is no longer needed we delete, anonymise or de-identify it; some copies may persist briefly in secure backups before being overwritten.' },
            { kind: 'para', text: 'We use reasonable technical and organisational safeguards, including encryption in transit and access controls. No system is perfectly secure. If a breach occurs we will act as the law requires, including notifying the Data Protection Board of India and affected users where required.' },
          ],
        },
        {
          heading: 'Your rights',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Access — a summary of the personal data we hold about you and how we process it.',
                'Correction — to have inaccurate or incomplete data fixed.',
                'Erasure — to delete your account and data, subject to records the law requires us to keep. You can start this yourself from your profile.',
                'Withdraw consent — at any time, as easily as you gave it.',
                'Grievance redressal — to have complaints addressed by our Grievance Officer.',
                'Nomination — to nominate someone to exercise your rights if you die or become incapacitated.',
              ],
            },
            { kind: 'para', text: 'If you are not satisfied with our response you may escalate to the Data Protection Board of India under the DPDP Act.' },
          ],
        },
        {
          heading: 'Children',
          blocks: [
            { kind: 'para', text: 'The Platform is not intended for children under 18. We do not knowingly collect their data, and we will delete it if we learn we have.' },
          ],
        },
        {
          heading: 'Grievance Officer',
          blocks: [
            { kind: 'para', text: `${GRIEVANCE_OFFICER}, PYAAS DAIRY PRIVATE LIMITED. A-107, Omicron-II, Greater Noida, Gautam Buddha Nagar, Uttar Pradesh 201310, India. Email ${CARE_EMAIL}. Hours: Monday to Saturday, 9:00 a.m. to 6:00 p.m. IST. We respond within the timelines prescribed by law.` },
          ],
        },
      ]}
    />
  );
}
