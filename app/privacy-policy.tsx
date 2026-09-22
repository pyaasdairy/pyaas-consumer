import React from 'react';
import { DocScreen } from '../components/DocScreen';
import { PRIVACY } from '../constants/legal';

/**
 * PRIVACY POLICY — exactly the text published at www.pyaasdairy.com/privacy
 * (founder call, 21 Sep). Generated into constants/legal.ts by
 * scripts/sync-legal.py; never edit the wording here, change the website and
 * re-run the script.
 */
export default function PrivacyPolicy() {
  return (
    <DocScreen
      title="Privacy Policy"
      updated={PRIVACY.updated}
      intro={PRIVACY.intro.join('\n\n')}
      sections={PRIVACY.sections}
    />
  );
}
