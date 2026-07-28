import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function ShippingPolicy() {
  return (
    <DocScreen
      title="Shipping & Delivery"
      updated="1 July 2026"
      intro="PYAAS delivers fresh milk and dairy to your door. We plan routes so your order arrives fresh on the delivery day or slot you choose. We focus on freshness and reliability rather than rushing."
      sections={[
        {
          heading: 'How delivery works',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Your order is delivered to your door soon, on the delivery day or morning slot shown at checkout.',
                'Subscriptions are delivered on your chosen schedule, typically in the early morning window.',
                'You will get updates in the app, and on any channels you have opted into, as your order moves from confirmed to out for delivery to delivered.',
              ],
            },
          ],
        },
        {
          heading: 'Delivery areas',
          blocks: [
            { kind: 'para', text: 'We deliver within serviceable pincodes in our launch areas. If your pincode is not yet covered, the app will let you know, and we are expanding to new areas over time.' },
          ],
        },
        {
          heading: 'Delivery charges',
          blocks: [
            { kind: 'para', text: 'A small delivery charge may apply on smaller orders and is shown clearly at checkout. Orders above the free-delivery threshold shown in the app are delivered free. All charges are inclusive of applicable taxes.' },
          ],
        },
        {
          heading: 'When you are not home',
          blocks: [
            { kind: 'para', text: 'Add delivery instructions to your address, for example a safe place to leave the order or a guard to hand it to. For perishable items we recommend someone is available to receive and refrigerate the delivery promptly.' },
          ],
        },
        {
          heading: 'Delays',
          blocks: [
            { kind: 'para', text: 'On rare occasions weather, local conditions or supply may delay a delivery. We will keep you informed and, where a delivery cannot be completed, credit your wallet as per the Refund Policy.' },
          ],
        },
      ]}
      footerNote="This is a placeholder template. Serviceable pincodes, delivery windows and the free-delivery threshold are to be confirmed by the operator for each area."
    />
  );
}
