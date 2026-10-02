import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Android map: OpenStreetMap / CARTO tiles drawn by Leaflet in a WebView. Google Maps on Android needs a
 * Google Maps API key (and renders black without one), so Android uses this instead; iOS keeps Apple Maps.
 * Same data as the native map: campaign label bubbles (tap to select), the rider's location, working areas
 * and the selected campaign's reach circle.
 *
 * markers: [{ id, lat, lng, title, subtitle, color, soon }]   areas: [{ label, lat, lng }]
 * me: { lat, lng } | null   circle: { lat, lng, radius_km } | null   selectedId   dark
 * insets: { top, bottom } keep markers clear of overlays.   onSelect(id)
 * Exposes recenter() through ref.
 */
const WebMapView = React.forwardRef(function WebMapView({ markers, areas, me, circle, selectedId, dark, insets, onSelect }, ref) {
  const web = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const html = useMemo(() => buildHtml(dark), [dark]);
  const data = JSON.stringify({ markers, areas, me, circle, selectedId, insets });

  useEffect(() => {
    if (loaded && web.current) web.current.injectJavaScript(`window.setData(${data}); true;`);
  }, [loaded, data]);

  React.useImperativeHandle(ref, () => ({
    recenter: () => web.current && web.current.injectJavaScript('window.recenter(); true;'),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://flexriders.in' }}
        style={{ backgroundColor: dark ? '#1d2433' : '#E5E7EB' }}
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

function buildHtml(dark) {
  const tiles = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${dark ? '#1d2433' : '#E5E7EB'};}
  body{font-family:-apple-system,Roboto,sans-serif;-webkit-tap-highlight-color:transparent;}
  .leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,0.35)!important;color:#cbd5e1!important;}
  .leaflet-control-attribution a{color:#cbd5e1!important;}
  .pin{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);}
  .bubble{border:2px solid #fff;border-radius:14px;padding:5px 11px;color:#fff;text-align:center;
    box-shadow:0 3px 8px rgba(0,0,0,.4);white-space:nowrap;max-width:170px;}
  .bubble.soon{border:3px solid #F59E0B;}
  .bubble.on{background:#fff!important;transform:scale(1.08);}
  .t1{font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;}
  .t2{font-weight:800;font-size:11.5px;opacity:.95;}
  .tail{width:0;height:0;margin-top:-1px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid;}
  .area{width:20px;height:20px;border-radius:10px;background:#7C3AED;border:2px solid #fff;color:#fff;font-size:11px;
    display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);}
  .me{width:16px;height:16px;border-radius:8px;background:#2563EB;border:3px solid #fff;transform:translate(-50%,-50%);
    box-shadow:0 0 0 6px rgba(37,99,235,.25);}
</style></head><body><div id="map"></div><script>
  var map = L.map('map',{zoomControl:false,attributionControl:true}).setView([28.46,77.03],12);
  L.tileLayer('${tiles}',{maxZoom:19,subdomains:'abcd',
    attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
  var layer = L.layerGroup().addTo(map), state = null, fitted = false, lastSelected = null;
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
    d.areas.forEach(function(a){ L.marker([a.lat,a.lng],{icon:icon('<div class="area">&#8962;</div>'),zIndexOffset:100}).bindTooltip(esc(a.label)).addTo(layer); });
    if(d.circle) L.circle([d.circle.lat,d.circle.lng],{radius:d.circle.radius_km*1000,color:'#3B82F6',weight:1.5,fillOpacity:.08}).addTo(layer);
    if(d.me) L.marker([d.me.lat,d.me.lng],{icon:icon('<div class="me"></div>'),interactive:false,zIndexOffset:500}).addTo(layer);
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
