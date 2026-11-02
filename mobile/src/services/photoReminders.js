// Phone notifications for the rider's daily photos, scheduled on the device (they fire even when the app is
// closed, no push server needed): when each Morning / Evening / Night window opens, and 30 minutes before it
// closes. Built only from the rider's real active campaign (its dates and photo windows, in IST) and today's
// real slot status; a slot already uploaded today gets no reminders. Re-synced whenever the app loads data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PREFIX = 'photo-';
const CHANNEL = 'photo-reminders';
const DAYS_AHEAD = 3; // re-synced on every app open, so a few days ahead is enough
const CLOSING_SOON_MIN = 30;
const ASKED_KEY = 'flexriders.notificationsAsked';
const SLOTS = [
  ['MORNING', 'Morning'],
  ['EVENING', 'Evening'],
  ['NIGHT', 'Night'],
];
const UPLOADED = ['PENDING', 'APPROVED'];

// Show reminders as normal notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelReady = false;
let lastSignature = null;

const clock = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
// Campaign dates and photo windows are in India time.
const istDate = (day, hhmm) => new Date(`${day}T${hhmm}:00+05:30`);
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Photo reminders',
    description: 'When your campaign photo windows open and close',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

/** Asks for notification permission once (Android 13+ / iOS), only when it is actually needed. */
async function hasPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  if (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) return false;
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  const asked = await Notifications.requestPermissionsAsync();
  return Boolean(asked.granted);
}

async function cancelAll() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled.filter((n) => String(n.identifier).startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

/** The reminders this campaign needs from now on (empty if it isn't running). */
function plan(active) {
  if (!active || !active.photo_slot_windows || !active.start_date) return [];
  const state = active.lifecycle && active.lifecycle.key;
  if (state && !['OPEN', 'LIVE'].includes(state)) return []; // paused, completed or cancelled: no reminders
  const end = active.effective_end_date || active.end_date;
  const today = istToday();
  const todaySlots = (active.progress && active.progress.today_photos && active.progress.today_photos.slots) || [];
  const now = Date.now();
  const out = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = addDays(today, i);
    if (day < active.start_date || (end && day > end)) continue;
    for (const [slot, label] of SLOTS) {
      const w = active.photo_slot_windows[slot];
      if (!w) continue;
      if (i === 0 && todaySlots.some((x) => x.slot === slot && UPLOADED.includes(x.status))) continue;
      const opens = istDate(day, w[0]);
      const closes = istDate(day, w[1]);
      const soon = new Date(closes.getTime() - CLOSING_SOON_MIN * 60000);
      const data = { campaignId: active.id, slot };
      if (opens.getTime() > now + 30000) {
        out.push({
          id: `${PREFIX}${active.id}-${day}-${slot}-open`,
          date: opens,
          title: `Your ${label} photo is due`,
          body: `${active.name}: upload your ${label} photo between ${clock(w[0])} and ${clock(w[1])}.`,
          data,
        });
      }
      if (soon.getTime() > now + 30000 && soon > opens) {
        out.push({
          id: `${PREFIX}${active.id}-${day}-${slot}-closing`,
          date: soon,
          title: `${CLOSING_SOON_MIN} minutes left for your ${label} photo`,
          body: `${active.name}: the ${label} window closes at ${clock(w[1])}. Upload it so the day counts.`,
          data,
        });
      }
    }
  }
  return out;
}

/** Brings the scheduled photo reminders in line with the rider's current active campaign. */
export async function syncPhotoReminders(active) {
  try {
    const wanted = plan(active);
    const signature = JSON.stringify(wanted.map((r) => r.id));
    if (signature === lastSignature) return;
    if (!wanted.length) {
      await cancelAll();
      lastSignature = signature;
      return;
    }
    if (!(await hasPermission())) return;
    await ensureChannel();
    await cancelAll();
    for (const r of wanted) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: r.data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CHANNEL },
      });
    }
    lastSignature = signature;
  } catch (err) {
    if (__DEV__) console.log('[reminders] sync failed', err && err.message);
  }
}

/** On logout: no reminders for a rider who is no longer signed in. */
export async function clearPhotoReminders() {
  lastSignature = null;
  await cancelAll().catch(() => {});
}

/** Tapping a reminder: hands its campaign id to the app. Returns an unsubscribe function. */
export function onReminderTap(handler) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response && response.notification && response.notification.request.content.data;
    if (data && data.campaignId) handler(data.campaignId);
  });
  return () => sub.remove();
}
