import React from 'react';
import { View } from 'react-native';
import { colors } from '../lib/theme';

/**
 * "/" route: a plain branded backdrop. The root navigator overlays the animated
 * Splash and immediately redirects to the tabs (signed in), the profile gate
 * (signed in, no name yet), or the email sign-in screen (signed out).
 */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: colors.roseDeep }} />;
}
