import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';
import { AddressCaptureSheet } from '../components/AddressCapture';
import { modalsSettled } from '../components/SafeModal';

/**
 * "New address" route (profile → addresses → add). One implementation
 * everywhere: renders the shared CD-style AddressCaptureSheet — map with
 * manual search first, then the COMPLETE address form (flat*, locality/
 * landmark optional, receiver*, auto-filled city* + pincode*, ring-the-bell /
 * call-before preferences, door photo, instructions). Saving pops back.
 *
 * Leaving DISMISSES the presented sheet (and the map above it) first and only
 * then navigates: router.back() while a fullScreen modal stack is presented
 * unmounts it mid-transition, which is the UIKit wedge that black-screens the
 * app. modalsSettled() resolves once every modal transition has completed.
 */
export default function AddAddress() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  function leave() {
    setOpen(false);
    void modalsSettled().then(() => router.back());
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <AddressCaptureSheet visible={open} onClose={leave} onSaved={leave} />
    </View>
  );
}
