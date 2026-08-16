import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import MapPicker from './MapPicker';
import { addAddress, type Address } from '../lib/api';
import { setAddressCoords, type Coords } from '../lib/location';
import { geoAddress, useUserLocation } from '../lib/userLocation';
import { getServiceability, joinWaitlist } from '../lib/serviceability';
import { useAuth } from '../lib/auth';

/**
 * THE address capture — the ONE complete, Country-Delight-style flow used
 * everywhere an address is created (claim funnel, subscribe gate, the profile
 * "new address" screen). Two steps, map FIRST:
 *
 *   1. MAP — full-screen draggable pin with MANUAL SEARCH on the map (Places
 *      when a key is set, OS geocoder otherwise) + "use my current location".
 *   2. FORM — the pinned spot in words (tap to adjust), then the COMPLETE
 *      address: Flat/House* · Locality/Landmark (optional) · Receiver name* ·
 *      City* + Pincode* (auto-filled from the pin on EVERY confirm — a new pin
 *      overwrites stale values, so city and pincode always match the pin) —
 *      plus delivery preferences: ring the bell, call before delivery, a
 *      sample door photo and free-text instructions.
 *
 * Saving stores the address + the exact geo pin (both — the pin routes the
 * rider, the words route a human) and marks the member's delivery location
 * exact, then hands the saved Address back to the caller.
 */
export function AddressCaptureSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (address: Address) => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  // Starts false — auto-opened from the parent Modal's onShow. Presenting the
  // nested map Modal while this sheet is still sliding in silently fails on
  // Android, leaving mapOpen stuck true (so banner taps became no-ops).
  const [mapOpen, setMapOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);

  const [flat, setFlat] = useState('');
  const [locality, setLocality] = useState('');
  const [receiver, setReceiver] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [ringBell, setRingBell] = useState(true);
  const [callBefore, setCallBefore] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [doorPhoto, setDoorPhoto] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // ── Keyboard handling ──────────────────────────────────────────────────────
  // This sheet is a statusBarTranslucent Modal: on Android such windows do NOT
  // resize for the keyboard (the app-wide adjustResize never applies inside
  // them), so without help the keyboard just covers whatever field was tapped.
  // We track the keyboard height ourselves, pad the scroll area by it, and
  // scroll the focused input into view the moment the keyboard lands.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const { height: winH } = useWindowDimensions();
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setKbHeight(h);
      // Bring the focused field fully above the keyboard (24px breathing room).
      requestAnimationFrame(() => {
        const focused = TextInput.State.currentlyFocusedInput?.();
        if (!focused) return;
        focused.measureInWindow((_x: number, y: number, _w: number, fieldH: number) => {
          const visibleBottom = winH - h - 24;
          const overlap = y + fieldH - visibleBottom;
          if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollYRef.current + overlap, animated: true });
        });
      });
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [winH]);

  // ── Serviceability of the PINNED spot (the 5 km store fence) ───────────────
  // The home gate checks the BROWSING location; this checks the actual pinned
  // door. An out-of-zone pin (say Hyderabad while stores are in Lucknow) shows
  // "coming soon" and BLOCKS saving — the member can never reach the wallet
  // step with an undeliverable address. FAIL-OPEN on blips: only an explicit
  // serviceable:false from the backend blocks.
  const [svcChecking, setSvcChecking] = useState(false);
  const [svcBlocked, setSvcBlocked] = useState<{ reason: string | null; storeName: string | null; distanceKm: number | null } | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);

  async function checkPinServiceable(c: Coords) {
    setSvcChecking(true);
    setWaitlisted(false);
    try {
      const s = await getServiceability({ lat: c.lat, lng: c.lng });
      setSvcBlocked(s.serviceable === false ? { reason: s.reason, storeName: s.storeName, distanceKm: s.distanceKm } : null);
    } catch {
      setSvcBlocked(null); // blip → fail-open (placeOrder re-guards server-side)
    } finally {
      setSvcChecking(false);
    }
  }

  // Fresh capture every open: map first, empty form, receiver prefilled from
  // the profile (they can change it — e.g. delivering to family).
  useEffect(() => {
    if (!visible) return;
    setMapOpen(false); // presented via the Modal's onShow, after the sheet lands
    setCoords(null);
    setGeoLabel(null);
    setFlat('');
    setLocality('');
    setCity('');
    setPincode('');
    setRingBell(true);
    setCallBefore(false);
    setInstructions('');
    setDoorPhoto(null);
    setErr('');
    setReceiver(profile?.full_name ?? '');
  }, [visible, profile?.full_name]);

  // Map confirmed: keep the pin + its words, and ALWAYS refill City + Pincode
  // from this pin (overwriting stale values — a Bengaluru pin must never sit
  // next to a Lucknow pincode).
  async function onMapConfirm(c: Coords, label?: string | null) {
    setCoords(c);
    setGeoLabel(label ?? null);
    setMapOpen(false);
    setErr('');
    haptics.success();
    // Is this exact pin inside a serving store's zone? (5 km fence, backend.)
    void checkPinServiceable(c);
    const g = await geoAddress(c);
    if (g.city) setCity(g.city);
    if (g.pincode) setPincode(g.pincode);
  }

  function onMapClose() {
    setMapOpen(false);
    // No pin yet and the member backed out of the map → nothing to form-fill.
    if (!coords) onClose();
  }

  // Banner tap must ALWAYS present the map. If the banner was tappable while
  // mapOpen is already true, the nested Modal failed to present (Android race)
  // — flip false→true to force a fresh presentation.
  function openMap() {
    if (mapOpen) {
      setMapOpen(false);
      setTimeout(() => setMapOpen(true), 60);
    } else {
      setMapOpen(true);
    }
  }

  // "Add a door photo" opens the CAMERA (that's what the label promises); the
  // photo library is the graceful fallback when camera permission is denied or
  // the camera is unavailable (emulator). Optional field — never blocks.
  async function addDoorPhoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
        if (shot.canceled) return; // deliberate cancel — don't bounce them into the gallery
        const uri = shot.assets?.[0]?.uri;
        if (uri) { setDoorPhoto(uri); haptics.select(); return; }
      }
      // Permission denied / no camera → photo library instead of a dead tap.
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.length) return;
      const uri = res.assets[0]?.uri;
      if (uri) { setDoorPhoto(uri); haptics.select(); }
    } catch { /* picker unavailable — optional field, never blocks */ }
  }

  // Mandatory: pin, flat/house, receiver name, city, 6-digit pincode.
  // Optional: locality/landmark, photo, instructions, BOTH delivery-preference
  // toggles (any combination, including none, is valid).
  // NOTE: an IN-FLIGHT serviceability check must never block Save — only an
  // explicit out-of-zone verdict does (fail-open; placeOrder re-guards
  // server-side). Blocking on svcChecking left the button dead for up to 15s
  // on a slow network, which read as "the form won't submit".
  const pinOk = coords != null;
  // Any non-empty house/flat number is valid — "7", "B2" and "Flat 402" are all
  // real doors; a ≥3-char rule silently dead-locked Save for short numbers.
  const flatOk = flat.trim().length >= 1;
  const receiverOk = receiver.trim().length >= 2;
  const cityOk = city.trim().length >= 2;
  const pinCodeOk = pincode.trim().replace(/\D/g, '').length === 6;
  const canSave = pinOk && flatOk && receiverOk && cityOk && pinCodeOk && !svcBlocked;

  async function save() {
    if (saving) return;
    if (svcBlocked) return; // out of zone — the coming-soon panel owns the screen
    if (!canSave) {
      setErr(
        !pinOk ? 'Set your delivery location on the map first.'
        : !flatOk ? 'Please add your flat / house number.'
        : !receiverOk ? 'Please add the receiver’s name.'
        : !cityOk ? 'Please add your city.'
        : 'Please enter the 6-digit pincode.',
      );
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const created = await addAddress({
        label: 'Home',
        line1: flat.trim(),
        line2: locality.trim() || null,
        city: city.trim(),
        pincode: pincode.trim().replace(/\D/g, ''),
        is_default: true,
        receiver_name: receiver.trim(),
        geo_label: geoLabel,
        ring_bell: ringBell,
        call_before: callBefore,
        instructions: instructions.trim() || null,
        door_photo_uri: doorPhoto,
      });
      if (coords && created?.id) {
        try { await setAddressCoords(created.id, coords); } catch { /* pin retried on next edit */ }
        // The saved door IS the member's delivery location now (exact).
        try { await useUserLocation.getState().setFromAddress(city.trim(), coords, true); } catch { /* non-fatal */ }
      }
      haptics.confirm();
      onSaved(created);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save the address. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose} presentationStyle="fullScreen" onShow={() => setMapOpen(true)}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.milk }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Tap onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Tap>
          <View style={{ flex: 1 }}>
            <Serif style={{ fontSize: 19 }}>Complete your address</Serif>
            <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>This will be your address for all morning and instant deliveries</TextBody>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl + kbHeight }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* The pinned spot, in words — tap to adjust on the map. */}
          <Tap onPress={openMap} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: coords ? colors.blueSoft : colors.flameSoft, borderRadius: radius.md, borderWidth: 1.5, borderColor: coords ? colors.blue : colors.flameDeep, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name={coords ? 'location' : 'map'} size={19} color={coords ? colors.blue : colors.flameDeep} />
            <View style={{ flex: 1 }}>
              <TextMed style={{ fontSize: 14 }} color={colors.ink}>{coords ? 'Delivery location set' : 'Set delivery location on map'}</TextMed>
              <TextBody style={{ fontSize: 11.5 }} color={colors.inkSoft} numberOfLines={2}>
                {coords ? (geoLabel ?? 'Tap to adjust the pin') : 'Required · search or drag the pin to your exact door'}
              </TextBody>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkMute} />
          </Tap>

          {/* Out of the serving zone → "coming soon", and the flow HARD-STOPS
              here: no form, no save, no wallet step. Change the pin or join
              the waitlist. */}
          {svcBlocked ? (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
              <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="location" size={38} color={colors.flameDeep} />
              </View>
              <Serif style={{ fontSize: 21, textAlign: 'center' }}>Coming soon to this area! 🐄</Serif>
              <TextBody style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }} color={colors.inkSoft}>
                {svcBlocked.reason ?? "We can't deliver to this location yet. We're expanding fast. Move the pin to a serviceable area, or leave your number and we'll tell you the moment we launch here."}
              </TextBody>
              {svcBlocked.storeName && svcBlocked.distanceKm ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.flameSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Ionicons name="storefront-outline" size={13} color={colors.flameDeep} />
                  <TextBody style={{ fontSize: 12 }} color={colors.flameDeep}>
                    Nearest store · {svcBlocked.storeName} · ~{svcBlocked.distanceKm} km
                  </TextBody>
                </View>
              ) : null}
              <Tap onPress={() => setMapOpen(true)} style={{ height: 50, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 15 }}>Change location</TextSemi>
              </Tap>
              {waitlisted ? (
                <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.blue}>You're on the list. We'll text you when PYAAS arrives here. 🎉</TextBody>
              ) : (
                <Tap haptic={false} onPress={async () => { try { await joinWaitlist({ phone: profile?.phone ?? null, lat: coords?.lat ?? null, lng: coords?.lng ?? null, pincode: pincode.trim() || null }); setWaitlisted(true); haptics.success(); } catch { /* soft */ } }} style={{ height: 48, alignSelf: 'stretch', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                  <TextSemi color={colors.flameDeep} style={{ fontSize: 14 }}>Notify me when you launch here</TextSemi>
                </Tap>
              )}
            </View>
          ) : (
          <>
          {svcChecking ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cream, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={colors.flameDeep} />
              <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>Checking delivery availability at this spot…</TextBody>
            </View>
          ) : null}
          <Field label="Flat / House No / Apartment" value={flat} onChangeText={setFlat} placeholder="e.g. Flat 402, Lotus Apartments" />
          <Field label="Locality / Area / Landmark (optional)" value={locality} onChangeText={setLocality} placeholder="e.g. Near City Park" />
          <Field label="Receiver's name" value={receiver} onChangeText={setReceiver} placeholder="Who receives the milk?" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.4 }}><Field label="City" value={city} onChangeText={setCity} placeholder="Lucknow" /></View>
            <View style={{ flex: 1 }}><Field label="Pincode" value={pincode} onChangeText={setPincode} placeholder="226010" keyboardType="number-pad" maxLength={6} /></View>
          </View>

          {/* Delivery preferences */}
          <TextSemi style={{ fontSize: 14.5, marginTop: 2 }}>Delivery preferences</TextSemi>
          <ToggleRow icon="notifications-outline" label="Ring the bell" on={ringBell} onToggle={() => { haptics.select(); setRingBell((v) => !v); }} />
          <ToggleRow icon="call-outline" label="Call before delivery" on={callBefore} onToggle={() => { haptics.select(); setCallBefore((v) => !v); }} />

          {/* Sample door photo — helps the rider find the exact door. */}
          {doorPhoto ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm }}>
              <Image source={{ uri: doorPhoto }} style={{ width: 56, height: 56, borderRadius: radius.sm }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <TextMed style={{ fontSize: 13.5 }}>Door photo added</TextMed>
                <TextBody style={{ fontSize: 11.5 }} color={colors.inkSoft}>Your rider sees this to find the exact door</TextBody>
              </View>
              <Tap haptic={false} onPress={() => setDoorPhoto(null)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={colors.inkMute} />
              </Tap>
            </View>
          ) : (
            <Tap haptic={false} onPress={() => { void addDoorPhoto(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Ionicons name="camera-outline" size={19} color={colors.flameDeep} />
              <View style={{ flex: 1 }}>
                <TextMed style={{ fontSize: 14 }}>Add a door photo (optional)</TextMed>
                <TextBody style={{ fontSize: 11.5 }} color={colors.inkSoft}>Helps your rider find the exact door</TextBody>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkMute} />
            </Tap>
          )}

          <Field
            label="Delivery instructions (optional)"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. gate code 4321, leave with the guard"
            multiline
          />

          {err ? <TextBody color={colors.danger} style={{ fontSize: 13 }}>{err}</TextBody> : null}

          <Tap onPress={save} style={{ height: 54, borderRadius: radius.pill, backgroundColor: canSave ? colors.flameDeep : colors.line, alignItems: 'center', justifyContent: 'center', opacity: canSave ? 1 : 0.7, marginTop: 4, ...shadow.soft }}>
            {saving ? <ActivityIndicator color={colors.white} /> : (
              <TextSemi color={colors.white} style={{ fontSize: 16 }}>Save address</TextSemi>
            )}
          </Tap>
          </>
          )}
        </ScrollView>

        <MapPicker visible={mapOpen} initial={coords} onClose={onMapClose} onConfirm={onMapConfirm} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Bits (match the app's field/toggle language) ─────────────────────────────
function Field({ label, multiline, ...props }: any) {
  return (
    <View style={{ gap: 6 }}>
      <TextMed style={{ fontSize: 13 }} color={colors.inkSoft}>{label}</TextMed>
      <TextInput
        placeholderTextColor={colors.inkMute}
        multiline={!!multiline}
        style={{
          borderWidth: 1.5,
          borderColor: colors.line,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 10 : 0,
          height: multiline ? 74 : 50,
          textAlignVertical: multiline ? 'top' : 'center',
          backgroundColor: colors.white,
          fontFamily: fonts.sans,
          fontSize: 15,
          color: colors.ink,
        }}
        {...props}
      />
    </View>
  );
}

function ToggleRow({ icon, label, on, onToggle }: { icon: any; label: string; on: boolean; onToggle: () => void }) {
  return (
    <Tap haptic={false} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: on ? colors.flameDeep : colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Ionicons name={icon} size={18} color={on ? colors.flameDeep : colors.inkMute} />
      <TextMed style={{ fontSize: 14, flex: 1 }} color={colors.ink}>{label}</TextMed>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.flameDeep : colors.inkMute} />
    </Tap>
  );
}

export default AddressCaptureSheet;
