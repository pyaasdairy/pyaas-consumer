import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { DocScreen, DocCard, DocLinkRow } from '../components/DocScreen';
import { SELLER } from '../lib/invoice';
import { CARE_EMAIL, CARE_PHONE, CARE_PHONE_TEL } from '../lib/support';

export default function FssaiDetails() {
  return (
    <DocScreen
      title="FSSAI & Legal"
      intro="Food business and licensing details for the PYAAS app, in line with FSSAI display norms for food businesses selling online."
      sections={[
        {
          heading: 'Food safety',
          blocks: [
            { kind: 'para', text: 'PYAAS products are dairy foods manufactured and packed under the applicable food-safety standards. Please refrigerate on receipt and consume within the shelf life printed on each pack.' },
          ],
        },
      ]}
      footerNote="The FSSAI licence shown is the manufacturer's (PARAG, Lucknow Producers Co-operative Milk Union Ltd), as printed on every pack. The GSTIN, registered address and customer care number are placeholders to be replaced with the operator's registered values before public release."
    >
      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="shield-checkmark-outline" size={20} color={colors.flameDeep} />}
          label="FSSAI licence number"
          value={`${SELLER.fssai} · Lucknow Producers Co-operative Milk Union Ltd (PARAG)`}
        />
        <DocLinkRow
          icon={<Ionicons name="receipt-outline" size={20} color={colors.flameDeep} />}
          label="GSTIN (placeholder)"
          value={`${SELLER.gstin} · placeholder, pending registration`}
        />
        <DocLinkRow
          icon={<Ionicons name="business-outline" size={20} color={colors.flameDeep} />}
          label="Manufacturer / brand owner"
          value={SELLER.name}
        />
        <DocLinkRow
          icon={<Ionicons name="location-outline" size={20} color={colors.flameDeep} />}
          label="Registered address (placeholder)"
          value={SELLER.address}
          last
        />
      </DocCard>

      <DocCard>
        <DocLinkRow
          icon={<Ionicons name="call-outline" size={20} color={colors.inkSoft} />}
          label="Customer care (placeholder)"
          value={CARE_PHONE}
          href={`tel:${CARE_PHONE_TEL}`}
        />
        <DocLinkRow
          icon={<Ionicons name="mail-outline" size={20} color={colors.inkSoft} />}
          label="Customer care email"
          value={CARE_EMAIL}
          href={`mailto:${CARE_EMAIL}?subject=PYAAS%20FSSAI%20query`}
          last
        />
      </DocCard>
    </DocScreen>
  );
}
