import React, { useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap, Pill, BackButton } from '../components/ui';
import { listAddresses, setDefaultAddress, deleteAddress, type Address } from '../lib/api';

export default function Addresses() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setAddresses(await listAddresses()); } catch { /* keep last-known list */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function makeDefault(id: string) {
    setErr('');
    try { await setDefaultAddress(id); await load(); }
    catch (e: any) { setErr(e?.message ?? 'Could not set the default address.'); }
  }

  async function remove(id: string) {
    setErr('');
    try { await deleteAddress(id); await load(); }
    catch (e: any) { setErr(e?.message ?? 'Could not delete the address.'); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <Serif style={{ fontSize: 24 }}>Saved addresses</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}
        {addresses.length === 0 ? (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: 10 }}>
            <Ionicons name="location-outline" size={30} color={colors.inkMute} />
            <TextBody>No saved addresses yet.</TextBody>
          </View>
        ) : (
          addresses.map((a) => (
            <View key={a.id} style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, ...shadow.soft }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextSemi style={{ fontSize: 14.5 }}>{a.label}</TextSemi>
                  {a.is_default ? <Pill label="DEFAULT" /> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  {!a.is_default ? (
                    <Tap haptic={false} onPress={() => makeDefault(a.id)}>
                      <TextMed color={colors.blue} style={{ fontSize: 12.5 }}>Set default</TextMed>
                    </Tap>
                  ) : null}
                  <Tap haptic={false} onPress={() => remove(a.id)}>
                    <Ionicons name="trash-outline" size={16} color={colors.inkMute} />
                  </Tap>
                </View>
              </View>
              <TextBody style={{ fontSize: 13.5, lineHeight: 19 }}>
                {[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}
              </TextBody>
            </View>
          ))
        )}
        <Button title="+ Add new address" variant="outline" onPress={() => router.push('/address')} />
      </ScrollView>
    </View>
  );
}
