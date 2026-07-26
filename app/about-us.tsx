import React from 'react';
import { DocScreen } from '../components/DocScreen';

export default function AboutUs() {
  return (
    <DocScreen
      title="About PARAG"
      intro="PARAG is the consumer brand of the Pradeshik Cooperative Dairy Federation, Uttar Pradesh, a cooperative that brings together many member dairies and thousands of farmer families across the state."
      sections={[
        {
          heading: 'A cooperative, not a single farm',
          blocks: [
            { kind: 'para', text: 'PARAG milk and dairy come from a network of cooperative dairies, not one farm. Milk is pooled from village-level societies, tested, chilled, processed and packed under the PARAG brand, so quality stays consistent while farmer members earn a fair share.' },
          ],
        },
        {
          heading: 'What we make',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Fresh pasteurised milk, from toned to full-cream and premium gold.',
                'Dahi, paneer, ghee, butter and chaach.',
                'Flavoured milk, lassi and seasonal sweets.',
              ],
            },
          ],
        },
        {
          heading: 'Our promise',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'Honest pricing: the price you see is the maximum retail price, inclusive of GST, with no invented discounts.',
                'Freshness first: routes are planned so your order reaches your door fresh, without gimmicky delivery-speed promises.',
                'Traceability: we are building clear links from the cooperative network to the pack you receive.',
              ],
            },
          ],
        },
        {
          heading: 'Supporting farmers',
          blocks: [
            { kind: 'para', text: 'Every order supports the cooperative model, where member farmers are paid for the milk they pour and share in the value the brand creates. This is the heart of the cooperative dairy movement in Uttar Pradesh.' },
          ],
        },
      ]}
      footerNote="This is a placeholder brand description for the PYAAS app. Member-dairy figures, history and certifications are to be confirmed by the operator before public release."
    />
  );
}
