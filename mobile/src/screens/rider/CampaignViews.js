// Campaign screens from the design: details + Join, join status timeline, the active-campaign tracking
// map, and Daily Activity. Every value comes from the campaign record, the rider's own route points or
// today's photo slots.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assetUrl, mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { Badge, Button, Card, Header } from '../../components/ds';
import { Countdown, distanceLabel } from '../../components/CampaignBits';
import { formatDate, formatINR } from '../../utils';
import { getRouteState, hasBackgroundPermission, istDate, pauseRoute, startRoute, stopRoute, unpauseRoute } from '../../services/routeTracker';

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

const SLOT_ICONS = { MORNING: 'sunny-outline', EVENING: 'partly-sunny-outline', NIGHT: 'moon-outline' };
const to12h = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

function ZoneMap({ campaign, height = 180, route }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const target = campaign.target;
  if (!MapView || (!target && !(route && route.length))) {
    return (
      <View style={[s.zoneEmpty, { height }]}>
        <Ionicons name="map-outline" size={24} color={colors.textSubtle} />
        <Text style={s.muted}>{target ? 'Map unavailable in this build.' : 'This campaign has no target zone: it runs across the city.'}</Text>
      </View>
    );
  }
  const points = [...(target ? [[target.lat, target.lng]] : []), ...(route || [])];
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const pad = target ? (target.radius_km / 111) * 2.4 : 0.01;
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(Math.max(...lats) - Math.min(...lats), pad) * 1.3,
    longitudeDelta: Math.max(Math.max(...lngs) - Math.min(...lngs), pad) * 1.3,
  };
  return (
    <View style={[s.zone, { height }]}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={region} key={`${points.length}`}>
        {target ? (
          <Circle center={{ latitude: target.lat, longitude: target.lng }} radius={target.radius_km * 1000} strokeColor={colors.primary} strokeWidth={2} fillColor="rgba(53, 99, 233, 0.14)" />
        ) : null}
        {route && route.length > 1 ? (
          <>
            <Polyline coordinates={route.map(([latitude, longitude]) => ({ latitude, longitude }))} strokeColor={colors.primary} strokeWidth={5} />
            <Marker coordinate={{ latitude: route[0][0], longitude: route[0][1] }} pinColor="green" title="Start" />
            <Marker coordinate={{ latitude: route[route.length - 1][0], longitude: route[route.length - 1][1] }} pinColor="red" title="Latest" />
          </>
        ) : null}
      </MapView>
    </View>
  );
}

function SlotTiles({ campaign }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const w = campaign.photo_slot_windows || {};
  return (
    <View style={s.tiles}>
      {['MORNING', 'EVENING', 'NIGHT'].map((k) =>
        w[k] ? (
          <View key={k} style={s.tile}>
            <Ionicons name={SLOT_ICONS[k]} size={22} color={colors.primary} />
            <Text style={s.tileTitle}>{k.charAt(0) + k.slice(1).toLowerCase()}</Text>
            <Text style={s.tileSub}>{to12h(w[k][0]).replace(':00', '')} – {to12h(w[k][1]).replace(':00', '')}</Text>
          </View>
        ) : null
      )}
    </View>
  );
}

/** Campaign details for a rider who hasn't joined: everything they need to decide, then Join. */
export function CampaignInfoView({ campaign, onBack, onJoin, joining, extras }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const reqs = campaign.requirements || campaign.rules || [];
  const open = campaign.can_join;
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <Header onBack={onBack} title={campaign.name} />
        <Card>
          <View style={s.rowBetween}>
            <Text style={s.brand}>{(campaign.brand_name || '').toUpperCase()}</Text>
            {campaign.opening_soon ? <Badge label="Opening Soon" tone="warning" /> : campaign.remaining_slots === 0 ? <Badge label="Full" tone="neutral" /> : <Badge label="Open" tone="success" />}
          </View>
          <Text style={s.bigName}>{campaign.name}</Text>
          <Text style={s.muted}>{[`#${campaign.code}`, campaign.location_area, distanceLabel(campaign.distance_km)].filter(Boolean).join(' • ')}</Text>
          {campaign.description ? <Text style={s.body}>{campaign.description}</Text> : null}
          {campaign.opening_soon ? (
            <View style={s.soon}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <Countdown startsAt={campaign.starts_at} prefix="Starts in " style={s.soonText} />
            </View>
          ) : null}
        </Card>
        {campaign.image_url ? <Image source={{ uri: assetUrl(campaign.image_url) }} style={s.banner} /> : null}
        <Card style={s.gap}>
          <Text style={s.cardTitle}>Target Route Zone</Text>
          <ZoneMap campaign={campaign} />
          {campaign.in_my_area ? <Text style={[s.muted, { marginTop: 8, color: colors.primary }]}>In your working area: {campaign.my_area_label}</Text> : null}
        </Card>
        <View style={[s.row2, s.gap]}>
          <Card style={{ flex: 1 }}>
            <Text style={s.caption}>START DATE</Text>
            <Text style={s.value}>{formatDate(campaign.start_date)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={s.caption}>END DATE</Text>
            <Text style={s.value}>{formatDate(campaign.effective_end_date || campaign.end_date)}</Text>
          </Card>
        </View>
        <Card style={s.gap}>
          <Text style={s.cardTitle}>Required Activity Uploads</Text>
          <SlotTiles campaign={campaign} />
        </Card>
        <Card style={[s.gap, s.reward]}>
          <Text style={[s.caption, { color: colors.primary }]}>DAILY REWARD</Text>
          <Text style={s.rewardValue}>{formatINR(campaign.daily_rate)} / day</Text>
          <Text style={[s.body, { color: colors.primary, marginTop: 4 }]}>Paid for every day your Morning, Evening and Night photos are all approved.</Text>
        </Card>
        <View style={[s.row2, s.gap]}>
          <Card style={{ flex: 1 }}>
            <Text style={s.caption}>SLOTS LEFT</Text>
            <Text style={s.value}>{campaign.remaining_slots} / {campaign.slot_capacity}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={s.caption}>VEHICLE</Text>
            <Text style={s.value}>{campaign.eligible_vehicle_label}</Text>
          </Card>
        </View>
        {reqs.length ? (
          <Card style={s.gap}>
            <Text style={s.cardTitle}>Requirements</Text>
            {reqs.map((r) => (
              <View key={r} style={s.req}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={s.reqText}>{r}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {extras}
      </ScrollView>
      <View style={s.footer}>
        {open ? (
          <Button label="Join Campaign" onPress={onJoin} loading={joining} />
        ) : (
          <View style={s.blocked}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <Text style={s.blockedText}>{campaign.join_blocked_reason || 'This campaign is not accepting riders right now.'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** After requesting: the reserved slot and where the application stands. */
export function JoinStatusView({ campaign, onBack, onWithdraw, onDetails, extras }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const req = campaign.my_request || {};
  const rejected = req.status === 'REJECTED';
  const kitPending = req.kit_status === 'PENDING';
  const steps = [
    ['Requested', req.requested_at ? new Date(req.requested_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '', 'done'],
    ['Slot Reserved', '1 slot held for you while your request is reviewed', rejected ? 'done' : 'done'],
    kitPending ? ['Collect T-shirt', 'Pick up your campaign T-shirt before approval', 'current'] : null,
    rejected ? ['Not approved', req.rejection_reason || '', 'failed'] : ['Pending Approval', 'The FlexRiders team is reviewing your request', kitPending ? 'todo' : 'current'],
    rejected ? null : ['Approved', 'Start riding and earning', 'todo'],
  ].filter(Boolean);
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <Header onBack={onBack} title="Join Campaign" circle={false} />
        <Card>
          <View style={s.rowBetween}>
            <Text style={[s.brand, { color: colors.primary }]}>{(campaign.brand_name || '').toUpperCase()}</Text>
            <Badge label={rejected ? 'NOT APPROVED' : 'RESERVED'} tone={rejected ? 'danger' : 'warning'} />
          </View>
          <Text style={s.bigName}>{campaign.name}</Text>
          <Text style={s.muted}>{campaign.location_area || ''}</Text>
          <View style={s.divider} />
          <View style={s.rowBetween}>
            <Text style={s.muted}>Earnings</Text>
            <Text style={[s.value, { color: colors.primary }]}>{formatINR(campaign.daily_rate)} / day</Text>
          </View>
        </Card>
        {!rejected ? (
          <Card style={s.gap}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.dot, { backgroundColor: colors.warning }]} />
              <Text style={s.cardTitle}>Pending Admin Approval</Text>
            </View>
            <Text style={s.body}>Your slot is reserved. Our operations team reviews your profile and request, and you'll get a notification when it's approved.</Text>
          </Card>
        ) : null}
        <Card style={s.gap}>
          <Text style={s.caption}>APPLICATION PROGRESS</Text>
          {steps.map(([title, sub, state], i) => (
            <View key={title} style={s.step}>
              <View style={{ alignItems: 'center' }}>
                <View style={[s.stepDot, state === 'done' && s.stepDone, state === 'current' && s.stepCurrent, state === 'failed' && s.stepFailed]}>
                  {state === 'done' ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : state === 'failed' ? <Ionicons name="close" size={16} color={colors.danger} /> : state === 'current' ? <View style={[s.dot, { backgroundColor: colors.warning }]} /> : <Text style={s.stepNum}>{i + 1}</Text>}
                </View>
                {i < steps.length - 1 ? <View style={[s.stepLine, state === 'done' && { backgroundColor: colors.primary }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Text style={[s.stepTitle, state === 'current' && { color: colors.warning }, state === 'todo' && { color: colors.textMuted }]}>{title}</Text>
                {sub ? <Text style={s.muted}>{sub}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
        {extras}
        <TouchableOpacity onPress={onDetails} style={{ alignItems: 'center', paddingVertical: 14 }}>
          <Text style={s.link}>View campaign details</Text>
        </TouchableOpacity>
      </ScrollView>
      {!rejected ? (
        <View style={s.footer}>
          <TouchableOpacity style={s.withdraw} onPress={onWithdraw}>
            <Text style={s.withdrawText}>Withdraw Request</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** Active campaign: today's route on the map (from the rider's own uploaded points), tracking controls. */
export function ActiveCampaignView({ campaign, onBack, onDaily, onDetails }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [state, setState] = useState(undefined);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const loadRoute = useCallback(() => mobileApi.getMyRoute(campaign.id).then(setRoute).catch(() => {}), [campaign.id]);

  useEffect(() => {
    getRouteState().then((st) => setState(st && st.campaignId === campaign.id && st.day === istDate() ? st : st ? { other: true } : null));
    loadRoute();
    const a = setInterval(loadRoute, 30000);
    const b = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [loadRoute]);

  const tracking = Boolean(state && !state.other && !state.paused);
  const paused = Boolean(state && !state.other && state.paused);
  const run = async (fn) => {
    setBusy(true);
    try {
      setState(await fn());
      loadRoute();
    } catch (err) {
      Alert.alert('Route', err.message);
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    if (await hasBackgroundPermission()) return run(() => startRoute(campaign.id, { askBackground: false }));
    // Required disclosure before the background-location permission is requested.
    Alert.alert(
      'Location while you ride',
      'FlexRiders records your location from Start until you Stop (or the campaign day ends), even with the screen off, ' +
        'to verify your campaign route. It is shared only with the FlexRiders team and never collected at other times.\n\n' +
        'Choose "Allow all the time" on the next screen to keep recording with the screen off.',
      [
        { text: 'Only while app is open', onPress: () => run(() => startRoute(campaign.id, { askBackground: false })) },
        { text: 'Continue', onPress: () => run(() => startRoute(campaign.id, { askBackground: true })) },
      ]
    );
  };
  const stop = () =>
    Alert.alert('Stop ride?', 'Location sharing stops and today’s route is saved.', [
      { text: 'Keep riding', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => run(async () => { await stopRoute(); return null; }) },
    ]);

  const startedAt = (route && route.started_at) || (state && state.startedAt);
  const elapsedMin = startedAt ? Math.max(0, Math.round(((tracking ? now : Date.parse((route && route.ended_at) || startedAt)) - Date.parse(startedAt)) / 60000)) : null;
  const p = campaign.progress || {};

  return (
    <View style={s.screen}>
      <View style={{ flex: 1 }}>
        {MapView ? (
          <ZoneMap campaign={campaign} route={route ? route.points : []} height="100%" />
        ) : (
          <View style={[s.zoneEmpty, { flex: 1 }]} />
        )}
        <View style={s.floatingHeader}>
          <TouchableOpacity onPress={onBack} style={s.backCircle} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.floatingTitle}>Active Campaign</Text>
          {tracking ? <Badge label="TRACKING" tone="success" /> : paused ? <Badge label="PAUSED" tone="warning" /> : null}
        </View>
      </View>
      <View style={s.panel}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={[s.brand, { color: colors.primary }]}>{(campaign.brand_name || '').toUpperCase()}</Text>
            <Text style={s.bigName} numberOfLines={1}>{campaign.name}</Text>
          </View>
          <View style={[s.dot, { backgroundColor: tracking ? colors.success : colors.border, width: 12, height: 12, borderRadius: 6 }]} />
        </View>
        <View style={s.divider} />
        <View style={s.stats}>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>Start Time</Text>
            <Text style={s.statValue}>{clock(startedAt)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>Elapsed</Text>
            <Text style={s.statValue}>{elapsedMin == null ? '—' : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>Distance</Text>
            <Text style={s.statValue}>{route ? `${route.distance_km} km` : '—'}</Text>
          </View>
        </View>
        <View style={s.divider} />
        {state && state.other ? (
          <Text style={s.muted}>A route is already recording for another campaign.</Text>
        ) : tracking ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button label="Pause Ride" tone="warning" style={{ flex: 1 }} onPress={() => run(pauseRoute)} loading={busy} />
            <Button label="Stop" tone="danger" style={{ paddingHorizontal: 28 }} onPress={stop} disabled={busy} />
          </View>
        ) : paused ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button label="Resume Ride" style={{ flex: 1 }} onPress={() => run(unpauseRoute)} loading={busy} />
            <Button label="Stop" tone="danger" style={{ paddingHorizontal: 28 }} onPress={stop} disabled={busy} />
          </View>
        ) : (
          <Button label="Start Ride" icon="navigate" onPress={begin} loading={busy} disabled={state === undefined} />
        )}
        <View style={[s.row2, { marginTop: 12 }]}>
          <TouchableOpacity style={s.secondary} onPress={onDaily}>
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={s.secondaryText}>
              Daily Activity{p.today_photos ? ` · ${Math.min(p.today_photos.valid + p.today_photos.pending, p.photos_required)}/${p.photos_required}` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondary} onPress={onDetails}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={s.secondaryText}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const SLOT_STATE = {
  APPROVED: ['COMPLETED', 'success'],
  PENDING: ['IN REVIEW', 'primary'],
  REJECTED: ['RETAKE', 'danger'],
};

/** Daily Activity: today's three photo sessions and the week's streak. */
export function DailyActivityView({ campaign, busy, onTake, onBack, extras }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const p = campaign.progress || {};
  const today = p.today_photos;
  const nowHM = new Date().toTimeString().slice(0, 5);
  const days = (p.days || []).slice(-7);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Header onBack={onBack} title="Daily Activity" circle={false} />
      <View style={[s.rowBetween, { marginBottom: 12 }]}>
        <Text style={s.cardTitle}>Today's Submissions</Text>
        <Text style={s.link}>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</Text>
      </View>
      {campaign.plate_in_photos ? (
        <Card style={[s.gap, { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }]}>
          <Text style={[s.body, { marginTop: 0, color: colors.text }]}>
            Your number plate{campaign.my_vehicle_number ? ` (${campaign.my_vehicle_number})` : ''} must be readable in every photo.
          </Text>
        </Card>
      ) : null}
      {!today || !today.in_window ? (
        <Card>
          <Text style={s.body}>Photos can be submitted on campaign days only.</Text>
        </Card>
      ) : (
        today.slots.map((slot) => {
          const [label, tone] = SLOT_STATE[slot.status] || [];
          const upcoming = slot.status === 'NOT_STARTED' && nowHM < slot.window.start;
          const missed = slot.status === 'NOT_STARTED' && nowHM > slot.window.end;
          const canTake = p.can_submit_today && (slot.status === 'NOT_STARTED' || slot.status === 'REJECTED') && !upcoming && !missed;
          return (
            <Card key={slot.slot} style={[s.gap, upcoming && { backgroundColor: colors.surfaceAlt }]}>
              <View style={s.rowBetween}>
                <View style={[s.slotIcon, { backgroundColor: upcoming ? colors.border : canTake ? colors.warningSoft : colors.primarySoft }]}>
                  <Ionicons name={upcoming ? 'time-outline' : 'camera-outline'} size={22} color={upcoming ? colors.textMuted : canTake ? colors.warning : colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s.cardTitle, upcoming && { color: colors.textMuted }]}>{slot.label} Session</Text>
                  <Text style={s.muted}>{to12h(slot.window.start)} - {to12h(slot.window.end)}</Text>
                </View>
                {label ? <Badge label={label} tone={tone} /> : upcoming ? <Text style={s.upcoming}>UPCOMING</Text> : missed ? <Badge label="MISSED" tone="danger" /> : <Badge label="REQUIRED" tone="warning" />}
              </View>
              {slot.photo_url ? (
                <View style={[s.rowBetween, { marginTop: 12, justifyContent: 'flex-start', gap: 12 }]}>
                  <Image source={{ uri: assetUrl(slot.photo_url) }} style={s.proof} />
                  <Text style={[s.muted, { flex: 1 }]}>
                    {slot.status === 'APPROVED' ? `Approved · earns toward ${formatINR(campaign.daily_rate)}` : slot.status === 'REJECTED' ? `Rejected: ${slot.rejection_reason || 'please retake'}` : 'Waiting for review'}
                  </Text>
                </View>
              ) : null}
              {canTake ? <Button label={slot.status === 'REJECTED' ? 'Retake Photo' : 'Upload Photo'} icon="camera" onPress={() => onTake(slot)} loading={busy === slot.slot} style={{ marginTop: 12, height: 50 }} /> : null}
            </Card>
          );
        })
      )}
      <Card style={s.gap}>
        <View style={s.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="flame-outline" size={22} color={colors.danger} />
            <Text style={s.cardTitle}>{p.current_streak || 0} Day Streak</Text>
          </View>
          <Text style={s.muted}>Longest {p.longest_streak || 0}</Text>
        </View>
        <View style={s.week}>
          {days.map((d) => {
            const done = d.status === 'COMPLETED';
            return (
              <View key={d.date} style={{ alignItems: 'center', gap: 6 }}>
                <Text style={s.muted}>{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}</Text>
                <View style={[s.weekDot, done && { backgroundColor: colors.primary }]}>
                  {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : <View style={s.weekInner} />}
                </View>
              </View>
            );
          })}
        </View>
        <View style={s.divider} />
        <Text style={s.muted}>Rule: all {p.photos_required || 3} photos approved on a day completes 1 streak day and earns {formatINR(campaign.daily_rate)}.</Text>
      </Card>
      {extras}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, backgroundColor: c.background },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    row2: { flexDirection: 'row', gap: 12 },
    gap: { marginTop: 14 },
    brand: { fontSize: 13, fontWeight: '800', color: c.textMuted, letterSpacing: 0.4 },
    bigName: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 6 },
    muted: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    body: { fontSize: 15, color: c.textMuted, lineHeight: 21, marginTop: 10 },
    cardTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    caption: { fontSize: 12, fontWeight: '800', color: c.textMuted, letterSpacing: 0.5 },
    value: { fontSize: 18, fontWeight: '800', color: c.text, marginTop: 4 },
    link: { color: c.primary, fontWeight: '700', fontSize: 15 },
    banner: { width: '100%', height: 160, borderRadius: 20, marginTop: 14, backgroundColor: c.surfaceAlt },
    zone: { borderRadius: 16, overflow: 'hidden', marginTop: 12 },
    zoneEmpty: { borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, marginTop: 12 },
    soon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.warningSoft, borderRadius: 14, padding: 12, marginTop: 14 },
    soonText: { color: c.warning, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
    tiles: { flexDirection: 'row', gap: 10, marginTop: 12 },
    tile: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: 14 },
    tileTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    tileSub: { fontSize: 12, color: c.textMuted },
    reward: { backgroundColor: c.primarySoft, borderColor: c.primarySoft },
    rewardValue: { fontSize: 30, fontWeight: '800', color: c.primary, marginTop: 4 },
    req: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10 },
    reqText: { flex: 1, fontSize: 15, color: c.text },
    blocked: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14 },
    blockedText: { flex: 1, fontSize: 14, color: c.textMuted, lineHeight: 19 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 14 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    step: { flexDirection: 'row', gap: 14, marginTop: 14 },
    stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    stepDone: { backgroundColor: c.primarySoft, borderColor: c.primarySoft },
    stepCurrent: { backgroundColor: c.warningSoft, borderColor: c.warningSoft },
    stepFailed: { backgroundColor: c.dangerSoft, borderColor: c.dangerSoft },
    stepNum: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    stepLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: c.border, marginTop: 4 },
    stepTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    withdraw: { height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    withdrawText: { color: c.danger, fontWeight: '800', fontSize: 17 },
    floatingHeader: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    backCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    floatingTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: c.text, textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 6 },
    panel: { backgroundColor: c.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, marginTop: -24 },
    stats: { flexDirection: 'row' },
    statValue: { fontSize: 19, fontWeight: '800', color: c.text, marginTop: 4 },
    secondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: c.primarySoft },
    secondaryText: { color: c.primary, fontWeight: '700', fontSize: 14 },
    slotIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    upcoming: { fontSize: 13, fontWeight: '700', color: c.textMuted, letterSpacing: 0.4 },
    proof: { width: 64, height: 48, borderRadius: 8, backgroundColor: c.surfaceAlt },
    week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
    weekDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    weekInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.textSubtle },
  });
