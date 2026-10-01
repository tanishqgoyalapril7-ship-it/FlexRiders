import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { formatINR } from '../utils';

// react-native-maps: Apple Maps on iOS; Google Maps on Android (needs GOOGLE_MAPS_ANDROID_API_KEY at build time).
let MapView = null;
let Marker = null;
let Circle = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  Marker = Maps.Marker;
  Circle = Maps.Circle;
} catch (e) {
  MapView = null;
}

const regionAround = (points) => {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.03),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.03),
  };
};

/** Real map of the rider's location and nearby campaign targets. Markers show each campaign's real
 * payout and remaining slots; tapping one calls onSelect(campaign). Nothing is drawn without coordinates. */
// Google "night"-style map for Android (iOS uses Apple Maps' own dark appearance).
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2433' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ea0c0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2433' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3a55' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3b4d72' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1830' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#222c40' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function CampaignMapView({ campaigns = [], myLocation, workingAreas = [], height = 300, selectedId, onSelect = () => {}, dark = false, fullBleed = false, bottomInset = 12, topInset = 0 }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const targeted = useMemo(() => campaigns.filter((c) => c.target && c.target.lat != null), [campaigns]);
  const selected = targeted.find((c) => c.id === selectedId);

  const points = [...(myLocation ? [myLocation] : []), ...targeted.map((c) => c.target)];
  const initialRegion = points.length ? regionAround(points) : null;

  useEffect(() => {
    if (!ready || !mapRef.current || !selected) return;
    mapRef.current.animateToRegion(
      { latitude: selected.target.lat, longitude: selected.target.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      350
    );
  }, [selectedId, ready]);

  if (!MapView) {
    return (
      <View style={[styles.placeholder, fullBleed ? styles.bleed : { height }]}>
        <Ionicons name="map-outline" size={28} color={colors.textSubtle} />
        <Text style={styles.placeholderText}>The map isn't available in this build of the app.</Text>
      </View>
    );
  }
  if (!initialRegion) {
    return (
      <View style={[styles.placeholder, fullBleed ? styles.bleed : { height }]}>
        <Ionicons name="location-outline" size={28} color={colors.textSubtle} />
        <Text style={styles.placeholderText}>Allow location access to see campaigns on the map.</Text>
      </View>
    );
  }

  const recenter = () => {
    if (mapRef.current && myLocation) {
      mapRef.current.animateToRegion({ latitude: myLocation.lat, longitude: myLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 350);
    }
  };

  return (
    <View style={[styles.wrap, fullBleed ? styles.bleed : { height }]}>
      <MapView
        customMapStyle={dark ? DARK_STYLE : undefined}
        userInterfaceStyle={dark ? 'dark' : undefined}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={Boolean(myLocation)}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        mapPadding={{ top: topInset, bottom: bottomInset, left: 0, right: 0 }}
        onMapReady={() => setReady(true)}
      >
        {workingAreas.map((a) => (
          <Marker key={`wa-${a.label}`} coordinate={{ latitude: a.lat, longitude: a.lng }} title={a.label} description="Your working area" tracksViewChanges={false} zIndex={1}>
            <View style={styles.areaDot}>
              <Ionicons name="home" size={11} color="#FFFFFF" />
            </View>
          </Marker>
        ))}
        {selected && selected.target.radius_km ? (
          <Circle
            center={{ latitude: selected.target.lat, longitude: selected.target.lng }}
            radius={selected.target.radius_km * 1000}
            strokeColor={colors.primary}
            strokeWidth={1.5}
            fillColor="rgba(37, 99, 235, 0.08)"
          />
        ) : null}
        {targeted.map((c) => {
          const active = c.id === selectedId;
          const soon = c.opening_soon;
          return (
            <Marker
              key={c.id}
              coordinate={{ latitude: c.target.lat, longitude: c.target.lng }}
              onPress={() => onSelect(c)}
              tracksViewChanges={active}
              zIndex={active ? 20 : 10} // Price bubbles stay above working-area markers at the same spot
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.pinWrap}>
                {dark ? (
                  // Label bubble: campaign name, then payout per day and slots left; Opening Soon in amber,
                  // the selected one inverted.
                  <>
                    <View style={[styles.bubble, soon && styles.bubbleSoon, active && styles.bubbleActive]}>
                      <Text style={[styles.bubbleName, active && { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.bubbleText, active && { color: soon ? colors.warning : colors.primary }]} numberOfLines={1}>
                        {formatINR(c.daily_rate)}/day · {c.remaining_slots > 0 ? `${c.remaining_slots} slot${c.remaining_slots === 1 ? '' : 's'}` : 'Full'}
                      </Text>
                    </View>
                    <View style={[styles.bubbleTail, soon && { borderTopColor: colors.warning }, active && { borderTopColor: '#FFFFFF' }]} />
                  </>
                ) : null}
                {dark ? null : (
                <View style={[styles.pin, soon && styles.pinSoon, active && styles.pinActive]}>
                  <Text style={[styles.pinRate, active && styles.pinTextActive]}>{formatINR(c.daily_rate)}</Text>
                  <Text style={[styles.pinSlots, active && styles.pinTextActive]}>
                    {c.remaining_slots > 0 ? `${c.remaining_slots} slot${c.remaining_slots === 1 ? '' : 's'}` : 'Full'}
                  </Text>
                </View>
                )}
                {dark ? null : <View style={[styles.pinTail, soon && styles.pinTailSoon, active && styles.pinTailActive]} />}
              </View>
            </Marker>
          );
        })}
      </MapView>
      {myLocation ? (
        <TouchableOpacity style={[styles.recenter, { bottom: bottomInset + 12 }]} onPress={recenter} accessibilityLabel="Center on my location">
          <Ionicons name="locate" size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    // Explicit edges: StyleSheet.absoluteFillObject no longer exists in React Native 0.86.
    bleed: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0, borderWidth: 0 },
    bubble: {
      backgroundColor: c.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    },
    bubbleSoon: { backgroundColor: c.warning },
    bubbleActive: { backgroundColor: '#FFFFFF', borderColor: c.primary, transform: [{ scale: 1.08 }] },
    bubbleText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, opacity: 0.95 },
    bubbleName: { color: '#FFFFFF', fontWeight: '800', fontSize: 13, maxWidth: 150 },
    bubbleTail: {
      width: 0, height: 0, marginTop: -1, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8,
      borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF',
    },
    placeholder: {
      borderRadius: 18,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    placeholderText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
    pinWrap: { alignItems: 'center' },
    pin: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 5,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: c.success,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    pinSoon: { borderColor: c.warning },
    pinActive: { backgroundColor: c.primary, borderColor: c.primary },
    pinRate: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
    pinSlots: { fontSize: 10, fontWeight: '600', color: '#475569' },
    pinTextActive: { color: '#FFFFFF' },
    pinTail: {
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderTopWidth: 7,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.success,
    },
    pinTailSoon: { borderTopColor: c.warning },
    pinTailActive: { borderTopColor: c.primary },
    areaDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
    recenter: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
  });
