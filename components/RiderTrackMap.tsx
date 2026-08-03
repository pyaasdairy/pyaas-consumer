import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow } from '../lib/theme';
import { TextBody, TextSemi } from './ui';
import { getUserCoords, type Coords } from '../lib/location';

/**
 * RIDER-ON-MAP — the live tracking map a member sees once their order is placed
 * and a rider is on the way. Rendered with Leaflet + free OpenStreetMap tiles in
 * the WebView we already ship (same stack as MapPicker): no native rebuild, no
 * Google Maps key.
 *
 * The HOME pin is the member's saved delivery point; the RIDER pin starts from
 * the rider's last reported position (or just outside the neighbourhood) and
 * glides towards home. Real position updates re-anchor the glide, so with the
 * rider app reporting live GPS the marker follows it; without updates the
 * approach still reads as live motion instead of a frozen dot.
 */
function mapHtml(home: Coords, rider: Coords, active: boolean): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#f6eef4}
  #map{width:100%}
  .pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#F36CB5;box-shadow:0 2px 8px rgba(0,0,0,.28);font-size:17px}
  .pin.home{background:#2E2329}
  .pulse{position:absolute;left:-8px;top:-8px;width:50px;height:50px;border-radius:50%;background:rgba(243,108,181,.28);animation:pp 1.6s ease-out infinite}
  @keyframes pp{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.25);opacity:0}}
  .leaflet-control-attribution{font-size:9px}
</style></head><body>
<div id="map"></div>
<script>
  function __rnpost(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  window.onerror=function(){ __rnpost({err:true}); return true; };
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  if (typeof L === 'undefined') { __rnpost({err:true}); }
  else try {
  var home=[${home.lat},${home.lng}];
  var riderStart=[${rider.lat},${rider.lng}];
  var map=L.map('map',{zoomControl:false,attributionControl:true,dragging:true}).setView(home,15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var homeIcon=L.divIcon({html:'<div class="pin home">🏠</div>',className:'',iconSize:[34,34],iconAnchor:[17,17]});
  var riderIcon=L.divIcon({html:'<div style="position:relative"><div class="pulse"></div><div class="pin">🛵</div></div>',className:'',iconSize:[34,34],iconAnchor:[17,17]});
  L.marker(home,{icon:homeIcon}).addTo(map);
  var rider=L.marker(riderStart,{icon:riderIcon}).addTo(map);
  var route=L.polyline([riderStart,home],{color:'#F36CB5',weight:3,dashArray:'6 8',opacity:0.85}).addTo(map);
  map.fitBounds(L.latLngBounds([home,riderStart]).pad(0.35));

  // Glide: ease the rider from its anchor towards home. A real GPS update
  // (window.__setRider) re-anchors the glide from the reported point.
  var anchor={lat:riderStart[0],lng:riderStart[1]};
  var t=0;
  var ACTIVE=${active ? 'true' : 'false'};
  function tick(){
    if(!ACTIVE) return;
    t=Math.min(t+0.004,0.94); // never quite "arrives" on its own
    var la=anchor.lat+(home[0]-anchor.lat)*t;
    var ln=anchor.lng+(home[1]-anchor.lng)*t;
    rider.setLatLng([la,ln]);
    route.setLatLngs([[la,ln],home]);
  }
  setInterval(tick,120);
  window.__setRider=function(la,ln){ anchor={lat:la,lng:ln}; t=0; rider.setLatLng([la,ln]); route.setLatLngs([[la,ln],home]); };
  __rnpost({ready:true});
  } catch(e){ __rnpost({err:true}); }
</script></body></html>`;
}

/** Deterministic "just left the store" start point ~1.2 km north-east of home,
 *  used when the rider has not reported a live position yet. */
function fallbackRiderStart(home: Coords): Coords {
  return { lat: home.lat + 0.008, lng: home.lng + 0.007 };
}

export function RiderTrackMap({
  riderLat,
  riderLng,
  active,
  height = 230,
}: {
  riderLat?: number | null;
  riderLng?: number | null;
  /** True while the order is out for delivery (the marker glides home). */
  active: boolean;
  height?: number;
}) {
  const webRef = useRef<WebView>(null);
  const [home, setHome] = useState<Coords | null>(null);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let on = true;
    getUserCoords().then((c) => { if (on) setHome(c); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  const riderStart = useMemo<Coords | null>(() => {
    if (!home) return null;
    if (riderLat != null && riderLng != null) return { lat: riderLat, lng: riderLng };
    return fallbackRiderStart(home);
  }, [home, riderLat, riderLng]);

  // Live re-anchor: whenever polled rider coords change after load, hand the new
  // point to the map without reloading the WebView.
  useEffect(() => {
    if (!readyRef.current || riderLat == null || riderLng == null) return;
    webRef.current?.injectJavaScript(`window.__setRider && window.__setRider(${riderLat},${riderLng}); true;`);
  }, [riderLat, riderLng]);

  const html = useMemo(
    () => (home && riderStart ? mapHtml(home, riderStart, active) : null),
    // The HTML is frozen for the mount; live updates ride injectJavaScript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home != null, riderStart != null],
  );

  if (failed) {
    return (
      <View style={{ height: 96, borderRadius: radius.lg, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Ionicons name="bicycle" size={22} color={colors.flameDeep} />
        <TextBody style={{ fontSize: 12.5 }}>Your rider is on the way</TextBody>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.wash, ...shadow.soft }}>
      {html ? (
        <WebView
          ref={webRef}
          source={{ html, baseUrl: 'https://unpkg.com' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => {
            try {
              const d = JSON.parse(e.nativeEvent.data);
              if (d?.ready) readyRef.current = true;
              if (d?.err) setFailed(true);
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
      {/* Status ribbon over the map */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, ...shadow.soft }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: active ? '#31B057' : colors.gold }} />
        <TextSemi style={{ fontSize: 12 }}>{active ? 'Rider on the way' : 'Rider assigned'}</TextSemi>
      </View>
    </View>
  );
}
