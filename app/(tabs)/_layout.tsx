import React from 'react';
import { Tabs } from 'expo-router';
import { PyaasTabBar } from '../../components/PyaasTabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <PyaasTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Shop' }} />
      <Tabs.Screen name="traceability" options={{ title: 'Know your milk' }} />
      <Tabs.Screen name="vip" options={{ title: 'VIP' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      {/* Orders stays a registered tab route (reached from Profile / home) but is
          intentionally not shown in the bar · Wallet took its slot. */}
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
    </Tabs>
  );
}
