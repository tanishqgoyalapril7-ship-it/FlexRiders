import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import CampaignMapView from '../components/CampaignMapView';
import { CampaignSheet, distanceLabel } from '../components/CampaignBits';
import { LOCATION_TEXT, isLive } from '../services/locationService';
import { assetUrl } from '../services/api';
import { brandColor, formatINR, tint } from '../utils';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.68, 270);
const MAP_H = Math.round(Math.min(Math.max(SCREEN_H * 0.5, 380), 480));
const HEADER_H = 96; // Header card over the top of the map, so the map centres below it
const CHIPS_H = 56; // Filter chips over the bottom of the map

const greeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 17) return 'Good Afternoon';
  if (h >= 17 && h < 21) return 'Good Evening';
  return 'Good Night';
};

// Map / list filters, from each campaign card's real data.
const FILTERS = [
  { key: 'near', label: 'Near You', icon: 'navigate', test: () => true },
  { key: 'soon', label: 'Opening Soon', icon: 'time', test: (c) => c.opening_soon },
  { key: 'areas', label: 'My Areas', icon: 'home', test: (c) => c.in_my_area },
];

const clock = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Home: the map of the campaigns that reach this rider (real targets, payouts and slots, as labelled
 * bubbles) with the greeting and live location on top, filters, recommended campaigns, the rider's active
 * campaign and today's photo slots. No earnings or streak summary here (those live under Earnings). */
export default function HomeScreen({ rider, campaigns, unreadCount, onNavigate, onOpenCampaign, deviceLocation, locationState, onRequestLocation }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [sheet, setSheet] = useState(null);
  const [filter, setFilter] = useState('near');
  const list = useRef(null);
  const all = campaigns ? campaigns.available || [] : [];
  const test = FILTERS.find((f) => f.key === filter).test;
  const nearby = all.filter(test);
  const live = locationState === 'AVAILABLE' && isLive(deviceLocation);
  const myLocation = live ? { lat: deviceLocation.latitude, lng: deviceLocation.longitude } : null;
  const loc = LOCATION_TEXT[locationState] || LOCATION_TEXT.UNKNOWN;
  const active = campaigns && campaigns.active;
  const pending = campaigns && campaigns.pending_request;
  const firstName = (rider.name || '').split(' ')[0] || 'Rider';
  const [place, ...rest] = (live ? deviceLocation.label || 'Current location' : loc.text).split(', ');
  const placeSub = live ? rest.join(', ') : loc.action || '';

  const select = (c) => {
    setSheet(c);
    const i = nearby.findIndex((x) => x.id === c.id);
    if (i >= 0 && list.current) list.current.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
  };

  let notice = null;
  if (!campaigns) {
    notice = <InfoCard icon="cloud-download-outline" title="Loading campaigns…" />;
  } else if (campaigns.approval_message) {
    notice = <InfoCard icon="time-outline" tone="warning" title="Profile under review" text={campaigns.approval_message} action="Verification status" onAction={() => onNavigate('verification')} />;
  } else if (!all.length) {
    notice = (
      <InfoCard
        icon="map-outline"
        title="No campaigns available near you"
        text={campaigns.location_message || 'New campaigns appear here as soon as they reach your area or working areas.'}
        action={(campaigns.working_areas || []).length ? null : 'Add working areas'}
        onAction={() => onNavigate('areas')}
      />
    );
  } else if (!nearby.length) {
    notice = (
      <InfoCard
        icon="filter-outline"
        title={filter === 'soon' ? 'Nothing opening soon' : 'No campaigns in your working areas'}
        text={filter === 'soon' ? 'Campaigns starting within the next few hours show here.' : 'Campaigns that match a working area show here.'}
        action="Show all near you"
        onAction={() => setFilter('near')}
      />
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: MAP_H }}>
          <CampaignMapView
            campaigns={nearby}
            myLocation={myLocation}
            workingAreas={campaigns ? campaigns.working_areas || [] : []}
            fullBleed
            dark
            topInset={HEADER_H}
            bottomInset={CHIPS_H}
            selectedId={sheet ? sheet.id : null}
            onSelect={select}
          />

          {/* Header card: greeting and live location, bell in the corner. */}
          <View style={s.header} pointerEvents="box-none">
            <View style={s.headRow} pointerEvents="box-none">
              <View style={{ flex: 1 }} pointerEvents="box-none">
                <Text style={s.hello} numberOfLines={1}>
                  {greeting()}, {firstName} 👋
                </Text>
                <TouchableOpacity
                  style={s.locRow}
                  onPress={live ? () => onNavigate('areas') : onRequestLocation}
                  disabled={!live && !loc.action}
                  activeOpacity={0.7}
                  hitSlop={8}
                  accessibilityLabel={live ? 'Your location. Change working areas' : loc.action || loc.text}
                >
                  <Ionicons name={live ? 'location' : 'location-outline'} size={16} color={live ? colors.primary : colors.warning} />
                  <Text style={[s.place, !live && { color: colors.warning, fontWeight: '700' }]} numberOfLines={1}>
                    {live ? [place, placeSub].filter(Boolean).join(', ') : `${place}${placeSub ? ` · ${placeSub}` : ''}`}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  {live ? <View style={[s.dot, s.liveDot]} /> : null}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.bell} onPress={() => onNavigate('notifications')} hitSlop={10} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
                <Ionicons name="notifications-outline" size={21} color={colors.text} />
                {unreadCount ? <View style={s.bellDot} /> : null}
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.chips} pointerEvents="box-none">
            {FILTERS.map((f) => {
              const on = f.key === filter;
              return (
                <TouchableOpacity key={f.key} style={[s.chip, on && s.chipOn]} onPress={() => setFilter(f.key)} activeOpacity={0.85} accessibilityState={{ selected: on }}>
                  <Ionicons name={f.icon} size={13} color={on ? '#FFFFFF' : colors.primary} />
                  <Text style={[s.chipText, on && s.chipTextOn]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.body}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Recommended for you</Text>
            {nearby.length ? (
              <TouchableOpacity onPress={() => onNavigate('campaigns')} hitSlop={10}>
                <Text style={s.link}>See all</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {notice || (
            <FlatList
              ref={list}
              data={nearby.slice(0, 5)}
              horizontal
              keyExtractor={(c) => String(c.id)}
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_W + 12}
              decelerationRate="fast"
              contentContainerStyle={{ gap: 12, paddingRight: 4 }}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item: c }) => <RecommendedCard campaign={c} onOpen={() => onOpenCampaign(c.id)} />}
            />
          )}

          {active || pending ? (
            <>
              <View style={s.sectionHead}>
                <View>
                  <Text style={s.sectionTitle}>{active ? 'Active Campaign' : 'Join Request'}</Text>
                  <Text style={s.sectionSub}>{active ? 'You have 1 ongoing campaign' : 'Waiting for FlexRiders approval'}</Text>
                </View>
              </View>
              <ActiveCard campaign={active || pending} pending={!active} onOpen={() => onOpenCampaign((active || pending).id)} />
            </>
          ) : null}

          <PhotoSlots
            active={active}
            pending={pending}
            sample={nearby[0] || all[0]}
            onUpload={() => active && onOpenCampaign(active.id)}
            onBrowse={() => onNavigate('campaigns')}
          />
        </View>
      </ScrollView>
      {sheet ? <CampaignSheet campaign={sheet} onClose={() => setSheet(null)} onOpen={onOpenCampaign} /> : null}
    </View>
  );
}

/** Compact campaign tile: small logo, name, distance and slots, and the pay per day. */
function RecommendedCard({ campaign: c, onOpen }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const full = c.remaining_slots === 0;
  const meta = [c.distance_km != null ? distanceLabel(c.distance_km).replace(' away', '') : c.location_area, full ? 'Full' : `${c.remaining_slots} slot${c.remaining_slots === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <TouchableOpacity
      style={[s.card, { width: CARD_W, backgroundColor: tint(brandColor(c), 0.08), borderColor: tint(brandColor(c), 0.28) }]}
      activeOpacity={0.9}
      onPress={onOpen}
      accessibilityLabel={`${c.name}, ${meta}, ${formatINR(c.daily_rate)} per day`}>
      <BrandTile campaign={c} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.recName} numberOfLines={1}>{c.name}</Text>
        <Text style={[s.recMeta, full && { color: colors.warning }]} numberOfLines={1}>{meta}</Text>
      </View>
      <Text style={[s.recRate, { color: brandColor(c) }]}>
        {formatINR(c.daily_rate)}
        <Text style={s.recUnit}>/day</Text>
      </Text>
    </TouchableOpacity>
  );
}

/** The rider's active campaign (or pending join request): name, area and day progress. */
function ActiveCard({ campaign: c, pending, onOpen }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const p = c.progress || {};
  const total = p.total_campaign_days || 0;
  const done = p.completed_days || 0;
  return (
    <TouchableOpacity style={[s.activeCard, { backgroundColor: tint(brandColor(c), 0.1), borderColor: tint(brandColor(c), 0.3) }]} onPress={onOpen} activeOpacity={0.9}>
      {/* Soft brand-colour glows: a light gradient look without an extra library. */}
      <View style={[s.glow, { backgroundColor: tint(brandColor(c), 0.18), top: -60, right: -40 }]} pointerEvents="none" />
      <View style={[s.glow, { backgroundColor: tint(brandColor(c), 0.1), bottom: -80, left: -30 }]} pointerEvents="none" />
      <View style={s.activeTop}>
        <BrandTile campaign={c} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName} numberOfLines={1}>{c.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{[c.brand_name, c.location_area].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={[s.statusPill, pending && { backgroundColor: colors.warningSoft }]}>
          <View style={[s.dot, { backgroundColor: pending ? colors.warning : colors.success }]} />
          <Text style={[s.statusText, pending && { color: colors.warning }]}>{pending ? 'Pending' : 'Active'}</Text>
        </View>
      </View>
      {!pending && total ? (
        <>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { backgroundColor: brandColor(c), width: `${Math.min(100, Math.round((done / total) * 100))}%` }]} />
          </View>
          <Text style={s.meta}>
            {done} of {total} days completed · {formatINR(c.daily_rate)} / day
          </Text>
        </>
      ) : null}
    </TouchableOpacity>
  );
}

const SLOT_ORDER = [
  ['MORNING', 'Morning'],
  ['EVENING', 'Evening'],
  ['NIGHT', 'Night'],
];

/** Today's Morning / Evening / Night photo slots. During an active campaign day: one small box per slot
 * with its real status and Upload. Otherwise just a light strip of the slot times (from the rider's campaign,
 * or a campaign near them) so the page stays calm. */
function PhotoSlots({ active, pending, sample, onUpload, onBrowse }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const today = active && active.progress && active.progress.today_photos;
  const liveSlots = today && today.in_window && (today.slots || []).length ? today.slots : null;

  if (!liveSlots) {
    const source = active || pending || sample;
    const windows = source && source.photo_slot_windows;
    if (!windows) return null;
    const note = active ? 'Uploads open on campaign days' : pending ? 'Uploads open once approved' : 'Join a campaign to start uploading';
    return (
      <>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Photo Slots</Text>
          {!active && !pending ? (
            <TouchableOpacity onPress={onBrowse} hitSlop={10}>
              <Text style={s.link}>Find campaigns</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.slotStrip}>
          {SLOT_ORDER.filter(([k]) => windows[k]).map(([k, label]) => (
            <View key={k} style={s.slotPill}>
              <Text style={s.slotPillLabel}>{label}</Text>
              <Text style={s.slotPillTime}>
                {clock(windows[k][0])} – {clock(windows[k][1])}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[s.sectionSub, { marginTop: 8 }]}>{note}</Text>
      </>
    );
  }

  const left = liveSlots.filter((x) => x.status === 'NOT_STARTED' || x.status === 'REJECTED').length;
  const STATE = {
    APPROVED: { icon: 'checkmark-circle', color: colors.success, text: 'Approved' },
    PENDING: { icon: 'time', color: colors.warning, text: 'In review' },
    REJECTED: { icon: 'refresh-circle', color: colors.danger, text: 'Re-upload' },
  };
  return (
    <>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Today's Photo Slots</Text>
        <Text style={[s.sectionSub, left ? { color: colors.primary, fontWeight: '700' } : null]}>{left ? `${left} upload${left === 1 ? '' : 's'} left` : 'All uploaded'}</Text>
      </View>
      <View style={s.slots}>
        {liveSlots.map((slot) => {
          const st = STATE[slot.status];
          const open = slot.status === 'NOT_STARTED' || slot.status === 'REJECTED';
          return (
            <View key={slot.slot} style={s.slot}>
              <Text style={s.slotLabel}>{slot.label}</Text>
              <Text style={s.slotTime}>
                {clock(slot.window.start)} – {clock(slot.window.end)}
              </Text>
              {open ? (
                <TouchableOpacity style={s.uploadBtn} onPress={onUpload} activeOpacity={0.85}>
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                  <Text style={s.uploadText}>{slot.status === 'REJECTED' ? 'Re-upload' : 'Upload'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.slotDone}>
                  <Ionicons name={st ? st.icon : 'ellipse-outline'} size={16} color={st ? st.color : colors.textMuted} />
                  <Text style={[s.slotState, { color: st ? st.color : colors.textMuted }]}>{st ? st.text : ''}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

/** The campaign's banner, else the brand's logo, else its first letter on a coloured tile. */
function BrandTile({ campaign: c }) {
  const s = useStyles(makeStyles);
  const image = c.image_url || c.brand_logo;
  if (image) return <Image source={{ uri: assetUrl(image) }} style={s.tileSmall} />;
  return (
    <View style={[s.tileSmall, s.tileEmpty, { backgroundColor: brandColor(c) }]}>
      <Text style={s.tileText}>{(c.brand_name || c.name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function InfoCard({ icon, title, text, action, onAction, tone = 'primary' }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={s.info}>
      <View style={[s.infoIcon, { backgroundColor: tone === 'warning' ? colors.warningSoft : colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={colors[tone]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardName}>{title}</Text>
        {text ? <Text style={[s.meta, { lineHeight: 19, marginTop: 3 }]}>{text}</Text> : null}
        {action ? (
          <TouchableOpacity onPress={onAction} style={{ marginTop: 8 }}>
            <Text style={s.link}>{action}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    // Header card over the top of the map: rounded bottom corners and a soft shadow.
    header: {
      position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
      borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hello: { fontSize: 22, fontWeight: '800', color: c.text },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start', maxWidth: '100%' },
    place: { fontSize: 14, fontWeight: '600', color: c.textMuted, flexShrink: 1 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    liveDot: { backgroundColor: c.success, marginLeft: 4 },
    bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    bellDot: { position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.surfaceAlt },
    chips: { position: 'absolute', left: 0, right: 0, bottom: 30, flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    chipOn: { backgroundColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
    chipTextOn: { color: '#FFFFFF' },
    body: { marginTop: -18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c.background, paddingHorizontal: 20, paddingTop: 8 },
    sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    sectionSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    link: { color: c.primary, fontWeight: '800', fontSize: 13 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 9, paddingHorizontal: 10 },
    tileSmall: { width: 42, height: 42, borderRadius: 11, backgroundColor: c.surfaceAlt },
    tileEmpty: { alignItems: 'center', justifyContent: 'center' },
    tileText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    recName: { fontSize: 13.5, fontWeight: '800', color: c.text },
    recMeta: { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    recRate: { fontSize: 14, fontWeight: '800', color: c.primary },
    recUnit: { fontSize: 10.5, fontWeight: '600', color: c.textMuted },
    cardName: { fontSize: 15, fontWeight: '800', color: c.text },
    meta: { fontSize: 12.5, color: c.textMuted, flexShrink: 1 },
    activeCard: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10, overflow: 'hidden' },
    glow: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
    activeTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    statusText: { fontSize: 11, fontWeight: '800', color: c.success },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
    slots: { flexDirection: 'row', gap: 10 },
    slot: { flex: 1, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 3 },
    slotLabel: { fontSize: 13, fontWeight: '800', color: c.text },
    slotTime: { fontSize: 11, color: c.textMuted, textAlign: 'center' },
    uploadBtn: { alignSelf: 'stretch', flexDirection: 'row', gap: 5, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    uploadText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
    slotDone: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, marginTop: 2 },
    slotState: { fontSize: 12, fontWeight: '700' },
    slotStrip: { flexDirection: 'row', gap: 8 },
    slotPill: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center' },
    slotPillLabel: { fontSize: 12.5, fontWeight: '800', color: c.text },
    slotPillTime: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    info: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14 },
    infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  });
