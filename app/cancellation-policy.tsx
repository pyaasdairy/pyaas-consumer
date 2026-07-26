import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function CancellationPolicy() {
  return (
    <DocScreen
      title="Cancellation Policy"
      updated="1 July 2026"
      intro="You can cancel a one-time order or change a subscription within the windows below. Because dairy is prepared and dispatched fresh each morning, cancellations must reach us before the daily cut-off."
      sections={[
        {
          heading: 'One-time orders',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'You can cancel while the order is still Placed or Confirmed, from the order screen.',
                'Once the order is being prepared or is out for delivery, it can no longer be cancelled in the app. If you no longer need it, please refuse it at the door or contact support.',
                'If you paid online or from your wallet for a cancelled order, the amount is credited back to your PYAAS wallet.',
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
                'You can pause, skip a day, change quantity, or cancel a subscription from the Subscriptions screen.',
                'Changes made before the daily cut-off apply from the next delivery. Changes after the cut-off apply from the following eligible day.',
                'Use Vacation mode to pause deliveries for a date range when you are away, without cancelling the subscription.',
              ],
            },
          ],
        },
        {
          heading: 'Daily cut-off',
          blocks: [
            { kind: 'para', text: 'The cut-off is the evening before the delivery day. Milk routes are planned overnight, so a same-morning cancellation may not be possible once the route is finalised.' },
          ],
        },
        {
          heading: 'Refunds on cancellation',
          blocks: [
            { kind: 'para', text: 'Amounts for validly cancelled orders or paused subscription days are credited to your PYAAS wallet. For a refund to the original payment method, see the Refund Policy.' },
          ],
        },
      ]}
      footerNote="This is a placeholder template. The exact daily cut-off time is to be confirmed by the operator for each delivery area."
    />
  );
}
