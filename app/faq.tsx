import React from 'react';
import { DocScreen, type DocSection } from '../components/DocScreen';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Where does PYAAS milk come from?',
    a: 'PYAAS is a cooperative brand. Milk is pooled from a network of village societies and member dairies across Uttar Pradesh, then tested, chilled, processed and packed. It is not from a single farm.',
  },
  {
    q: 'Are the prices inclusive of GST?',
    a: 'Yes. Every price you see is the maximum retail price and is inclusive of GST. There are no hidden charges and no invented discounts. A small delivery charge, if any, is shown clearly at checkout.',
  },
  {
    q: 'How soon will my order arrive?',
    a: 'Your order is delivered to your door soon, on the delivery day or morning slot shown at checkout. We plan routes for freshness and reliability rather than a rushed delivery-speed promise.',
  },
  {
    q: 'How do subscriptions work?',
    a: 'Pick a product, a start date and a quantity, and it is delivered on your schedule. You can pause, skip a day, change quantity or cancel anytime from the Subscriptions screen before the daily cut-off.',
  },
  {
    q: 'What is the PYAAS wallet?',
    a: 'It is a prepaid balance used to pay for orders and subscriptions. Recharge it, and your daily deliveries draw from it automatically. Refunds for eligible issues are credited here so your next order is instant.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'You can cancel while an order is still Placed or Confirmed. Once it is being prepared or out for delivery it can no longer be cancelled in the app. See the Cancellation Policy for details.',
  },
  {
    q: 'What if an item is missing or spoilt?',
    a: 'Open the order, use Help and support, choose the issue and describe it, ideally on the same day with a photo. Approved refunds are credited to your wallet, usually within 24 to 48 hours. See the Refund Policy.',
  },
  {
    q: 'How do I get a bill / invoice?',
    a: 'Every order has a proforma bill with product-wise GST (CGST + SGST) and HSN codes. Open the order and choose "View bill" to view and share it. If you have a company GSTIN, add it during checkout to see it on the bill.',
  },
  {
    q: 'How should I store the products?',
    a: 'Our products are perishable. Refrigerate on receipt and consume within the shelf life printed on the pack. Follow any storage or boiling instructions on the label.',
  },
  {
    q: 'Do you deliver to my area?',
    a: 'We deliver within serviceable pincodes in our launch areas. If your pincode is not covered yet, the app will tell you. We are expanding to new areas over time.',
  },
];

export default function Faq() {
  const sections: DocSection[] = FAQS.map((f) => ({
    heading: f.q,
    blocks: [{ kind: 'para', text: f.a }],
  }));
  return (
    <DocScreen
      title="Frequently Asked Questions"
      intro="Quick answers to common questions about PYAAS orders, subscriptions, payments and delivery. Still stuck? Reach us from Contact Us."
      sections={sections}
      footerNote="Serviceable areas, cut-off times and thresholds differ by delivery area and are shown in the app for your address."
    />
  );
}
