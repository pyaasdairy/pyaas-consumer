import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { SafeModal } from './SafeModal';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { DEFAULT_REGION, getDeviceCoords, getDeviceCoordsIfGranted, type Coords } from '../lib/location';
import { hasAcceptedLocationDisclosure } from '../lib/locationConsent';
import { LocationDisclosure } from './LocationDisclosure';
import { placeLabelFromCoords } from '../lib/userLocation';
import { placesAutocomplete, placeDetails, isPlacesEnabled, newSessionToken, type PlaceSuggestion } from '../lib/places';
import { LEAFLET_CSS, LEAFLET_JS, MARKER_ICON_PNG, MARKER_ICON_2X_PNG, MARKER_SHADOW_PNG } from './leafletAssets';

/**
 * MAP PICKER — a full-screen map with a DRAGGABLE PIN so the member sets their
 * EXACT delivery spot (the door, not just the city). Rendered with Leaflet + free
 * OpenStreetMap tiles inside the WebView we already ship for payments, so it needs
 * NO native rebuild, NO react-native-maps and NO Google Maps key.
 *
 * Leaflet itself is INLINED from the local npm package (see ./leafletAssets) —
 * this page pulls no code off a CDN. The only network traffic left is the OSM
 * tile images, which are data, not code, and which we detect the failure of.
 *
 * The member drags the pin (or taps the map) to place it; "Use my current
 * location" recenters on the device GPS via expo-location (the app's existing
 * permission flow) and drops the pin there. "Confirm this location" returns the
 * chosen { lat, lng } to the caller — the word "GPS" never appears in the UI.
 */

/** Leaflet's default marker resolves images/marker-icon.png RELATIVE to the page,
 *  which is the only reason this WebView ever needed a remote baseUrl. Hand it the
 *  inlined PNGs so the pin costs no request either. Base64 is quote-safe. */
const PIN_ICON_JS = `L.icon({iconUrl:'${MARKER_ICON_PNG}',iconRetinaUrl:'${MARKER_ICON_2X_PNG}',shadowUrl:'${MARKER_SHADOW_PNG}',iconSize:[25,41],iconAnchor:[12,41],shadowSize:[41,41]})`;

function mapHtml(center: Coords): string {
  const lat = center.lat;
  const lng = center.lng;
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#eee}
  #map{width:100%}
  .hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(20,20,20,0.82);color:#fff;font:600 13px/1.3 -apple-system,Roboto,system-ui,sans-serif;padding:9px 16px;border-radius:22px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.25)}
  .leaflet-control-attribution{font-size:9px}
</style></head><body>
<div id="map"></div>
<div class="hint">Drag the pin to your exact door</div>
<script>
  function __rnpost(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  window.onerror=function(){ __rnpost({err:true}); return true; };
</script>
<script>${LEAFLET_JS}</script>
<script>
  if (typeof L === 'undefined') { __rnpost({err:true}); }
  else try {
  var start=[${lat},${lng}];
  var map=L.map('map',{zoomControl:true,attributionControl:true}).setView(start,17);
  var tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  // Tiles are now the ONLY network dependency. Offline no longer breaks the map's
  // JS (it's inlined) — it just leaves blank squares — so report the tile failure
  // ourselves rather than leave the member staring at a grey box.
  var tilesOk=false,tileErrs=0;
  tiles.on('tileload',function(){ if(!tilesOk){ tilesOk=true; __rnpost({tiles:true}); } });
  tiles.on('tileerror',function(){ if(!tilesOk && ++tileErrs>=4) __rnpost({tiles:false}); });
  var marker=L.marker(start,{draggable:true,autoPan:true,icon:${PIN_ICON_JS}}).addTo(map);
  function post(ll,src){ try{ window.ReactNativeWebView.postMessage(JSON.stringify({lat:ll.lat,lng:ll.lng,src:src})); }catch(e){} }
  marker.on('dragend',function(){ var ll=marker.getLatLng(); map.panTo(ll); post(ll,'drag'); });
  map.on('click',function(e){ marker.setLatLng(e.latlng); post(e.latlng,'click'); });
  window.__recenter=function(la,ln){ var ll=L.latLng(la,ln); map.setView(ll,17); marker.setLatLng(ll); post(ll,'recenter'); };
  post({lat:start[0],lng:start[1]},'init');
  } catch (e) { __rnpost({err:true}); }
</script></body></html>`;
}

export default function MapPicker({
  visible,
  initial,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  initial?: Coords | null;
  onClose: () => void;
  /** Returns the pin + the reverse-geocoded label of the confirmed spot (may be
   *  null while offline) so callers can show "delivering to …" without another
   *  geocode round-trip. */
  onConfirm: (coords: Coords, label?: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  // Track whether the Leaflet page has finished loading, and hold a device-GPS
  // recenter that resolved BEFORE it did — so the recenter is applied once
  // window.__recenter exists and can't be clobbered by the map's initial post().
  const loadedRef = useRef(false);
  const wantRecenterRef = useRef<Coords | null>(null);
  // Fires if the page never signals at all (the WebView itself failed to run our
  // HTML). Leaflet is inlined now, so this is no longer the offline path — a dead
  // network shows up as tile errors, reported separately.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picked, setPicked] = useState<Coords | null>(initial ?? null);
  // Human-readable address of the CURRENT pin, shown above Confirm so the
  // member always sees exactly which location they are about to confirm.
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  // Whether the member has actually PLACED the pin (dragged/tapped) or we have a
  // real point (a caller-supplied `initial`, or their device GPS). If not, the pin
  // is only sitting on the auto-seeded map centre — Confirm must stay disabled so a
  // blind default city can never be committed as an "exact door".
  const [userPlaced, setUserPlaced] = useState<boolean>(!!initial);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState(false);
  // ── Manual search ON the map (CD-style "Try Sector 75…"): Places autocomplete
  // when a key is configured, else the OS geocoder on submit. Picking a result
  // recenters the pin — the member then fine-tunes by dragging.
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState<PlaceSuggestion[]>([]);
  const [searchErr, setSearchErr] = useState('');
  const [searching, setSearching] = useState(false);
  const sessionTokenRef = useRef(newSessionToken());
  const searchReqRef = useRef(0);
  // Freeze the starting centre for the life of one open so the HTML source (and
  // thus the WebView) is stable — recenters go through injected JS, not reloads.
  const center = useMemo(() => initial ?? DEFAULT_REGION, [initial, visible]);
  const html = useMemo(() => mapHtml(center), [center]);
  // On every OPEN: (1) clear stale error, (2) re-seed the picked point so a Confirm
  // can never commit a coordinate left over from a previous session (the WebView may
  // not reload byte-identical HTML), and (3) when the caller gave no starting point,
  // best-effort recenter on the device's own location so the pin doesn't default to
  // a far-off city the member has to drag away from.
  useEffect(() => {
    if (!visible) return;
    setMapError(false);
    loadedRef.current = false;
    wantRecenterRef.current = null;
    setPicked(initial ?? null);
    setUserPlaced(!!initial);
    // Watchdog: if the map hasn't signalled ready within ~7s, treat it as failed so
    // the member sees the offline message and Confirm can still commit their area.
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => { setMapError(true); setPicked((p) => p ?? center); }, 7000);
    if (!initial) {
      // NEVER prompts: on-open centering may only use a permission the member
      // already granted. The OS dialog fires only from the explicit locate
      // button, immediately after the LocationDisclosure sheet (Play rule).
      getDeviceCoordsIfGranted()
        .then((c) => {
          if (!c) return;
          setPicked(c);
          setUserPlaced(true); // a real device fix — Confirm may commit it
          // If the map is already up, recenter now; otherwise stash it for onLoadEnd
          // so the map's own initial post() can't overwrite it back to the default.
          if (loadedRef.current) webRef.current?.injectJavaScript(`window.__recenter(${c.lat},${c.lng}); true;`);
          else wantRecenterRef.current = c;
        })
        .catch(() => { /* denied / offline — the map's own post() seeds the pin */ });
    }
    return () => { if (watchdogRef.current) clearTimeout(watchdogRef.current); };
  }, [visible, initial]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      // Any message means the page's JS ran → clear the watchdog.
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (d?.err) {
        // The map script threw — show the offline fallback; keep Confirm usable by
        // committing the best-known centre (their supplied point / GPS / default).
        setMapError(true);
        setPicked((p) => p ?? center);
        return;
      }
      if (typeof d?.tiles === 'boolean') {
        // Tiles are the only thing still fetched: no tiles means an unusable map
        // even though Leaflet itself ran, so it drives the offline overlay.
        setMapError(!d.tiles);
        if (!d.tiles) setPicked((p) => p ?? center);
        return;
      }
      if (typeof d?.lat === 'number' && typeof d?.lng === 'number') {
        setPicked({ lat: d.lat, lng: d.lng });
        // A drag/tap/GPS-recenter is a real placement; the map's initial 'init' post
        // (auto-seeded centre) is NOT — don't let it enable Confirm on its own.
        if (d.src && d.src !== 'init') setUserPlaced(true);
      }
    } catch { /* ignore malformed */ }
  }

  // Debounced reverse-geocode of the pin: the label follows every drag/tap.
  useEffect(() => {
    if (!picked) { setPlaceLabel(null); return; }
    let on = true;
    const t = setTimeout(() => {
      placeLabelFromCoords(picked)
        .then((l) => { if (on) setPlaceLabel(l); })
        .catch(() => { /* keep the last label */ });
    }, 350);
    return () => { on = false; clearTimeout(t); };
  }, [picked]);

  // Location prominent disclosure: the OS permission prompt may only follow
  // the in-app disclosure sheet with an affirmative "Agree and continue".
  const [locDiscOpen, setLocDiscOpen] = useState(false);
  // ONE-TAP "Use my current location & Confirm": disclosure gate → GPS fix →
  // pin recenter → confirm, in a single press. The pin/placed state is set in
  // JS (not just via the WebView round-trip) so the flow also completes when
  // the map itself is dead (offline).
  async function locateAndConfirm() {
    if (!(await hasAcceptedLocationDisclosure())) {
      setLocDiscOpen(true); // onAgree resumes with runLocate(true)
      return;
    }
    await runLocate(true);
  }
  async function runLocate(thenConfirm = false) {
    if (locating) return;
    setLocating(true);
    try {
      const c = await getDeviceCoords();
      if (!c) return; // permission denied / no fix — member can drag or search instead
      haptics.success();
      setPicked(c);
      setUserPlaced(true);
      webRef.current?.injectJavaScript(`window.__recenter(${c.lat},${c.lng}); true;`);
      if (thenConfirm) {
        // Fresh label for the fresh fix — the debounced pin-label effect won't
        // have caught up yet, and confirming with the PREVIOUS pin's words
        // would show the member one address while committing another.
        const label = await placeLabelFromCoords(c).catch(() => null);
        haptics.confirm();
        onConfirm(c, label);
      }
    } finally {
      setLocating(false);
    }
  }

  /** Move the map + pin to a searched point (counts as a real placement). */
  function recenterTo(c: Coords) {
    setSugs([]);
    setSearchErr('');
    setQuery('');
    Keyboard.dismiss();
    haptics.select();
    setPicked(c);
    setUserPlaced(true);
    webRef.current?.injectJavaScript(`window.__recenter(${c.lat},${c.lng}); true;`);
  }

  // Debounced Places autocomplete while typing (no-op without a key — the OS
  // geocoder then answers on keyboard-submit instead).
  useEffect(() => {
    if (!visible) return;
    if (!isPlacesEnabled()) return;
    const q = query.trim();
    if (q.length < 3) { setSugs([]); return; }
    const my = ++searchReqRef.current;
    const t = setTimeout(async () => {
      const res = await placesAutocomplete(q, { sessionToken: sessionTokenRef.current });
      if (my === searchReqRef.current) setSugs(res);
    }, 250);
    return () => clearTimeout(t);
  }, [query, visible]);

  async function chooseSug(s: PlaceSuggestion) {
    searchReqRef.current++;
    setSugs([]);
    setSearching(true);
    try {
      const d = await placeDetails(s.placeId, { sessionToken: sessionTokenRef.current });
      sessionTokenRef.current = newSessionToken();
      if (d && d.lat != null && d.lng != null) recenterTo({ lat: d.lat, lng: d.lng });
      else setSearchErr('Could not open that place. Try another.');
    } finally {
      setSearching(false);
    }
  }

  /** Keyboard-submit fallback: the OS forward geocoder (keyless). */
  async function searchSubmit() {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    setSearchErr('');
    try {
      const res = await Location.geocodeAsync(q);
      const hit = res?.[0];
      if (hit) recenterTo({ lat: hit.latitude, lng: hit.longitude });
      else setSearchErr('No match found. Try adding the area or a landmark.');
    } catch {
      setSearchErr('Search needs an internet connection.');
    } finally {
      setSearching(false);
    }
  }

  // Confirm is enabled when there's a real placement (drag/tap/GPS/supplied point),
  // OR the map failed to load (offline) — then it commits the best-known centre so
  // the member is never dead-ended with a disabled button on a blank map.
  const canConfirm = !!picked && (userPlaced || mapError);

  function confirm() {
    // Match the button's enabled state (canConfirm) — offline (mapError) must be
    // able to commit the best-known centre, exactly as the overlay instructs.
    if (!canConfirm || !picked) return;
    haptics.confirm();
    onConfirm(picked, placeLabel);
  }

  return (
    <SafeModal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: colors.milk }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Tap onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.wash, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Tap>
          <View style={{ flex: 1 }}>
            <Serif style={{ fontSize: 19 }}>Set delivery location</Serif>
            <TextBody style={{ fontSize: 12 }} color={colors.inkSoft}>Move the pin to your exact door</TextBody>
          </View>
        </View>

        {/* Map */}
        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            // No baseUrl: nothing in this page resolves against a remote origin
            // any more, so the document stays a local, origin-less string.
            source={{ html }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onMessage={onMessage}
            startInLoadingState
            onLoadEnd={() => {
              loadedRef.current = true;
              const c = wantRecenterRef.current;
              if (c) { wantRecenterRef.current = null; webRef.current?.injectJavaScript(`window.__recenter(${c.lat},${c.lng}); true;`); }
            }}
            onError={() => { setMapError(true); setPicked((p) => p ?? center); }}
            onHttpError={() => { setMapError(true); setPicked((p) => p ?? center); }}
            renderLoading={() => (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.wash }}>
                <ActivityIndicator color={colors.flameDeep} size="large" />
              </View>
            )}
            style={{ flex: 1, backgroundColor: colors.wash }}
          />
          {/* Manual search, ON the map (CD-style): type an area / colony /
              landmark → pick a suggestion (Places) or submit (OS geocoder) and
              the pin jumps there for fine-tuning. */}
          <View style={{ position: 'absolute', top: spacing.sm, left: spacing.lg, right: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 46, ...shadow.soft }}>
              <Ionicons name="search" size={17} color={colors.inkMute} />
              <TextInput
                value={query}
                onChangeText={(t) => { setQuery(t); setSearchErr(''); }}
                placeholder="Search area, colony, landmark…"
                placeholderTextColor={colors.inkMute}
                returnKeyType="search"
                onSubmitEditing={searchSubmit}
                style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink }}
              />
              {searching ? <ActivityIndicator size="small" color={colors.flameDeep} /> : null}
              {query.length > 0 && !searching ? (
                <Tap haptic={false} onPress={() => { setQuery(''); setSugs([]); setSearchErr(''); }} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={17} color={colors.inkMute} />
                </Tap>
              ) : null}
            </View>
            {sugs.length > 0 ? (
              <View style={{ marginTop: 6, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.soft }}>
                {sugs.slice(0, 4).map((s, i) => (
                  <Tap key={s.placeId} haptic={false} onPress={() => { void chooseSug(s); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                    <Ionicons name="location-outline" size={16} color={colors.flameDeep} />
                    <View style={{ flex: 1 }}>
                      <TextMed style={{ fontSize: 13.5 }} numberOfLines={1}>{s.primary}</TextMed>
                      {s.secondary ? <TextBody style={{ fontSize: 11.5 }} numberOfLines={1}>{s.secondary}</TextBody> : null}
                    </View>
                  </Tap>
                ))}
              </View>
            ) : null}
            {searchErr ? (
              <View style={{ marginTop: 6, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
                <TextBody style={{ fontSize: 12.5 }} color={colors.danger}>{searchErr}</TextBody>
              </View>
            ) : null}
          </View>
          {/* Offline / tiles-failed: never a dead grey box — tell the member what
              happened and keep Confirm usable (it commits their current area). */}
          {mapError ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.wash, padding: spacing.xl, gap: 10 }}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.inkMute} />
              <TextSemi style={{ fontSize: 15, textAlign: 'center' }}>Map needs an internet connection</TextSemi>
              <TextBody style={{ fontSize: 13, textAlign: 'center' }} color={colors.inkSoft}>
                Tap “Confirm” to use your current area, or go back and type your address instead.
              </TextBody>
            </View>
          ) : null}
        </View>

        {/* Footer actions */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, gap: 10, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
          {/* The location being confirmed, in words — never a silent pin. */}
          {picked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cream, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Ionicons name="location" size={16} color={colors.flameDeep} />
              <TextBody style={{ flex: 1, fontSize: 13 }} color={colors.ink} numberOfLines={2}>
                {placeLabel ?? 'Finding this address…'}
              </TextBody>
            </View>
          ) : null}
          {/* ONE button (not a locate + a confirm pair): before any real
              placement it runs the one-tap GPS → confirm path; once the member
              has placed the pin (drag / tap / search / GPS) it confirms exactly
              that pin, so "move the pin to your exact door" still works. */}
          <Tap
            onPress={locating ? undefined : canConfirm ? confirm : () => { void locateAndConfirm(); }}
            style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: locating ? 0.85 : 1, ...shadow.soft }}
          >
            {locating ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name={canConfirm ? 'checkmark-circle' : 'locate'} size={18} color={colors.white} />}
            <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>
              {locating ? 'Finding you…' : canConfirm ? 'Confirm this location' : 'Use my current location & Confirm'}
            </TextSemi>
          </Tap>
        </View>

        {/* Prominent disclosure BEFORE the OS location prompt (stacks over this
            open modal; the parent stays presented, so no iOS modal swallow). */}
        <LocationDisclosure
          visible={locDiscOpen}
          onAgree={() => { setLocDiscOpen(false); void runLocate(true); }}
          onDecline={() => setLocDiscOpen(false)}
        />
      </View>
    </SafeModal>
  );
}
