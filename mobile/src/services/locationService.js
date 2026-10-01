import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// The rider's current location, read from the device only while the app is open (Home / Campaigns), to
// show and match nearby campaigns. Campaign routes are recorded separately (routeTracker), and only while
// the rider records one during an active campaign. There is never a fallback position: when the device
// can't give a fix, the state says why and the caller shows it.
//
// States:
//   SERVICES_OFF       device Location switch is off
//   DENIED             app permission not granted (can ask again)
//   DENIED_PERMANENT   permission denied and the OS won't show the prompt again → open Settings
//   FETCHING           asking the device for a fix
//   AVAILABLE          a real, recent fix
//   UNAVAILABLE        permission and services OK, but no fix arrived (indoors, timeout, provider error)

const GPS_STORAGE_KEY = 'sr_device_gps_coords';
const MAX_CACHE_AGE_MS = 10 * 60 * 1000; // Older fixes are never treated as current
export const LIVE_MAX_AGE_MS = 5 * 60 * 1000; // "Live" only for a fix this recent
const FIX_TIMEOUT_MS = 15000;
const WATCH_FALLBACK_MS = 20000;

const log = (...args) => {
  if (__DEV__) console.log('[location]', ...args); // Development only; never in release builds
};

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms))]);

const validFix = (pos) => {
  const c = pos && pos.coords;
  return (
    c &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180 &&
    !(c.latitude === 0 && c.longitude === 0)
  );
};

/** Current permission + services status, without prompting. */
export async function getLocationStatus() {
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch((e) => {
    log('hasServicesEnabledAsync failed', e.message);
    return true; // Unknown: let the fix attempt report the real problem
  });
  const perm = await Location.getForegroundPermissionsAsync().catch(() => ({ status: 'undetermined', canAskAgain: true }));
  const status = { servicesEnabled, permission: perm.status, canAskAgain: perm.canAskAgain !== false, precise: perm.android ? perm.android.accuracy !== 'coarse' : perm.ios ? perm.ios.accuracy !== 'reduced' : null };
  log('status', status);
  return status;
}

async function readFix() {
  // A very recent last-known fix is instant; otherwise ask for a fresh one, bounded by a timeout.
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000, requiredAccuracy: 200 }).catch(() => null);
  if (validFix(last)) {
    log('last known fix', last.coords.latitude, last.coords.longitude, 'acc', last.coords.accuracy);
    return last;
  }
  try {
    const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), FIX_TIMEOUT_MS);
    if (validFix(pos)) {
      log('getCurrentPositionAsync', pos.coords.latitude, pos.coords.longitude, 'acc', pos.coords.accuracy);
      return pos;
    }
  } catch (e) {
    log('getCurrentPositionAsync failed:', e.message);
  }
  // Some Android devices never resolve getCurrentPositionAsync right after Location is switched on,
  // but do deliver watch updates: wait for the first real watch fix.
  let sub = null;
  try {
    return await withTimeout(
      new Promise((resolve) => {
        Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 0 }, (pos) => {
          if (validFix(pos)) {
            log('first watch fix', pos.coords.latitude, pos.coords.longitude, 'acc', pos.coords.accuracy);
            resolve(pos);
          }
        }).then((s) => {
          sub = s;
        });
      }),
      WATCH_FALLBACK_MS
    );
  } catch (e) {
    log('watch fallback failed:', e.message);
    return null;
  } finally {
    if (sub) sub.remove();
  }
}

async function placeLabel(latitude, longitude) {
  const addresses = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 3000).catch(() => null);
  if (!addresses || !addresses.length) return null;
  const a = addresses[0];
  const parts = [a.district || a.subregion || a.name || a.street, a.city].filter(Boolean);
  return [...new Set(parts)].join(', ') || null;
}

/** Gets the device's real location. prompt: show the OS permission prompt (and, on Android, the
 * "turn on location" dialog) when needed. Returns { state, fix?, message? }. */
export async function acquireLocation({ prompt }) {
  let status = await getLocationStatus();

  // Permission comes first: it can be granted even while the Location switch is off.
  if (status.permission !== 'granted') {
    if (!prompt) return { state: status.canAskAgain ? 'DENIED' : 'DENIED_PERMANENT' };
    if (!status.canAskAgain) return { state: 'DENIED_PERMANENT' };
    const req = await Location.requestForegroundPermissionsAsync();
    log('permission request result', req.status, 'canAskAgain', req.canAskAgain);
    if (req.status !== 'granted') return { state: req.canAskAgain === false ? 'DENIED_PERMANENT' : 'DENIED' };
    status = await getLocationStatus();
  }

  if (!status.servicesEnabled) {
    if (prompt && Platform.OS === 'android') {
      // Android's system dialog to switch Location on (and enable the network provider).
      await Location.enableNetworkProviderAsync().catch((e) => log('enableNetworkProviderAsync', e.message));
      status = await getLocationStatus();
    }
    if (!status.servicesEnabled) return { state: 'SERVICES_OFF' };
  }

  const pos = await readFix();
  if (!pos) return { state: 'UNAVAILABLE', message: 'Unable to get your current location.' };
  const fix = {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp || Date.now(),
    precise: status.precise,
    label: await placeLabel(pos.coords.latitude, pos.coords.longitude),
  };
  await AsyncStorage.setItem(GPS_STORAGE_KEY, JSON.stringify(fix)).catch(() => {});
  return { state: 'AVAILABLE', fix };
}

/** Keeps the fix current while the app is open (moves the map marker). Returns a stop function. */
export async function watchLocation(onFix) {
  try {
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 25 },
      (pos) => {
        if (!validFix(pos)) return;
        const fix = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp || Date.now() };
        log('watch fix', fix.latitude, fix.longitude, 'acc', fix.accuracy);
        AsyncStorage.setItem(GPS_STORAGE_KEY, JSON.stringify(fix)).catch(() => {});
        onFix(fix);
      }
    );
    return () => sub.remove();
  } catch (e) {
    log('watchPositionAsync failed:', e.message);
    return () => {};
  }
}

/** Opens the right settings screen for the state the rider is stuck in. */
export async function openLocationSettings(state) {
  if (state === 'SERVICES_OFF' && Platform.OS === 'android') {
    const ok = await Location.enableNetworkProviderAsync().then(() => true).catch(() => false);
    if (ok) return;
  }
  Linking.openSettings().catch(() => {});
}

/** The last fix read while the app was open, only if still recent (used for joins, never shown as live). */
export async function getCachedDeviceLocation() {
  try {
    const raw = await AsyncStorage.getItem(GPS_STORAGE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !cached.timestamp || Date.now() - cached.timestamp > MAX_CACHE_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export const isLive = (fix) => Boolean(fix && fix.timestamp && Date.now() - fix.timestamp < LIVE_MAX_AGE_MS);

/** Human text for each state (shown on Home and Campaigns). */
export const LOCATION_TEXT = {
  SERVICES_OFF: { text: 'Location services are off', action: 'Turn on' },
  DENIED: { text: 'Location permission is required to show campaigns near you', action: 'Allow' },
  DENIED_PERMANENT: { text: 'Location permission is off for FlexRiders', action: 'Open settings' },
  FETCHING: { text: 'Fetching your location…', action: null },
  UNAVAILABLE: { text: 'Unable to get your current location', action: 'Try again' },
  UNKNOWN: { text: 'Checking location…', action: null },
};
