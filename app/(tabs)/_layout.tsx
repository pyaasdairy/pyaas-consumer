import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { PyaasTabBar } from '../../components/PyaasTabBar';
import LocationGate from '../../components/LocationGate';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <PyaasTabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Shop' }} />
        <Tabs.Screen name="traceability" options={{ title: 'Know your milk' }} />
        <Tabs.Screen name="vip" options={{ title: 'PYAAS Plus' }} />
        <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        {/* Orders stays a registered tab route (reached from Profile / home) but is
            intentionally not shown in the bar. */}
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      </Tabs>
      {/* The 2+2 ClaimPackGate is retired — the Welcome Litre funnel (campaign
          §15, server-truth) is the app's only acquisition surface. Running
          trials keep their accounting; only the pitch entry died. */}
      {/* App-wide delivery-location picker + city-shift guard (covers Coming Soon). */}
      <LocationGate />
    </View>
  );
}
