import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { ParagTabBar } from '../../components/ParagTabBar';
import { ClaimPackGate } from '../../components/ClaimPackFlow';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <ParagTabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Shop' }} />
        <Tabs.Screen name="traceability" options={{ title: 'Know your milk' }} />
        <Tabs.Screen name="vip" options={{ title: 'PARAG Plus' }} />
        <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        {/* Orders stays a registered tab route (reached from Profile / home) but is
            intentionally not shown in the bar. */}
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      </Tabs>
      {/* Welcome claim-your-free-pack flow (address + location + delivery window),
          shown once per device to an eligible member on launch. */}
      <ClaimPackGate />
    </View>
  );
}
