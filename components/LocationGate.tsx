import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Tap, TextBody, TextMed, TextSemi, Serif } from './ui';
import { useUserLocation, CITIES, sameCity } from '../lib/userLocation';
import { usePopupSlot } from '../lib/popupGate';
import { DEFAULT_REGION, type Coords } from '../lib/location';
import MapPicker from './MapPicker';
import { useServiceability } from '../lib/serviceability';
import { listAddresses, type Address } from '../lib/api';
import { listSubscriptions } from '../lib/subscriptions';
import { placesAutocomplete, placeDetails, isPlacesEnabled, newSessionToken, type PlaceSuggestion } from '../lib/places';
import { hasAcceptedLocationDisclosure } from '../lib/locationConsent';
import { LocationDisclosure } from './LocationDisclosure';

type Addr = Address & { lat?: number | null; lng?: number | null };

/**
 * App-wide location picker + guards (mounted once in the tabs layout, so it also
 * covers the out-of-zone Coming Soon screen). Three behaviours, none dead-ends:
 *  - FIRST LAUNCH: no delivery location yet → a sheet the member must resolve
 *    (search an address, use GPS, or pick a city). A denied permission just
 *    falls through to search / the city list.
 *  - CHANGE LOCATION: opened on demand from the home chip or Coming Soon
 *    (setPickerOpen(true)) — same sheet, dismissible.
 *  - CITY SHIFT: live GPS city differs from the subscription's city → ask.
 */
export default function LocationGate() {
  const insets = useSafeAreaInsets();
  const loc = useUserLocation((s) => s.loc);
  const ready = useUserLocation((s) => s.ready);
  const permissionDenied = useUserLocation((s) => s.permissionDenied);
  const locating = useUserLocation((s) => s.locating);
  const pickerOpen = useUserLocation((s) => s.pickerOpen);
  const setPickerOpen = useUserLocation((s) => s.setPickerOpen);
  const hydrate = useUserLocation((s) => s.hydrate);
  const useMyLocation = useUserLocation((s) => s.useMyLocation);
  const setCity = useUserLocation((s) => s.setCity);
  const setFromAddress = useUserLocation((s) => s.setFromAddress);
  const setFromPin = useUserLocation((s) => s.setFromPin);
  const forceCheck = useServiceability((s) => s.check);

  // Map picker (draggable pin) + whether the search field has focus (so the sheet
  // anchors to the TOP instead of hiding behind the keyboard while typing).
  const [mapOpen, setMapOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  // Prominent disclosure BEFORE the OS location prompt (Play rule: the runtime
  // request must be immediately preceded by an in-app disclosure with an
  // affirmative action; declining leaves search + city pick fully usable).
  const [locDiscOpen, setLocDiscOpen] = useState(false);
  async function tapUseMyLocation() {
    if (!(await hasAcceptedLocationDisclosure())) {
      setLocDiscOpen(true);
      return;
    }
    const ok = await useMyLocation();
    if (ok) close();
  }

  const [subCity, setSubCity] = useState<string | null>(null);
  const [subCoords, setSubCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [shiftHandled, setShiftHandled] = useState(false);

  // Google-Maps-style search panel.
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const sessionToken = useRef(newSessionToken());
  const abortRef = useRef<AbortController | null>(null);
  const reqRef = useRef(0);

  // Hydrate persisted location; seed returning members from a saved address so
  // they are not re-prompted.
  useEffect(() => {
    (async () => {
      await hydrate();
      if (useUserLocation.getState().loc) return;
      try {
        const addrs = (await listAddresses()) as Addr[];
        const def = addrs.find((a) => a.is_default) ?? addrs[0];
        if (!def) return;
        if (def.lat != null && def.lng != null) await setFromAddress(def.city || 'your saved address', { lat: def.lat, lng: def.lng }, true);
        else if (def.city) { const known = CITIES.find((c) => sameCity(c.name, def.city)); await setFromAddress(def.city, known?.coords ?? DEFAULT_REGION, false); }
      } catch { /* no address → the sheet prompts */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The city an active subscription delivers to (its default address).
  useEffect(() => {
    (async () => {
      try {
        const subs = await listSubscriptions();
        if (!subs.some((s) => s.status === 'active' || s.status === 'paused')) { setSubCity(null); return; }
        const addrs = (await listAddresses()) as Addr[];
        const def = addrs.find((a) => a.is_default) ?? addrs[0];
        setSubCity(def?.city || null);
        setSubCoords(def && def.lat != null && def.lng != null ? { lat: def.lat, lng: def.lng } : null);
      } catch { setSubCity(null); }
    })();
  }, [loc?.city]);

  // Re-run serviceability whenever the chosen location changes.
  useEffect(() => {
    if (loc) void forceCheck({ force: true });
  }, [loc?.coords.lat, loc?.coords.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsLocation = ready && !loc;
  const showPicker = needsLocation || pickerOpen;

  // Debounced address search (only while the picker is open).
  useEffect(() => {
    if (!showPicker || !isPlacesEnabled()) return;
    const q = query.trim();
    if (q.length < 3) { setSugs([]); setSearching(false); return; }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const myReq = ++reqRef.current;
      setSearching(true);
      const res = await placesAutocomplete(q, { signal: ctrl.signal, sessionToken: sessionToken.current });
      if (myReq !== reqRef.current) return; // superseded → drop
      setSugs(res);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, showPicker]);

  const close = () => { setPickerOpen(false); setQuery(''); setSugs([]); setSearchFocused(false); };

  async function onMapConfirm(c: Coords) {
    setMapOpen(false);
    await setFromPin(c);
    close();
  }
  // Never trap the member: hardware-back / "Skip for now" on first launch defaults
  // to a serviceable city — they can change it from the header chip anytime.
  const skipDefault = () => { void setCity(CITIES[0].name); close(); };

  async function pickSuggestion(s: PlaceSuggestion) {
    abortRef.current?.abort();
    reqRef.current++;
    setSugs([]);
    setQuery('');
    const d = await placeDetails(s.placeId, { sessionToken: sessionToken.current });
    sessionToken.current = newSessionToken();
    const city = d?.city || s.primary || 'your location';
    if (d && d.lat != null && d.lng != null) {
      // A geocoded searched address IS an exact point → exact:true, so the
      // subscription exact-location gate accepts it (no bounce to the map).
      await setFromAddress(city, { lat: d.lat, lng: d.lng }, true);
      close();
    } else {
      // Place details came back without coordinates — don't silently swallow the
      // tap; keep the query and tell the member to retry or use the map.
      setQuery(s.primary);
      setSearchErr("Couldn't pin that address. Try another, or set it on the map.");
    }
  }

  const cityShift =
    !showPicker && !!loc && loc.source === 'gps' && !!subCity && !sameCity(loc.city, subCity) && !shiftHandled;

  // Register both self-presenting surfaces (the location sheet and the
  // city-shift dialog) with the popup arbiter, so the out-of-zone sheet /
  // claim flow / money nudges never stack on top of them.
  usePopupSlot(showPicker && !mapOpen);
  usePopupSlot(cityShift);

  if (showPicker) {
    // Map open → show the full-screen draggable-pin picker instead of the sheet
    // (avoids stacking two Modals); confirming drops the pin and closes both.
    if (mapOpen) {
      return <MapPicker visible initial={loc?.coords ?? null} onClose={() => setMapOpen(false)} onConfirm={onMapConfirm} />;
    }
    return (
      <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={needsLocation ? skipDefault : close}>
        {/* While typing, ANCHOR the sheet to the TOP so the keyboard never hides it
            (it drops back to the bottom on blur — "sticks on top only when entering"). */}
        <View style={{ flex: 1, justifyContent: searchFocused ? 'flex-start' : 'flex-end', paddingTop: searchFocused ? insets.top + spacing.sm : 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: searchFocused ? 28 : 0, borderBottomRightRadius: searchFocused ? 28 : 0, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.md, gap: spacing.md, maxHeight: searchFocused ? '72%' : '88%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Serif style={{ fontSize: 23 }}>{loc ? 'Change location' : 'Where should we deliver?'}</Serif>
                <TextBody style={{ fontSize: 12.5, marginTop: 2 }} color={colors.inkSoft}>{loc ? `Delivering to ${loc.city}` : 'Set your delivery location, change it anytime.'}</TextBody>
              </View>
              {!needsLocation ? (
                <Tap haptic={false} onPress={close} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Tap>
              ) : null}
            </View>

            {/* Search panel (Google-Maps style) */}
            <View style={{ paddingHorizontal: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 50, backgroundColor: colors.milk }}>
                <Ionicons name="search" size={18} color={colors.inkMute} />
                <TextInput value={query} onChangeText={(t) => { setQuery(t); if (searchErr) setSearchErr(''); }} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder="Search area, colony, street…" placeholderTextColor={colors.inkMute} autoCorrect={false} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink }} />
                {searching ? <ActivityIndicator size="small" color={colors.flameDeep} /> : query ? (
                  <Tap haptic={false} onPress={() => { setQuery(''); setSugs([]); setSearchErr(''); }}><Ionicons name="close-circle" size={18} color={colors.inkMute} /></Tap>
                ) : null}
              </View>
              {searchErr ? <TextMed style={{ fontSize: 11.5, marginTop: 6 }} color={colors.flameDeep}>{searchErr}</TextMed> : null}
              {!isPlacesEnabled() ? <TextMed style={{ fontSize: 11, marginTop: 6 }} color={colors.inkMute}>Address search is unavailable, pick a city below.</TextMed> : null}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
              {sugs.length > 0 ? (
                sugs.map((s) => (
                  <Tap key={s.placeId} onPress={() => pickSuggestion(s)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                      <Ionicons name="location-outline" size={18} color={colors.flameDeep} />
                      <View style={{ flex: 1 }}>
                        <TextSemi style={{ fontSize: 14.5 }}>{s.primary}</TextSemi>
                        <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>{s.secondary}</TextBody>
                      </View>
                    </View>
                  </Tap>
                ))
              ) : (
                <>
                  <Tap onPress={() => { setSearchFocused(false); setMapOpen(true); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameDeep, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 14, ...shadow.soft }}>
                      <Ionicons name="map" size={20} color={colors.white} />
                      <View style={{ flex: 1 }}>
                        <TextSemi color={colors.white} style={{ fontSize: 14.5 }}>Set my exact location on the map</TextSemi>
                        <TextBody color="rgba(255,255,255,0.9)" style={{ fontSize: 11.5 }}>Drag the pin to your door</TextBody>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.white} />
                    </View>
                  </Tap>
                  <Tap onPress={() => { void tapUseMyLocation(); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flameSoft, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 14 }}>
                      <Ionicons name="locate" size={20} color={colors.flameDeep} />
                      <TextSemi color={colors.flameDeep} style={{ fontSize: 14.5, flex: 1 }}>{locating ? 'Locating…' : 'Use my current location'}</TextSemi>
                      {locating ? <ActivityIndicator size="small" color={colors.flameDeep} /> : <Ionicons name="chevron-forward" size={16} color={colors.flameDeep} />}
                    </View>
                  </Tap>
                  {permissionDenied ? <TextMed style={{ fontSize: 12 }} color={colors.flameDeep}>Location is off, search above or pick a city below.</TextMed> : null}
                  <TextMed style={{ fontSize: 12, marginTop: 8, marginBottom: 2 }} color={colors.inkMute}>Popular cities</TextMed>
                  {CITIES.map((c) => {
                    const active = !!loc && sameCity(loc.city, c.name);
                    return (
                      <Tap key={c.name} onPress={() => { void setCity(c.name); close(); }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: active ? colors.flameDeep : colors.line, backgroundColor: active ? colors.flameSoft : colors.white, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 }}>
                          <Ionicons name="business-outline" size={18} color={active ? colors.flameDeep : colors.inkSoft} />
                          <TextSemi style={{ fontSize: 14, flex: 1 }} color={active ? colors.flameDeep : colors.ink}>{c.name}</TextSemi>
                          {active ? <Ionicons name="checkmark-circle" size={18} color={colors.flameDeep} /> : null}
                        </View>
                      </Tap>
                    );
                  })}
                </>
              )}
            </ScrollView>
            {needsLocation ? (
              <Tap haptic={false} onPress={skipDefault} style={{ alignItems: 'center', paddingVertical: 2 }}>
                <TextMed color={colors.inkMute} style={{ fontSize: 13 }}>Skip for now</TextMed>
              </Tap>
            ) : null}
          </View>
        </View>

        {/* Location prominent disclosure, stacked over the open sheet (the
            parent stays presented, so no iOS modal swallow). */}
        <LocationDisclosure
          visible={locDiscOpen}
          onAgree={() => { setLocDiscOpen(false); void useMyLocation().then((ok) => { if (ok) close(); }); }}
          onDecline={() => setLocDiscOpen(false)}
        />
      </Modal>
    );
  }

  if (cityShift) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShiftHandled(true)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.white, borderRadius: 24, padding: spacing.lg, gap: spacing.md, ...shadow.card }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="navigate" size={24} color={colors.flameDeep} />
            </View>
            <Serif style={{ fontSize: 22 }}>Looks like you’ve moved</Serif>
            <TextBody style={{ fontSize: 14 }}>
              You’re in <TextSemi>{loc!.city}</TextSemi>, but your subscription delivers to <TextSemi>{subCity}</TextSemi>. What would you like to do?
            </TextBody>
            <Tap onPress={() => { if (subCoords) void setFromAddress(subCity!, subCoords, true); setShiftHandled(true); }}>
              <View style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <TextSemi color={colors.white} style={{ fontSize: 15 }}>Keep delivering to {subCity}</TextSemi>
              </View>
            </Tap>
            <Tap onPress={() => setShiftHandled(true)}>
              <View style={{ height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                <TextSemi color={colors.flameDeep} style={{ fontSize: 15 }}>I’ve moved to {loc!.city}</TextSemi>
              </View>
            </Tap>
          </View>
        </View>
      </Modal>
    );
  }

  return null;
}
