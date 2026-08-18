import React from 'react';
import { DocScreen } from '../components/DocScreen';
import { CARE_EMAIL } from '../lib/support';

/**
 * TERMS AND CONDITIONS — the in-app rendering of the published Terms of
 * PYAAS DAIRY PRIVATE LIMITED (v1.0, effective 3 August 2026).
 *
 * This replaced a placeholder template whose own footer said the registered
 * entity name, jurisdiction and product terms were "to be confirmed by the
 * operator before public release". Google Play removed this app under the User
 * Data policy, and on a re-review of a suspended app a legal screen that admits
 * it is provisional is a liability, not a formality.
 *
 * Keep this in step with the published document and with app/privacy-policy.tsx.
 */
export default function Terms() {
  return (
    <DocScreen
      title="Terms and Conditions"
      updated="3 August 2026 · v1.0"
      intro="These terms govern your use of the PYAAS app and www.pyaasdairy.com, operated by PYAAS DAIRY PRIVATE LIMITED. By creating an account or placing an order, you agree to them. During our launch pilot we deliver Parag milk and dairy products in association with the Pradeshik Cooperative Dairy Federation (PCDF) / Lucknow Milk Union. Parag is a brand of PCDF; PYAAS operates the digital ordering and delivery service."
      sections={[
        {
          heading: 'Who we are',
          blocks: [
            { kind: 'para', text: 'PYAAS DAIRY PRIVATE LIMITED. CIN U46302UP2026PTC255483. GSTIN 09AARCP2552Q1ZI. Registered office: A-107, Omicron-II, Greater Noida, Gautam Buddha Nagar, Uttar Pradesh 201310, India.' },
          ],
        },
        {
          heading: 'Eligibility and your account',
          blocks: [
            { kind: 'para', text: 'You must be 18 or older to use the platform. To order, you create an account with a valid mobile number. You are responsible for keeping your login details confidential and for activity under your account, and for keeping your delivery address and contact number accurate and current.' },
            { kind: 'para', text: `Tell us promptly at ${CARE_EMAIL} if you suspect unauthorised use of your account. We may suspend or close an account that breaches these terms, provides false information, or misuses the platform.` },
          ],
        },
        {
          heading: 'The service we provide',
          blocks: [
            { kind: 'para', text: 'You can browse products, place one-time orders, set up subscriptions, and receive doorstep delivery within our serviceable areas. Availability, delivery slots and serviceable areas vary and change, and are shown in the app.' },
            { kind: 'para', text: 'We make reasonable efforts to keep descriptions, images and availability accurate, but we do not warrant that everything is error-free. Images are indicative. Where there is a discrepancy, the details confirmed on your order and the actual packaging prevail.' },
          ],
        },
        {
          heading: 'Delivery',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Give us a complete, accurate address and any access or security instructions, and make sure the products can be received or safely left at your door during the slot.',
                'We aim to deliver within your selected slot, but times are estimates and can vary with operations, weather and traffic.',
                'Risk and title pass to you on delivery to your address or nominated point. If you ask us to leave products unattended, the risk after delivery is yours.',
                'If we cannot deliver because the address is inaccessible or incorrect, or nobody is available for a hand-over, the delivery may be treated as completed, except where the law or our policies say otherwise.',
                'If a product becomes unavailable we may offer a suitable substitute or credit your wallet for the undelivered item.',
              ],
            },
          ],
        },
        {
          heading: 'Pricing, charges and taxes',
          blocks: [
            { kind: 'para', text: 'Prices shown are inclusive of applicable taxes unless stated otherwise. Delivery charges, fees or minimum-order requirements, where they apply, are displayed before you confirm. We may change prices and fees; any change applies to orders and subscription deliveries scheduled after it takes effect, so please review the price before each delivery.' },
          ],
        },
        {
          heading: 'Payments and wallet',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'You can pay by UPI, card, net banking or the PYAAS wallet. Payments are processed by our payment partner; we never store your full payment credentials.',
                'Wallet balances are prepaid amounts for products. They are not a deposit, earn no interest, and are non-transferable.',
                'For subscriptions, the amount for each scheduled delivery is taken from your wallet or chosen payment method.',
                'We may pause deliveries if a payment fails or the wallet balance is insufficient.',
                'If you delete your account, any remaining wallet balance is forfeited unless you contact support to settle it before deletion; deletion is irreversible.',
              ],
            },
            { kind: 'para', text: `For payment disputes, contact ${CARE_EMAIL}.` },
          ],
        },
        {
          heading: 'Offers, trials and referrals',
          blocks: [
            { kind: 'para', text: 'Promotions, trial offers, referral rewards and loyalty benefits each carry their own eligibility and validity, shown in the app. Launch and trial offers are for eligible new users only, are limited to one per household unless stated otherwise, and are neither transferable nor redeemable for cash. We may modify or withdraw an offer at any time except where it has already been validly availed, and we may withhold or reverse benefits obtained through misuse or fraud.' },
          ],
        },
        {
          heading: 'Cancellations, replacements and refunds',
          blocks: [
            { kind: 'para', text: 'Cancellation windows, replacement and refund terms are set out in our Cancellation Policy and Refund Policy in the app. If a product arrives damaged, leaking, spoiled, incorrect or short in quantity, report it through the app or to support, with details and a photograph where possible, within the timeframe shown in the app (typically the same day of delivery). On verification we will replace it or credit your wallet.' },
          ],
        },
        {
          heading: 'Product quality and food safety',
          blocks: [
            { kind: 'para', text: 'Products are sourced, handled and delivered in compliance with the Food Safety and Standards Act, 2006 and applicable food-safety law. Nutritional and product information appears on the packaging and, where available, in the app. Follow the storage and boiling instructions on the label.' },
          ],
        },
        {
          heading: 'Acceptable use',
          blocks: [
            { kind: 'para', text: 'Do not misuse the app, attempt to defraud us, resell products without authorisation, or abuse promotions, referrals or wallet benefits. We may suspend accounts that break these terms.' },
          ],
        },
        {
          heading: 'Intellectual property',
          blocks: [
            { kind: 'para', text: 'The PYAAS name, logo, "Know Your Milk" branding and platform content are owned by or licensed to PYAAS. The Parag brand, marks and artwork are the property of PCDF / the Lucknow Milk Union and are used in connection with the products under the applicable arrangement. Nothing here grants you the right to use these marks without prior written permission.' },
          ],
        },
        {
          heading: 'Liability',
          blocks: [
            { kind: 'para', text: 'To the extent permitted by law, our liability for any order is limited to the amount you paid for that order. We are not liable for delays caused by events beyond our reasonable control.' },
          ],
        },
        {
          heading: 'Governing law',
          blocks: [
            { kind: 'para', text: 'These terms are governed by the laws of India. Courts in Uttar Pradesh have jurisdiction. We may update these terms and will note the updated date above; continued use means you accept the updated terms.' },
          ],
        },
      ]}
    />
  );
}
