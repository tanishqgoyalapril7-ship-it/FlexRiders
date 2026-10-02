import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Android map: OpenStreetMap tiles drawn by Leaflet in a WebView. Google Maps on Android needs a
 * Google Maps API key (and renders black without one), so Android uses this instead; iOS keeps Apple Maps.
 * Same data as the native map: campaign label bubbles (tap to select), the rider's location, working areas
 * and the selected campaign's reach circle.
 *
 * markers: [{ id, lat, lng, title, subtitle, color, soon }]   areas: [{ label, lat, lng }]
 * me: { lat, lng } | null   circle: { lat, lng, radius_km } | null   selectedId
 * mode: 'standard' (light street map) | 'satellite' | 'night'
 * insets: { top, bottom } keep markers clear of overlays.   onSelect(id)
 * Exposes recenter() through ref.
 */
const WebMapView = React.forwardRef(function WebMapView({ markers, areas, me, circle, selectedId, mode = 'standard', insets, onSelect }, ref) {
  const web = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const html = useMemo(() => buildHtml(), []);
  const data = JSON.stringify({ markers, areas, me, circle, selectedId, insets });

  useEffect(() => {
    if (loaded && web.current) web.current.injectJavaScript(`window.setData(${data}); true;`);
  }, [loaded, data]);
  useEffect(() => {
    if (loaded && web.current) web.current.injectJavaScript(`window.setMode(${JSON.stringify(mode)}); true;`);
  }, [loaded, mode]);

  React.useImperativeHandle(ref, () => ({
    recenter: () => web.current && web.current.injectJavaScript('window.recenter(); true;'),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        // The map page never navigates: links (e.g. the map credits) can't open other sites inside the app.
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('https://flexriders.in')}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: 'https://flexriders.in' }}
        style={{ backgroundColor: '#E5E7EB' }}
        onLoadEnd={() => setLoaded(true)}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'select') onSelect(msg.id);
          } catch (err) {
            // Ignore anything that isn't ours.
          }
        }}
        nestedScrollEnabled
        overScrollMode="never"
        setBuiltInZoomControls={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
});

export default WebMapView;

function buildHtml() {
  // Street map: standard OpenStreetMap tiles (no API key; same as the admin website). Night: the same tiles
  // darkened on the device. Satellite: Esri World Imagery with place-name labels on top.
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#E5E7EB;}
  body{font-family:-apple-system,Roboto,sans-serif;-webkit-tap-highlight-color:transparent;}
  body.night #map{background:#1d2433;}
  body.night .street{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6);}
  .leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,0.7)!important;}
  body.night .leaflet-control-attribution,body.satellite .leaflet-control-attribution{background:rgba(0,0,0,0.4)!important;color:#e2e8f0!important;}
  body.night .leaflet-control-attribution a,body.satellite .leaflet-control-attribution a{color:#e2e8f0!important;}
  .pin{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);}
  .bubble{border:2px solid #fff;border-radius:14px;padding:5px 11px;color:#fff;text-align:center;
    box-shadow:0 3px 8px rgba(0,0,0,.4);white-space:nowrap;max-width:170px;}
  .bubble.soon{border:3px solid #F59E0B;}
  .bubble.on{background:#fff!important;transform:scale(1.08);}
  .t1{font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;}
  .t2{font-weight:800;font-size:11.5px;opacity:.95;}
  .tail{width:0;height:0;margin-top:-1px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid;}
  /* Working area: a purple pin with a home icon and the area's name. */
  .area{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;}
  .area-pin{width:28px;height:28px;border-radius:14px 14px 14px 2px;transform:rotate(-45deg);background:#7C3AED;
    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;}
  .area-pin svg{transform:rotate(45deg);}
  .area-name{margin-top:4px;background:#fff;color:#4C1D95;font-weight:800;font-size:11px;padding:2px 7px;border-radius:999px;
    box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;}
  /* The rider: a blue dot with a soft pulsing halo. */
  .me{position:relative;width:18px;height:18px;transform:translate(-50%,-50%);}
  .me .dot{position:absolute;inset:0;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);}
  .me .halo{position:absolute;left:-14px;top:-14px;width:46px;height:46px;border-radius:50%;background:rgba(37,99,235,.28);
    animation:pulse 2s ease-out infinite;}
  @keyframes pulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.25);opacity:0}}
</style></head><body><div id="map"></div><script>
  var map = L.map('map',{zoomControl:false,attributionControl:true}).setView([28.46,77.03],12);
  var street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'street',
    attribution:'&copy; OpenStreetMap contributors'});
  var imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,attribution:'Imagery &copy; Esri'});
  var places = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19});
  var currentMode = null;
  window.setMode = function(mode){
    if(mode===currentMode) return; currentMode = mode;
    [street,imagery,places].forEach(function(l){ if(map.hasLayer(l)) map.removeLayer(l); });
    document.body.className = mode;
    if(mode==='satellite'){ imagery.addTo(map); places.addTo(map); } else { street.addTo(map); }
  };
  window.setMode('standard');
  var layer = L.layerGroup().addTo(map), state = null, fitted = false, lastSelected = null;
  var HOME = '<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>';
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function icon(html){return L.divIcon({html:html,className:'',iconSize:[0,0]});}
  function pad(){var i=(state&&state.insets)||{};return {paddingTopLeft:[24,(i.top||0)+24],paddingBottomRight:[24,(i.bottom||0)+24],maxZoom:15};}
  function fit(){
    var pts=[];
    if(state.me) pts.push([state.me.lat,state.me.lng]);
    state.markers.forEach(function(m){pts.push([m.lat,m.lng]);});
    if(!pts.length) state.areas.forEach(function(a){pts.push([a.lat,a.lng]);});
    if(pts.length===1) map.setView(pts[0],13); else if(pts.length) map.fitBounds(pts,pad());
  }
  window.recenter=function(){ if(state&&state.me) map.flyTo([state.me.lat,state.me.lng],14,{duration:.4}); };
  window.setData=function(d){
    state=d; layer.clearLayers();
    d.areas.forEach(function(a){
      var name = String(a.label||'').split(',')[0];
      L.marker([a.lat,a.lng],{icon:icon('<div class="area"><div class="area-pin">'+HOME+'</div><div class="area-name">'+esc(name)+'</div></div>'),
        zIndexOffset:100}).bindTooltip(esc(a.label)+' · your working area').addTo(layer);
    });
    if(d.circle) L.circle([d.circle.lat,d.circle.lng],{radius:d.circle.radius_km*1000,color:'#3B82F6',weight:1.5,fillOpacity:.08}).addTo(layer);
    if(d.me) L.marker([d.me.lat,d.me.lng],{icon:icon('<div class="me"><div class="halo"></div><div class="dot"></div></div>'),interactive:false,zIndexOffset:500}).addTo(layer);
    d.markers.forEach(function(m){
      var on = m.id===d.selectedId;
      var html='<div class="pin"><div class="bubble'+(m.soon?' soon':'')+(on?' on':'')+'" style="background:'+m.color+'">'
        +'<div class="t1" style="color:'+(on?'#0F172A':'#fff')+'">'+esc(m.title)+'</div>'
        +'<div class="t2" style="color:'+(on?m.color:'#fff')+'">'+esc(m.subtitle)+'</div></div>'
        +'<div class="tail" style="border-top-color:'+(on?'#fff':(m.soon?'#F59E0B':m.color))+'"></div></div>';
      L.marker([m.lat,m.lng],{icon:icon(html),zIndexOffset:on?2000:1000}).on('click',function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'select',id:m.id}));
      }).addTo(layer);
    });
    if(!fitted){ fit(); fitted=true; }
    if(d.selectedId!==lastSelected){
      lastSelected=d.selectedId;
      var s=d.markers.filter(function(m){return m.id===d.selectedId;})[0];
      if(s) map.flyTo([s.lat,s.lng],Math.max(map.getZoom(),13),{duration:.4});
    }
  };
</script></body></html>`;
}
