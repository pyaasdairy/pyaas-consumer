import React from 'react';
import { DocScreen } from '../components/DocScreen';

// Every figure that used to sit on this page ("many member dairies", "thousands
// of farmer families") was a round number nobody could evidence, so it is out.
// What stays is what the pack itself proves: who makes the goods and who sells
// them. Add a number here only with a document behind it.
export default function AboutUs() {
  return (
    <DocScreen
      title="About PYAAS"
      intro="PYAAS delivers fresh cooperative milk and dairy to homes in Uttar Pradesh. We are the seller and the delivery service; the dairy itself is made by a cooperative milk union and reaches you in that manufacturer's sealed pack."
      sections={[
        {
          heading: 'Who makes what you order',
          blocks: [
            { kind: 'para', text: 'The launch range is PARAG-branded milk and dairy manufactured by Lucknow Producers Co-operative Milk Union Ltd. PARAG is the union\'s own brand, not ours. Its name, plant address and FSSAI licence are printed on every pack, and the same details are on your bill under "Goods manufactured by".' },
          ],
        },
        {
          heading: 'A cooperative, not a single farm',
          blocks: [
            { kind: 'para', text: 'Cooperative dairy does not come from one farm. Milk is poured and tested at village-level societies, pooled, then chilled, processed and packed at a district union plant, so quality stays consistent and the farmer members who poured the milk are the ones paid for it.' },
          ],
        },
        {
          heading: 'What we deliver',
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
          heading: 'What we do not claim',
          blocks: [
            { kind: 'para', text: 'PYAAS holds no quality grade, organic mark or environmental certification of its own. Any grade or licence that applies to a product belongs to the dairy that made it and is printed on that pack. We do not publish farmer counts, plant capacities or impact figures, because we have none we can substantiate yet.' },
          ],
        },
      ]}
      footerNote="This brand description is deliberately free of unverified numbers. Company history, registration details and any certifications will be published here only once the operator can evidence them."
    />
  );
}
