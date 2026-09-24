/**
 * Campaign route recording: real GPS fixes, collected only between "Start Route" and "End Route"
 * on a campaign day, queued on the phone and uploaded in batches (nothing is lost without signal).
 *
 * Background recording (screen off / app in background) is used when the rider allows it;
 * otherwise the route records while the app is open.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_BASE_URL, getAuthToken, loadStoredToken } from './api';

const TASK_NAME = 'sr-campaign-route';
const STATE_KEY = 'sr_route_state';
const QUEUE_KEY = 'sr_route_queue';
const MAX_QUEUE = 5000;
const BATCH = 500;

let foregroundWatch = null;
let flushing = false;

// India Standard Time date (routes belong to one campaign day).
export const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const toPoint = (loc) => ({
  latitude: loc.coords.latitude,
  longitude: loc.coords.longitude,
  accuracy: loc.coords.accuracy,
  recorded_at: new Date(loc.timestamp).toISOString(),
});

export async function getRouteState() {
  try {
    return JSON.parse((await AsyncStorage.getItem(STATE_KEY)) || 'null');
  } catch {
    return null;
  }
}

async function enqueue(points) {
  if (!points.length) return;
  const queue = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]');
  const next = queue.concat(points).slice(-MAX_QUEUE);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

async function handleLocations(locations) {
  const state = await getRouteState();
  if (!state) return;
  if (state.day !== istDate()) {
    await stopRoute(); // The campaign day is over
    return;
  }
  await enqueue(locations.map(toPoint));
}

// Background updates arrive here even when the app isn't on screen.
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || !data || !data.locations) return;
  await handleLocations(data.locations);
  await flushRoute();
});

/** Uploads queued points. Returns false if the server says this rider can't record (route is stopped). */
export async function flushRoute() {
  if (flushing) return true;
  flushing = true;
  try {
    const state = await getRouteState();
    let queue = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]');
    const campaignId = state ? state.campaignId : null;
    if (!campaignId || !queue.length) return true;
    const token = getAuthToken() || (await loadStoredToken());
    if (!token) return true;
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${API_BASE_URL}/riders/me/campaigns/${campaignId}/route-points`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        // Not active in this campaign any more (or logged out): stop and discard.
        await AsyncStorage.removeItem(QUEUE_KEY);
        await stopRoute();
        return false;
      }
      if (!res.ok) return true; // Server busy: try again on the next flush
      queue = queue.slice(batch.length);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
    return true;
  } catch {
    return true; // Offline: points stay queued
  } finally {
    flushing = false;
  }
}

async function startForegroundWatch() {
  if (foregroundWatch) return;
  foregroundWatch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
    (loc) => handleLocations([loc])
  );
}

/** Starts recording today's route. Throws with a readable message if location isn't allowed. */
export async function startRoute(campaignId) {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location access is needed to record your route. Allow it in Settings.');
  }
  // Leftover points from an earlier session never belong to this route.
  await AsyncStorage.removeItem(QUEUE_KEY);
  // Save the route first so the very first fixes are kept.
  const state = { campaignId, day: istDate(), startedAt: new Date().toISOString(), mode: 'foreground' };
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  let mode = 'foreground';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15000,
        distanceInterval: 20,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Recording your campaign route',
          notificationBody: 'Your location is shared with Super Riders until you end the route.',
        },
      });
      mode = 'background';
    }
  } catch {
    mode = 'foreground'; // Background updates not available (e.g. Expo Go): record while the app is open
  }
  if (mode === 'foreground') await startForegroundWatch();
  state.mode = mode;
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  return state;
}

/** Ends the route and uploads what's left. */
export async function stopRoute() {
  const state = await getRouteState();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch {
    // Not running
  }
  if (foregroundWatch) {
    foregroundWatch.remove();
    foregroundWatch = null;
  }
  if (state) {
    await flushRoute();
    await AsyncStorage.removeItem(STATE_KEY);
  }
}

/** On app start: resume a foreground route after a reload, or end one from a previous day. */
export async function resumeRoute() {
  const state = await getRouteState();
  if (!state) return null;
  if (state.day !== istDate()) {
    await stopRoute();
    return null;
  }
  if (state.mode === 'foreground') await startForegroundWatch();
  return state;
}
