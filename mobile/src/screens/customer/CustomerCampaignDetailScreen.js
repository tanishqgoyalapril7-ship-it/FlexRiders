import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assetUrl, mobileApi } from '../../services/api';
import { subscribeSignals } from '../../services/realtime';
import { useStyles, useTheme } from '../../theme';
import { Card, EmptyState, OutlineButton, PrimaryButton, ProgressBar, SectionHeader } from '../../components/ui';
import { Header as ScreenHeader } from '../../components/ds';
import { formatDate, formatDateRange, formatINR } from '../../utils';
import { BrandStatusPill } from './brandShared';

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

const ROUTE_COLORS = ['#2563EB', '#7C3AED', '#EA580C', '#0891B2', '#DB2777', '#4F46E5'];
const ACTIVITY_ORANGE = '#FC4C02';
const STEPS = [
  ['REQUESTED', 'Requested'],
  ['APPROVED', 'Approved'],
  ['LIVE', 'Live'],
  ['COMPLETED', 'Completed'],
];
const STEP_INDEX = { DRAFT: -1, REQUESTED: 0, CHANGES_REQUESTED: 0, APPROVED: 1, LIVE: 2, PAUSED: 2, COMPLETED: 3 };
const MONITORED = ['LIVE', 'PAUSED', 'COMPLETED'];

export default function CustomerCampaignDetailScreen({ campaignId, onBack, onEditCampaign, onChanged }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState('riders');

  const load = useCallback(async () => {
    try {
      setCampaign(await mobileApi.getCustomerCampaign(campaignId));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load this campaign.');
    }
  }, [campaignId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000); // Status and rider counts come straight from the server
    return () => clearInterval(id);
  }, [load]);

  // Approved / live / riders joined: the admin's action shows here at once (brand realtime channel).
  useEffect(() => {
    let unsubscribe = () => {};
    let alive = true;
    mobileApi
      .getCustomerRealtime()
      .then((config) => {
        if (alive) unsubscribe = subscribeSignals(config, (p) => (!p.campaign_id || p.campaign_id === campaignId) && load());
      })
      .catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load, campaignId]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await mobileApi.updateCustomerCampaign(campaignId, { submit: true });
      Alert.alert('Campaign submitted', 'Your campaign is awaiting Admin review.');
      await load();
      onChanged && onChanged();
    } catch (err) {
      Alert.alert('Could not submit', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!campaign) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <ScreenHeader title="Campaign" onBack={onBack} />
          {error ? (
            <EmptyState icon="alert-circle-outline" title="Unable to load campaign" message={error} />
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          )}
        </View>
      </View>
    );
  }

  const status = campaign.brand_status;
  const stepAt = STEP_INDEX[status] ?? -1;
  const editable = ['DRAFT', 'CHANGES_REQUESTED', 'REQUESTED'].includes(status);
  const geo = campaign.geo || {};
  const rows = [
    ['location-outline', 'Campaign Area', campaign.location_area || 'Not set'],
    ['calendar-outline', 'Campaign Period', formatDateRange(campaign.start_date, campaign.end_date)],
    campaign.daily_start_time && campaign.daily_end_time ? ['time-outline', 'Daily hours', `${campaign.daily_start_time} – ${campaign.daily_end_time}`] : null,
    ['people-outline', 'Required Riders', String(campaign.required_riders)],
    campaign.daily_rate ? ['cash-outline', 'Payout per rider / day', formatINR(campaign.daily_rate)] : null,
    geo.targeted
      ? ['radio-button-on-outline', 'Radius', `${geo.initial_radius_km} km${geo.max_radius_km ? `, up to ${geo.max_radius_km} km` : ''}${MONITORED.includes(status) ? ` · now ${geo.current_radius_km} km` : ''}`]
      : null,
    campaign.submitted_at ? ['paper-plane-outline', 'Submitted', formatDate(campaign.submitted_at)] : null,
  ].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Campaign" onBack={onBack} />

      <Card style={{ gap: 12 }}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{campaign.name}</Text>
            <Text style={styles.code}>Campaign ID: {campaign.campaign_code}</Text>
          </View>
          <BrandStatusPill status={status} />
        </View>

        {MONITORED.includes(status) ? (
          <View>
            <View style={styles.progressHead}>
              <Text style={styles.big}>
                {campaign.joined_riders} / {campaign.required_riders}
              </Text>
              <Text style={styles.bigLabel}>Riders joined</Text>
            </View>
            <ProgressBar value={campaign.joined_riders} max={campaign.required_riders || 1} color={colors.success} />
          </View>
        ) : null}

        {stepAt >= 0 ? (
          <View style={styles.steps}>
            {STEPS.map(([key, label], i) => (
              <View key={key} style={styles.step}>
                <View style={[styles.stepDot, i <= stepAt && { backgroundColor: colors.success, borderColor: colors.success }]}>
                  {i <= stepAt ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                </View>
                <Text style={[styles.stepLabel, i <= stepAt && { color: colors.text }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {status === 'REQUESTED' ? <Text style={styles.note}>Your campaign is awaiting Admin review.</Text> : null}
        {status === 'APPROVED' ? <Text style={styles.note}>Approved by FlexRiders. It goes live for riders when FlexRiders launches it.</Text> : null}
        {campaign.admin_feedback && ['CHANGES_REQUESTED', 'REJECTED'].includes(status) ? (
          <View style={styles.feedback}>
            <Text style={styles.feedbackTitle}>{status === 'REJECTED' ? 'Reason' : 'Changes requested by FlexRiders'}</Text>
            <Text style={styles.feedbackText}>{campaign.admin_feedback}</Text>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Campaign Details" />
      <Card style={{ paddingVertical: 4 }}>
        {rows.map(([icon, label, value], i) => (
          <View key={label} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <Ionicons name={icon} size={17} color={colors.textMuted} style={{ width: 26 }} />
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </Card>
      {campaign.description ? (
        <>
          <SectionHeader title="Description" />
          <Card>
            <Text style={styles.body}>{campaign.description}</Text>
          </Card>
        </>
      ) : null}

      {editable ? (
        <View style={{ gap: 10, marginTop: 18 }}>
          <OutlineButton label="Edit Campaign" onPress={() => onEditCampaign(campaign)} />
          {status !== 'REQUESTED' ? <PrimaryButton label="Submit for Review" onPress={submit} loading={submitting} /> : null}
        </View>
      ) : null}

      {MONITORED.includes(status) ? (
        <>
          <View style={styles.segments}>
            {[
              ['riders', 'Riders'],
              ['photos', 'Photos'],
              ['map', 'Map'],
            ].map(([key, label]) => (
              <TouchableOpacity key={key} style={[styles.segment, section === key && styles.segmentActive]} onPress={() => setSection(key)}>
                <Text style={[styles.segmentText, section === key && styles.segmentTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {section === 'riders' ? <RidersPanel campaignId={campaign.id} /> : null}
          {section === 'photos' ? <PhotosPanel campaignId={campaign.id} /> : null}
          {section === 'map' ? <MapPanel campaignId={campaign.id} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

/** Participating riders (names and participation only). */
function RidersPanel({ campaignId }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    mobileApi.getCustomerCampaignRiders(campaignId).then(setData).catch((err) => setError(err.message));
  }, [campaignId]);
  if (error) return <EmptyState icon="alert-circle-outline" title="Unable to load riders" message={error} />;
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />;
  if (!data.riders.length) return <EmptyState icon="people-outline" title="No riders yet" message="Riders appear here once they join and are approved." />;
  return (
    <Card style={{ paddingVertical: 4 }}>
      {data.riders.map((r, i) => (
        <View key={r.assignment_id} style={[styles.row, i === data.riders.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.riderIndex}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{r.name}</Text>
            <Text style={styles.riderMeta}>
              {r.rider_id} · {r.approved_days} approved day{r.approved_days === 1 ? '' : 's'} · {r.approved_photos} approved photo{r.approved_photos === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={[styles.riderStatus, { color: r.status === 'ACTIVE' ? colors.success : colors.textMuted }]}>{r.status_label}</Text>
        </View>
      ))}
    </Card>
  );
}

/** Approved photos only, grouped by day. */
function PhotosPanel({ campaignId }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [days, setDays] = useState(null);
  const [open, setOpen] = useState(null); // { date, photos }
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    mobileApi.getCustomerCampaignPhotoDays(campaignId).then((d) => setDays(d.days)).catch((err) => setError(err.message));
  }, [campaignId]);
  const openDay = async (date) => {
    setOpen({ date, photos: null });
    try {
      const d = await mobileApi.getCustomerCampaignPhotos(campaignId, date);
      setOpen({ date, photos: d.photos });
    } catch (err) {
      setOpen(null);
      Alert.alert('Unable to load photos', err.message);
    }
  };
  if (error) return <EmptyState icon="alert-circle-outline" title="Unable to load photos" message={error} />;
  if (!days) return <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />;
  if (!days.length) return <EmptyState icon="images-outline" title="No approved photos yet" message="Photos appear here after FlexRiders approves them." />;
  return (
    <>
      <Card style={{ paddingVertical: 4 }}>
        {days.map((d, i) => (
          <TouchableOpacity key={d.date} style={[styles.row, i === days.length - 1 && { borderBottomWidth: 0 }]} onPress={() => openDay(d.date)}>
            <Ionicons name="calendar-outline" size={17} color={colors.primary} style={{ width: 26 }} />
            <Text style={[styles.rowLabel, { color: colors.text, fontWeight: '700' }]}>{formatDate(d.date)}</Text>
            <Text style={styles.rowValue}>
              {d.approved_photos} approved photo{d.approved_photos === 1 ? '' : 's'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </Card>
      {open ? (
        <>
          <SectionHeader title={formatDate(open.date)} />
          {!open.photos ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.photoGrid}>
              {open.photos.map((p) => (
                <TouchableOpacity key={p.id} style={styles.photoCell} onPress={() => setViewing(p)}>
                  <Image source={{ uri: assetUrl(p.photo_url) }} style={styles.photo} />
                  <Text style={styles.photoCaption} numberOfLines={1}>
                    {[p.rider_name, p.slot_label].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ) : null}
      <Modal visible={Boolean(viewing)} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: assetUrl(viewing.photo_url) }} style={styles.viewerImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}

/** Campaign area and, for a chosen day, the recorded routes of this campaign's riders. */
function MapPanel({ campaignId }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [day, setDay] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    mobileApi
      .getCustomerCampaignMap(campaignId, day)
      .then((d) => {
        setData(d);
        if (!day && d.route_dates.length) setDay(d.route_dates[d.route_dates.length - 1]);
      })
      .catch((err) => setError(err.message));
  }, [campaignId, day]);
  if (error) return <EmptyState icon="alert-circle-outline" title="Unable to load the map" message={error} />;
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />;
  const g = data.geo;
  const points = [...(g.targeted ? [[g.target_lat, g.target_lng]] : []), ...data.routes.flatMap((r) => r.points)];
  if (!MapView) return <EmptyState icon="map-outline" title="Map unavailable" message="The map isn't available in this build of the app." />;
  if (!points.length) return <EmptyState icon="map-outline" title="Nothing to show yet" message="Routes appear here once riders record them during the campaign." />;
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.5, 0.03),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.5, 0.03),
  };
  return (
    <>
      {data.route_dates.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {[...data.route_dates].reverse().map((d) => (
            <TouchableOpacity key={d} style={[styles.dayChip, d === day && styles.segmentActive]} onPress={() => setDay(d)}>
              <Text style={[styles.segmentText, d === day && styles.segmentTextActive]}>{formatDate(d)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.mapWrap}>
        <MapView key={`${day}-${data.routes.length}`} style={StyleSheet.absoluteFill} initialRegion={region}>
          {g.targeted ? (
            <Circle
              center={{ latitude: g.target_lat, longitude: g.target_lng }}
              radius={g.current_radius_km * 1000}
              strokeColor={colors.primary}
              fillColor="rgba(37, 99, 235, 0.08)"
            />
          ) : null}
          {data.routes.map((r, i) => {
            const coords = r.points.map(([latitude, longitude]) => ({ latitude, longitude }));
            return (
              <React.Fragment key={`${r.rider_name}-${i}`}>
                <Polyline coordinates={coords} strokeColor={ROUTE_COLORS[i % ROUTE_COLORS.length]} strokeWidth={4} />
                <Marker coordinate={coords[0]} pinColor="green" title={`Start · ${r.rider_name}`} />
                <Marker coordinate={coords[coords.length - 1]} pinColor="red" title={`End · ${r.rider_name}`} />
              </React.Fragment>
            );
          })}
        </MapView>
      </View>
      {data.routes.length ? <Text style={styles.activitiesTitle}>Rider activities · {formatDate(day)}</Text> : null}
      {data.routes.map((r, i) => (
        <ActivityCard key={`${r.rider_code || r.rider_name}-card-${i}`} route={r} day={day} />
      ))}
    </>
  );
}

const fmtDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`);
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** One rider's day, like a fitness app activity: who and when, the measured stats, and the route alone. */
function ActivityCard({ route: r, day }) {
  const styles = useStyles(makeStyles);
  const coords = r.points.map(([latitude, longitude]) => ({ latitude, longitude }));
  const lats = coords.map((p) => p.latitude);
  const lngs = coords.map((p) => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.006),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.006),
  };
  return (
    <View style={styles.activity}>
      <View style={styles.activityHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(r.rider_name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.activityName} numberOfLines={1}>{r.rider_name}</Text>
          <Text style={styles.activityWhen}>
            {formatDate(day)} · {clock(r.started_at)} – {clock(r.ended_at)}
          </Text>
        </View>
        {r.in_progress ? <Text style={styles.inProgress}>● In progress</Text> : null}
      </View>
      <View style={styles.stats}>
        {[
          ['Distance', `${Number(r.distance_km).toFixed(1)} km`],
          ['Time on road', fmtDuration(r.duration_min)],
          ['Approved photos', String(r.approved_photos)],
        ].map(([label, value]) => (
          <View key={label} style={{ flex: 1 }}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
          </View>
        ))}
      </View>
      {MapView && coords.length > 1 ? (
        <View style={styles.activityMap} pointerEvents="none">
          <MapView style={StyleSheet.absoluteFill} initialRegion={region} liteMode scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
            <Polyline coordinates={coords} strokeColor="#FFFFFF" strokeWidth={7} />
            <Polyline coordinates={coords} strokeColor={ACTIVITY_ORANGE} strokeWidth={4} />
            <Marker coordinate={coords[0]} pinColor="green" />
            <Marker coordinate={coords[coords.length - 1]} pinColor="black" />
          </MapView>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    name: { fontSize: 20, fontWeight: '800', color: c.text },
    code: { fontSize: 12, color: c.textMuted, marginTop: 3, fontWeight: '600' },
    progressHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
    big: { fontSize: 28, fontWeight: '800', color: c.text },
    bigLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    step: { alignItems: 'center', flex: 1, gap: 4 },
    stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    stepLabel: { fontSize: 11, fontWeight: '700', color: c.textSubtle },
    note: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    feedback: { backgroundColor: c.dangerSoft, borderRadius: 12, padding: 12 },
    feedbackTitle: { fontSize: 12, fontWeight: '800', color: c.danger },
    feedbackText: { fontSize: 13, color: c.text, marginTop: 4, lineHeight: 19 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { fontSize: 13, color: c.textMuted, flex: 1 },
    rowValue: { fontSize: 13, color: c.text, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
    body: { fontSize: 14, color: c.text, lineHeight: 20 },
    segments: { flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 12 },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    segmentActive: { backgroundColor: c.primary, borderColor: c.primary },
    segmentText: { fontSize: 13, fontWeight: '700', color: c.text },
    segmentTextActive: { color: c.onPrimary },
    riderIndex: { width: 24, fontSize: 13, fontWeight: '800', color: c.textSubtle },
    riderName: { fontSize: 14, fontWeight: '700', color: c.text },
    riderMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    riderStatus: { fontSize: 12, fontWeight: '800' },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photoCell: { width: '31.5%' },
    photo: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: c.surfaceAlt },
    photoCaption: { fontSize: 10, color: c.textMuted, marginTop: 3 },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    mapWrap: { height: 320, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    activitiesTitle: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 18, marginBottom: 10 },
    activity: { borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden', marginBottom: 14 },
    activityHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#C2410C', fontWeight: '800', fontSize: 16 },
    activityName: { fontSize: 15, fontWeight: '800', color: c.text },
    activityWhen: { fontSize: 12, color: c.textMuted, marginTop: 1 },
    inProgress: { fontSize: 11, fontWeight: '800', color: '#C2410C' },
    stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
    statLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text, marginTop: 2 },
    activityMap: { height: 200, borderTopWidth: 1, borderTopColor: c.border },
  });
