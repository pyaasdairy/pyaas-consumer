import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { TextBody, TextSemi } from './ui';
import { getUserCoords, DEFAULT_REGION, type Coords } from '../lib/location';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

/**
 * RIDER-ON-MAP — the tracking map a member sees once a rider is assigned to their
 * order. Rendered with Leaflet + free OpenStreetMap tiles in the WebView we
 * already ship (same stack as MapPicker): no native rebuild, no Google Maps key.
 * Leaflet is inlined from the local package (./leafletAssets), so the only thing
 * this page fetches is tile imagery — data, not code.
 *
 * It plots ONLY positions we actually have: the rider marker sits on the last
 * position the rider app reported and moves when a new one arrives. It used to
 * invent a start point ~1 km from the member's home and glide a marker towards
 * their door on a timer, which drew a rider who was not there — for orders whose
 * rider had never reported a position at all. With no reported position there is
 * now no map, just the honest "not shared yet" state.
 */
function mapHtml(home: Coords | null, rider: Coords, origin: Coords | null, originLabel: string): string {
  const homeJs = home ? `[${home.lat},${home.lng}]` : 'null';
  const originJs = origin ? `[${origin.lat},${origin.lng}]` : 'null';
  const originLabelJs = JSON.stringify(originLabel);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#f6eef4}
  #map{width:100%}
  /* Geometric markers, no emoji: a ringed brand disc with a simple inner
     glyph shape per role. Reads clean at any zoom. */
  .pin{position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#F36CB5;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .pin.home{background:#2E2329}
  .pin.home::after{content:'';width:9px;height:9px;border-radius:50%;background:#fff}
  .pin.store{background:#F49F1C}
  .pin.store::after{content:'';width:9px;height:9px;border-radius:2px;background:#fff}
  .pin.rider::after{content:'';width:12px;height:12px;border-radius:50%;border:3px solid #fff}
  .tag{transform:translateY(-2px);font:600 10px/1 -apple-system,sans-serif;color:#2E2329;background:rgba(255,255,255,.92);padding:2px 6px;border-radius:7px;box-shadow:0 1px 4px rgba(0,0,0,.18);white-space:nowrap}
  .pulse{position:absolute;left:-8px;top:-8px;width:50px;height:50px;border-radius:50%;background:rgba(243,108,181,.28);animation:pp 1.6s ease-out infinite}
  @keyframes pp{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.25);opacity:0}}
  .leaflet-control-attribution{font-size:9px}
</style></head><body>
<div id="map"></div>
<script>
  function __rnpost(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  window.onerror=function(){ __rnpost({err:true}); return true; };
</script>
<script>${LEAFLET_JS}</script>
<script>
  if (typeof L === 'undefined') { __rnpost({err:true}); }
  else try {
  var home=${homeJs};
  var origin=${originJs};
  var start=[${rider.lat},${rider.lng}];
  var map=L.map('map',{zoomControl:false,attributionControl:true,dragging:true});
  var tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  // Tiles are the only network dependency left, and Leaflet renders a perfectly
  // functional map of blank squares without them — so report the failure and let
  // the component swap in a message instead of showing a grey rectangle.
  var tilesOk=false,tileErrs=0;
  tiles.on('tileload',function(){ if(!tilesOk){ tilesOk=true; __rnpost({tiles:true}); } });
  tiles.on('tileerror',function(){ if(!tilesOk && ++tileErrs>=4) __rnpost({tiles:false}); });
  var homeIcon=L.divIcon({html:'<div class="pin home"></div>',className:'',iconSize:[30,30],iconAnchor:[15,15]});
  var storeIcon=L.divIcon({html:'<div class="pin store"></div><div class="tag">'+${originLabelJs}+'</div>',className:'',iconSize:[30,30],iconAnchor:[15,15]});
  var riderIcon=L.divIcon({html:'<div style="position:relative"><div class="pulse"></div><div class="pin rider"></div></div>',className:'',iconSize:[30,30],iconAnchor:[15,15]});
  var rider=L.marker(start,{icon:riderIcon}).addTo(map);
  var route=null;   // the LIVE remaining leg: rider → home, redrawn as the rider moves
  var plan=null;    // the FULL planned trip: store → home, static and faint
  var bounds=[start];
  // Store pin + planned store→you line: drawn only when we actually know the
  // pickup point. For an instant order the trip origin IS the serving store.
  if(origin){
    L.marker(origin,{icon:storeIcon}).addTo(map);
    bounds.push(origin);
    if(home) plan=L.polyline([origin,home],{color:'#F49F1C',weight:2,dashArray:'2 7',opacity:0.55}).addTo(map);
  }
  // The home pin is drawn only when we know the member's actual delivery point.
  if(home){
    L.marker(home,{icon:homeIcon}).addTo(map);
    bounds.push(home);
    route=L.polyline([start,home],{color:'#F36CB5',weight:3,dashArray:'6 8',opacity:0.85}).addTo(map);
  }
  if(bounds.length>1){ map.fitBounds(L.latLngBounds(bounds).pad(0.32)); }
  else { map.setView(start,15); }
  // The marker moves ONLY when the rider app reports a new position. No timer,
  // no interpolation — a still marker means the rider has not moved (or has not
  // reported), and that is the truth we owe the member.
  window.__setRider=function(la,ln){
    rider.setLatLng([la,ln]);
    if(route) route.setLatLngs([[la,ln],home]);
  };
  __rnpost({ready:true});
  } catch(e){ __rnpost({err:true}); }
</script></body></html>`;
}

/** getUserCoords() falls back to the Lucknow centroid when the member has no pin
 *  on file. That is a city, not their door — never draw a home marker on it. */
function isDefaultRegion(c: Coords): boolean {
  return c.lat === DEFAULT_REGION.lat && c.lng === DEFAULT_REGION.lng;
}

export function RiderTrackMap({
  riderLat,
  riderLng,
  active,
  originLat,
  originLng,
  originLabel = 'Store',
  height = 230,
  hero = false,
}: {
  /** The rider's last reported position. Null until the rider app reports one —
   *  there is no map to draw until then. */
  riderLat?: number | null;
  riderLng?: number | null;
  /** True while the order is out for delivery (drives the status ribbon only). */
  active: boolean;
  /** Fixed trip origin (the serving store / pickup point) for the instant lane.
   *  When supplied, the map draws a store pin and the full store→you route
   *  alongside the live rider. Omit for the standard rider-only tracking map.
   *  Must be a REAL coordinate (store record, or the rider's pickup fix) — never
   *  a synthesised point. */
  originLat?: number | null;
  originLng?: number | null;
  originLabel?: string;
  height?: number;
  /** Full-bleed hero mode (the quick-commerce tracking layout): square
   *  corners, and the no-fix placeholder fills the same height so the layout
   *  never jumps when the first rider position arrives. */
  hero?: boolean;
}) {
  const webRef = useRef<WebView>(null);
  const hasFix = riderLat != null && riderLng != null;
  // undefined = still resolving, null = resolved but we have no real home point.
  const [home, setHome] = useState<Coords | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    // Only look up the member's coordinate when there is a rider position to plot
    // it against — no map, no reason to touch location at all.
    if (!hasFix) return;
    let on = true;
    getUserCoords()
      .then((c) => { if (on) setHome(isDefaultRegion(c) ? null : c); })
      .catch(() => { if (on) setHome(null); });
    return () => { on = false; };
  }, [hasFix]);

  // Live re-anchor: whenever polled rider coords change after load, hand the new
  // point to the map without reloading the WebView.
  useEffect(() => {
    if (!readyRef.current || riderLat == null || riderLng == null) return;
    webRef.current?.injectJavaScript(`window.__setRider && window.__setRider(${riderLat},${riderLng}); true;`);
  }, [riderLat, riderLng]);

  const hasOrigin = originLat != null && originLng != null;
  const html = useMemo(
    () => (hasFix && home !== undefined
      ? mapHtml(home, { lat: riderLat!, lng: riderLng! }, hasOrigin ? { lat: originLat!, lng: originLng! } : null, originLabel)
      : null),
    // The HTML is frozen once built; later rider fixes ride injectJavaScript, not
    // a reload. The origin is fixed for the trip, so it too is baked in once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasFix, home !== undefined, hasOrigin],
  );

  // No reported position → say that, plainly. Anything else here would be a
  // rider we invented.
  if (!hasFix) {
    return (
      <View style={{ backgroundColor: colors.cream, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center', gap: 6, height: hero ? height : undefined }}>
        <Ionicons name="navigate-circle-outline" size={26} color={colors.inkMute} />
        <TextSemi style={{ fontSize: 14 }}>Live location not shared yet</TextSemi>
        <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.inkSoft}>
          {active
            ? 'Your order is out for delivery. The map appears here as soon as your rider shares their position.'
            : 'The map appears here once your rider starts the trip and shares their position.'}
        </TextBody>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ height: 96, borderRadius: radius.lg, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Ionicons name="cloud-offline-outline" size={22} color={colors.inkMute} />
        <TextBody style={{ fontSize: 12.5 }} color={colors.inkSoft}>Map needs an internet connection</TextBody>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: hero ? 0 : radius.lg, overflow: 'hidden', backgroundColor: colors.wash, ...shadow.soft }}>
      {html ? (
        <WebView
          ref={webRef}
          // No baseUrl: nothing in this page resolves against a remote origin.
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => {
            try {
              const d = JSON.parse(e.nativeEvent.data);
              if (d?.ready) readyRef.current = true;
              if (d?.err) setFailed(true);
              if (typeof d?.tiles === 'boolean') setFailed(!d.tiles);
            } catch { /* ignore */ }
          }}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.wash }}>
              <ActivityIndicator color={colors.flameDeep} />
            </View>
          )}
          style={{ flex: 1, backgroundColor: colors.wash }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.flameDeep} />
        </View>
      )}
      {/* Status ribbon over the map. "last reported" is the honest caveat: the pin
          is where the rider app last said they were, not a live extrapolation. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, ...shadow.soft }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#31B057' : colors.gold }} />
        <TextSemi style={{ fontSize: 12 }}>{active ? 'Rider on the way' : 'Rider assigned'}</TextSemi>
        <TextBody style={{ fontSize: 11 }} color={colors.inkSoft}>· last reported</TextBody>
      </View>
    </View>
  );
}
