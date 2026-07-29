import React from 'react';
import { ComingSoon } from '../components/ComingSoon';

/**
 * Standalone out-of-zone route. The Home tab renders <ComingSoon /> inline when
 * its serviceability gate trips; this route exists so the same screen can be
 * navigated to directly (e.g. from a deep link or an address change).
 */
export default function ComingSoonScreen() {
  return <ComingSoon />;
}
