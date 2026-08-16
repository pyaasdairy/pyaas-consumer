import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function RefundPolicy() {
  return (
    <DocScreen
      title="Refund Policy"
      updated="1 July 2026"
      intro="We want every PYAAS delivery to be right. Because milk and dairy are perishable food items, we handle returns and refunds a little differently from ordinary goods. This policy explains when and how you get a refund."
      sections={[
        {
          heading: 'When you can raise a refund',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'An item was missing from your delivery.',
                'You received the wrong item or wrong pack size.',
                'The product was spoilt, leaking, or the seal was broken on arrival.',
                'The product was past its shelf life on the day of delivery.',
                'You were charged but the order was not delivered.',
              ],
            },
          ],
        },
        {
          heading: 'Perishable items',
          blocks: [
            { kind: 'para', text: 'For food-safety reasons we cannot take back opened or used perishable products. If there is a genuine quality issue, please report it promptly, ideally on the same day of delivery, with a photo where possible, so we can verify and make it right.' },
          ],
        },
        {
          heading: 'How to report',
          blocks: [
            { kind: 'para', text: 'Open the order, use Help and support, choose the issue type, and describe what happened. You can also email support@pyaasdairy.com. Reporting on the day of delivery helps us resolve it fastest.' },
          ],
        },
        {
          heading: 'How refunds are paid',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Approved refunds are credited to your PYAAS wallet by default, usually within 24 to 48 hours, so your next order is instant.',
                'For payments made online, you may request the refund back to the original payment method. Bank or UPI refunds typically take 5 to 7 working days depending on your bank.',
                'For a cash-on-delivery order that was not delivered, the refund is credited to your wallet.',
              ],
            },
          ],
        },
        {
          heading: 'What is not eligible',
          blocks: [
            { kind: 'para', text: 'Requests raised well after the delivery day for a perishable item, a change of mind after a perishable product has been accepted and opened, or issues we cannot reasonably verify may not qualify. Wallet promotional bonuses are not refundable as cash.' },
          ],
        },
      ]}
      footerNote="Wallet credits are immediate on approval. Refunds to a bank or card are subject to your bank or payment provider's processing time."
    />
  );
}
