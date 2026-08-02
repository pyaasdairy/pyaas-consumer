import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Modal, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextSemi, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { DEFAULT_REGION, getDeviceCoords, type Coords } from '../lib/location';

/**
 * MAP PICKER — a full-screen map with a DRAGGABLE PIN so the member sets their
 * EXACT delivery spot (the door, not just the city). Rendered with Leaflet + free
 * OpenStreetMap tiles inside the WebView we already ship for payments, so it needs
 * NO native rebuild, NO react-native-maps and NO Google Maps key.
 *
 * The member drags the pin (or taps the map) to place it; "Use my current
 * location" recenters on the device GPS via expo-location (the app's existing
 * permission flow) and drops the pin there. "Confirm this location" returns the
 * chosen { lat, lng } to the caller — the word "GPS" never appears in the UI.
 */
function mapHtml(center: Coords): string {
  const lat = center.lat;
  const lng = center.lng;
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#eee}
  #map{width:100%}
  .hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(20,20,20,0.82);color:#fff;font:600 13px/1.3 -apple-system,Roboto,system-ui,sans-serif;padding:9px 16px;border-radius:22px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.25)}
  .leaflet-control-attribution{font-size:9px}
</style></head><body>
<div id="map"></div>
<div class="hint">Drag the pin to your exact door</div>
<script>
  // Catch a failed Leaflet/CDN load (offline) — onError on the RN WebView does NOT
  // fire for a failed SUBRESOURCE, so we signal the failure ourselves.
  function __rnpost(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  window.onerror=function(){ __rnpost({err:true}); return true; };
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  if (typeof L === 'undefined') { __rnpost({err:true}); }
  else try {
  var start=[${lat},${lng}];
  var map=L.map('map',{zoomControl:true,attributionControl:true}).setView(start,17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var marker=L.marker(start,{draggable:true,autoPan:true}).addTo(map);
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
  onConfirm: (coords: Coords) => void;
}) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  // Track whether the Leaflet page has finished loading, and hold a device-GPS
  // recenter that resolved BEFORE it did — so the recenter is applied once
  // window.__recenter exists and can't be clobbered by the map's initial post().
  const loadedRef = useRef(false);
  const wantRecenterRef = useRef<Coords | null>(null);
  // Fires if the map never signals ready (Leaflet/OSM CDN blocked or offline) —
  // the WebView's onError does NOT catch a failed subresource, so we time out.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picked, setPicked] = useState<Coords | null>(initial ?? null);
  // Whether the member has actually PLACED the pin (dragged/tapped) or we have a
  // real point (a caller-supplied `initial`, or their device GPS). If not, the pin
  // is only sitting on the auto-seeded map centre — Confirm must stay disabled so a
  // blind default city can never be committed as an "exact door".
  const [userPlaced, setUserPlaced] = useState<boolean>(!!initial);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState(false);
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
      getDeviceCoords()
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
        // Leaflet/OSM failed to load — show the offline fallback; keep Confirm usable
        // by committing the best-known centre (their supplied point / GPS / default).
        setMapError(true);
        setPicked((p) => p ?? center);
        return;
      }
      if (typeof d?.lat === 'number' && typeof d?.lng === 'number') {
        setMapError(false); // a live coordinate means the map is up
        setPicked({ lat: d.lat, lng: d.lng });
        // A drag/tap/GPS-recenter is a real placement; the map's initial 'init' post
        // (auto-seeded centre) is NOT — don't let it enable Confirm on its own.
        if (d.src && d.src !== 'init') setUserPlaced(true);
      }
    } catch { /* ignore malformed */ }
  }

  async function locateMe() {
    setLocating(true);
    const c = await getDeviceCoords();
    setLocating(false);
    if (!c) return;
    haptics.success();
    webRef.current?.injectJavaScript(`window.__recenter(${c.lat},${c.lng}); true;`);
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
    onConfirm(picked);
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose} presentationStyle="fullScreen">
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
            source={{ html, baseUrl: 'https://unpkg.com' }}
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
          <Tap onPress={locateMe} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, backgroundColor: colors.white }}>
            {locating ? <ActivityIndicator size="small" color={colors.flameDeep} /> : <Ionicons name="locate" size={18} color={colors.flameDeep} />}
            <TextSemi color={colors.flameDeep} style={{ fontSize: 14.5 }}>{locating ? 'Finding you…' : 'Use my current location'}</TextSemi>
          </Tap>
          <Tap onPress={confirm} style={{ height: 52, borderRadius: radius.pill, backgroundColor: canConfirm ? colors.flameDeep : colors.line, alignItems: 'center', justifyContent: 'center', opacity: canConfirm ? 1 : 0.7, ...shadow.soft }}>
            <TextSemi color={colors.white} style={{ fontSize: 16 }}>{canConfirm ? 'Confirm this location' : 'Drag the pin to your door'}</TextSemi>
          </Tap>
        </View>
      </View>
    </Modal>
  );
}
