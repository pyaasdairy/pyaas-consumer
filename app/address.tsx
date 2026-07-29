import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, Button, Field, Tap } from '../components/ui';
import { addAddress } from '../lib/api';
import { getDeviceCoords, setAddressCoords, type Coords } from '../lib/location';
import {
  placesAutocomplete,
  placeDetails,
  isPlacesEnabled,
  newSessionToken,
  type PlaceSuggestion,
} from '../lib/places';

const LABELS = ['Home', 'Work', 'Other'];

export default function AddAddress() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [pinning, setPinning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Places predictive-address seam (no-op unless EXPO_PUBLIC_GOOGLE_PLACES_KEY) ─
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [pickedSuggestion, setPickedSuggestion] = useState(false); // suppress refetch after a pick
  const sessionToken = useRef(newSessionToken());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isPlacesEnabled()) return;
    if (pickedSuggestion) { setPickedSuggestion(false); return; }
    const q = line1.trim();
    if (q.length < 3) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const res = await placesAutocomplete(q, { signal: ctrl.signal, sessionToken: sessionToken.current });
      setSuggestions(res);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line1]);

  async function chooseSuggestion(s: PlaceSuggestion) {
    setPickedSuggestion(true);
    setSuggestions([]);
    const d = await placeDetails(s.placeId, { sessionToken: sessionToken.current });
    sessionToken.current = newSessionToken(); // end the billing session
    if (d) {
      if (d.line1) setLine1(d.line1);
      else setLine1(s.primary);
      if (d.line2) setLine2(d.line2);
      if (d.city) setCity(d.city);
      if (d.pincode) setPincode(d.pincode);
      if (d.lat != null && d.lng != null) setCoords({ lat: d.lat, lng: d.lng });
    } else {
      setLine1(s.primary);
      if (s.secondary) setLine2(s.secondary);
    }
    Haptics.selectionAsync();
  }

  async function pinLocation() {
    setPinning(true); setError('');
    const c = await getDeviceCoords();
    setPinning(false);
    if (c) { setCoords(c); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    else setError('Location permission denied. You can still save the address.');
  }

  async function save() {
    if (!line1.trim() || !city.trim() || pincode.trim().length < 5) {
      setError('Please add the address, city and a valid pincode.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await addAddress({ label, line1: line1.trim(), line2: line2.trim() || null, city: city.trim(), pincode: pincode.trim(), is_default: false });
      if (coords && created?.id) await setAddressCoords(created.id, coords);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save address.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.milk }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Tap onPress={() => router.back()} style={iconBtn}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Tap>
        <Serif style={{ fontSize: 24 }}>New address</Serif>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {LABELS.map((l) => {
            const active = label === l;
            return (
              <Tap
                key={l}
                onPress={() => setLabel(l)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.action : colors.white,
                  borderWidth: 1,
                  borderColor: active ? colors.action : colors.line,
                }}
              >
                <TextMed color={active ? colors.white : colors.inkSoft} style={{ fontSize: 13.5 }}>
                  {l}
                </TextMed>
              </Tap>
            );
          })}
        </View>

        <View>
          <Field label="Flat / House / Building" value={line1} onChangeText={setLine1} placeholder="Flat 402, Lotus Apartments" autoComplete="street-address" textContentType="fullStreetAddress" />
          {suggestions.length > 0 ? (
            <View style={{ marginTop: 6, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
              {suggestions.map((s, i) => (
                <Tap
                  key={s.placeId}
                  haptic={false}
                  onPress={() => chooseSuggestion(s)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}
                >
                  <Ionicons name="location-outline" size={17} color={colors.flameDeep} />
                  <View style={{ flex: 1 }}>
                    <TextMed style={{ fontSize: 14 }}>{s.primary}</TextMed>
                    {s.secondary ? <TextBody style={{ fontSize: 12 }}>{s.secondary}</TextBody> : null}
                  </View>
                </Tap>
              ))}
            </View>
          ) : null}
        </View>
        <Field label="Area / Landmark (optional)" value={line2} onChangeText={setLine2} placeholder="Near City Park" autoComplete="address-line2" />
        <Field label="City" value={city} onChangeText={setCity} placeholder="Lucknow" autoComplete="postal-address-locality" textContentType="addressCity" />
        <Field label="Pincode" value={pincode} onChangeText={setPincode} placeholder="226001" keyboardType="number-pad" maxLength={6} autoComplete="postal-code" textContentType="postalCode" />

        {/* Location backdoor: pin precise GPS so the rider has exact coordinates */}
        <Tap haptic={false} onPress={pinLocation} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: coords ? colors.blue : colors.line, padding: spacing.md }}>
          <Ionicons name={coords ? 'checkmark-circle' : 'navigate-circle-outline'} size={22} color={coords ? colors.blue : colors.flameDeep} />
          <View style={{ flex: 1 }}>
            <TextMed style={{ fontSize: 14 }}>{coords ? 'Location pinned' : pinning ? 'Getting location…' : 'Pin my current location'}</TextMed>
            <TextBody style={{ fontSize: 12 }}>{coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} · helps your rider reach the exact door` : 'Optional · gives your rider precise coordinates'}</TextBody>
          </View>
        </Tap>

        {error ? <TextBody color={colors.flameDeep} style={{ fontSize: 13.5 }}>{error}</TextBody> : null}
        <Button title="Save address" onPress={save} loading={saving} style={{ marginTop: 6 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const iconBtn = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.white,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  ...shadow.soft,
};
