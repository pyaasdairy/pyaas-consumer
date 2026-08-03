import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';
import { AddressCaptureSheet } from '../components/AddressCapture';

/**
 * "New address" route (profile → addresses → add). One implementation
 * everywhere: renders the shared CD-style AddressCaptureSheet — map with
 * manual search first, then the COMPLETE address form (flat*, locality/
 * landmark optional, receiver*, auto-filled city* + pincode*, ring-the-bell /
 * call-before preferences, door photo, instructions). Saving pops back.
 */
export default function AddAddress() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <AddressCaptureSheet visible onClose={() => router.back()} onSaved={() => router.back()} />
    </View>
  );
}
