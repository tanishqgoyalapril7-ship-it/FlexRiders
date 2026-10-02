import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

let MapView = null;
let Marker = null;
let Circle = null;
let Polyline = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  ({ Marker, Circle, Polyline } = Maps);
} catch (e) {
  MapView = null;
}

/**
 * A small map of shapes (areas, routes, pins, labels) that works without a Google Maps key: Apple Maps on
 * iOS, OpenStreetMap (Leaflet in a WebView) on Android. It fits itself to everything it draws.
 *
 * circles: [{ lat, lng, radiusM, color, fill }]           lines: [{ points: [[lat, lng], ...], color, width, outline }]
 * pins:    [{ lat, lng, color, title }]                    labels: [{ lat, lng, text }]
 * interactive: allow pan/zoom (default true).   lite: tiny static map (cards).
 */
export default function SimpleMap({ circles = [], lines = [], pins = [], labels = [], interactive = true, lite = false, style }) {
  const all = [
    ...circles.map((c) => [c.lat, c.lng]),
    ...lines.flatMap((l) => l.points),
    ...pins.map((p) => [p.lat, p.lng]),
    ...labels.map((l) => [l.lat, l.lng]),
  ].filter(([a, b]) => a != null && b != null);

  if (Platform.OS === 'android' || !MapView) {
    return <AndroidMap circles={circles} lines={lines} pins={pins} labels={labels} interactive={interactive} style={style} />;
  }
  if (!all.length) return <View style={[StyleSheet.absoluteFill, style]} />;
  // Region that fits every point and every circle's radius.
  const extra = circles.reduce((m, c) => Math.max(m, (c.radiusM || 0) / 111000), 0);
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(Math.max(...lats) - Math.min(...lats) + extra * 2, 0.006) * 1.35,
    longitudeDelta: Math.max(Math.max(...lngs) - Math.min(...lngs) + extra * 2, 0.006) * 1.35,
  };
  return (
    <MapView
      key={`${all.length}-${region.latitude.toFixed(4)}-${region.longitude.toFixed(4)}`}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={region}
      liteMode={lite}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      {circles.map((c, i) => (
        <Circle key={`c${i}`} center={{ latitude: c.lat, longitude: c.lng }} radius={c.radiusM} strokeColor={c.color} strokeWidth={1.5} fillColor={c.fill} />
      ))}
      {lines.map((l, i) => {
        const coords = l.points.map(([latitude, longitude]) => ({ latitude, longitude }));
        return (
          <React.Fragment key={`l${i}`}>
            {l.outline ? <Polyline coordinates={coords} strokeColor={l.outline} strokeWidth={(l.width || 4) + 3} /> : null}
            <Polyline coordinates={coords} strokeColor={l.color} strokeWidth={l.width || 4} />
          </React.Fragment>
        );
      })}
      {pins.map((p, i) => (
        <Marker key={`p${i}`} coordinate={{ latitude: p.lat, longitude: p.lng }} pinColor={p.color} title={p.title} />
      ))}
      {labels.map((l, i) => (
        <Marker key={`t${i}`} coordinate={{ latitude: l.lat, longitude: l.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.label}>
            <Text style={styles.labelText}>{l.text}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

function AndroidMap({ circles, lines, pins, labels, interactive, style }) {
  const html = useMemo(() => buildHtml({ circles, lines, pins, labels, interactive }), [JSON.stringify({ circles, lines, pins, labels, interactive })]);
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://flexriders.in' }}
        style={{ backgroundColor: '#E5E7EB' }}
        javaScriptEnabled
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
      />
    </View>
  );
}

function buildHtml(data) {
  // JSON inside a script tag: escape "<" so text can't close the tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#E5E7EB;}
  body{font-family:-apple-system,Roboto,sans-serif;}
  .leaflet-control-attribution{font-size:9px;}
  .lbl{transform:translate(-50%,-50%);background:#2563EB;color:#fff;font-weight:800;font-size:11px;padding:3px 8px;
    border-radius:999px;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.3);}
  .pin{width:14px;height:14px;border-radius:7px;border:3px solid #fff;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.4);}
</style></head><body><div id="map"></div><script>
  var d = ${json};
  var map = L.map('map',{zoomControl:false,dragging:d.interactive,touchZoom:d.interactive,scrollWheelZoom:false,
    doubleClickZoom:d.interactive,boxZoom:false,keyboard:false,tap:d.interactive}).setView([28.46,77.03],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var bounds = L.latLngBounds([]);
  d.circles.forEach(function(c){ var o=L.circle([c.lat,c.lng],{radius:c.radiusM,color:c.color,weight:1.5,fillColor:c.color,fillOpacity:.15}).addTo(map); bounds.extend(o.getBounds()); });
  d.lines.forEach(function(l){
    if(l.points.length<2) return;
    if(l.outline) L.polyline(l.points,{color:l.outline,weight:(l.width||4)+3,opacity:.9}).addTo(map);
    var o=L.polyline(l.points,{color:l.color,weight:l.width||4}).addTo(map); bounds.extend(o.getBounds());
  });
  d.pins.forEach(function(p){
    var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',iconSize:[0,0],html:'<div class="pin" style="background:'+esc(p.color)+'"></div>'})}).addTo(map);
    if(p.title) m.bindTooltip(esc(p.title));
    bounds.extend([p.lat,p.lng]);
  });
  d.labels.forEach(function(l){
    L.marker([l.lat,l.lng],{icon:L.divIcon({className:'',iconSize:[0,0],html:'<div class="lbl">'+esc(l.text)+'</div>'})}).addTo(map);
    bounds.extend([l.lat,l.lng]);
  });
  if(bounds.isValid()) map.fitBounds(bounds,{padding:[24,24],maxZoom:16});
</script></body></html>`;
}

const styles = StyleSheet.create({
  label: { backgroundColor: '#2563EB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: '#FFFFFF' },
  labelText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
});
