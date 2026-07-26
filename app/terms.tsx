import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function Terms() {
  return (
    <DocScreen
      title="Terms of Service"
      updated="1 July 2026"
      intro="These terms govern your use of the PYAAS app, operated by the Pradeshik Cooperative Dairy Federation, Uttar Pradesh. By creating an account or placing an order, you agree to these terms."
      sections={[
        {
          heading: 'Your account',
          blocks: [
            { kind: 'para', text: 'You must provide accurate details and keep your account secure. You are responsible for orders placed from your account. You must be able to enter a valid contract under Indian law to use the service.' },
          ],
        },
        {
          heading: 'Orders and pricing',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'All prices shown are the maximum retail price and are inclusive of GST. There is no separate delivery-time promise of instant or ten-minute delivery; your order is delivered to your door on the delivery day or slot shown.',
                'We list fresh dairy products. Availability depends on daily supply from the cooperative network, and an item may occasionally be unavailable.',
                'We may accept or decline an order. If we cannot fulfil an accepted order, we will refund the amount paid.',
              ],
            },
          ],
        },
        {
          heading: 'Subscriptions',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Milk and select products can be set up as a recurring subscription with a start date and quantity you choose.',
                'You can pause (vacation), modify quantity, or cancel a subscription from the app before the daily cut-off. Changes made after the cut-off apply from the next eligible delivery.',
                'Prepaid subscriptions draw from your PYAAS wallet balance. Keep enough balance to avoid a missed delivery.',
              ],
            },
          ],
        },
        {
          heading: 'Wallet',
          blocks: [
            { kind: 'para', text: 'The PYAAS wallet is a prepaid balance used to pay for orders and subscriptions. Wallet balance is non-transferable and, except where required by law or our refund policy, non-withdrawable as cash. Any promotional bonus credited to your wallet may carry its own validity and conditions.' },
          ],
        },
        {
          heading: 'Food safety and use',
          blocks: [
            { kind: 'para', text: 'Our products are perishable. Please refrigerate on receipt and consume within the shelf life printed on the pack. Follow storage and boiling instructions on the label.' },
          ],
        },
        {
          heading: 'Acceptable use',
          blocks: [
            { kind: 'para', text: 'Do not misuse the app, attempt to defraud, resell products without authorisation, or abuse promotions, referrals or wallet bonuses. We may suspend accounts that break these terms.' },
          ],
        },
        {
          heading: 'Liability',
          blocks: [
            { kind: 'para', text: 'To the extent permitted by law, our liability for any order is limited to the amount you paid for that order. We are not liable for delays caused by events beyond our reasonable control.' },
          ],
        },
        {
          heading: 'Changes and governing law',
          blocks: [
            { kind: 'para', text: 'We may update these terms and will note the updated date above. Continued use means you accept the updated terms. These terms are governed by the laws of India, with courts in Uttar Pradesh having jurisdiction.' },
          ],
        },
      ]}
      footerNote="This is a placeholder template for the PYAAS app. The registered entity name, jurisdiction and any product-specific terms are to be confirmed by the operator before public release."
    />
  );
}
