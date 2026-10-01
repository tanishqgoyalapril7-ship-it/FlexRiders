import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { useT } from '../i18n';
import CampaignMapView from '../components/CampaignMapView';
import { CampaignSheet, Countdown, distanceLabel } from '../components/CampaignBits';
import { Badge, Chip, Empty, Header, Segmented } from '../components/ds';
import { LOCATION_TEXT, isLive } from '../services/locationService';
import { formatDateRange, formatINR } from '../utils';

const FILTERS = [
  ['near', 'Near You'],
  ['soon', 'Opening Soon'],
  ['areas', 'My Areas'],
];
const applyFilter = (list, filter) =>
  filter === 'soon'
    ? list.filter((c) => c.opening_soon)
    : filter === 'areas'
      ? list.filter((c) => c.in_my_area)
      : [...list].sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));

const HISTORY_LABEL = { COMPLETED: ['Completed', 'success'], REMOVED: ['Removed', 'danger'], CANCELLED: ['Cancelled', 'neutral'], REJECTED: ['Not approved', 'danger'] };

function CampaignCard({ c, onOpen }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const soon = c.opening_soon;
  const accent = soon ? colors.warning : colors.primary;
  return (
    <TouchableOpacity style={s.card} onPress={() => onOpen(c.id)} activeOpacity={0.85}>
      <View style={[s.icon, { backgroundColor: soon ? colors.warningSoft : colors.primarySoft }]}>
        <Ionicons name={soon ? 'play-forward-outline' : 'ribbon-outline'} size={26} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.rowBetween}>
          <Text style={[s.brand, { color: accent }]} numberOfLines={1}>{(c.brand_name || '').toUpperCase()}</Text>
          {soon ? <Badge label="Opening Soon" tone="warning" /> : c.remaining_slots === 0 ? <Badge label="Full" tone="neutral" /> : <Badge label="Open" tone="success" />}
        </View>
        <Text style={s.name} numberOfLines={1}>{c.name}</Text>
        <Text style={s.meta} numberOfLines={1}>{[`#${c.code}`, c.location_area, distanceLabel(c.distance_km)].filter(Boolean).join(' • ')}</Text>
        <View style={[s.rowBetween, { marginTop: 8 }]}>
          <Text style={[s.rate, { color: soon ? colors.text : colors.primary }]}>{formatINR(c.daily_rate)}/day</Text>
          <Text style={s.slots}>{c.filled_slots}/{c.slot_capacity} slots filled</Text>
        </View>
        {soon ? <Countdown startsAt={c.starts_at} prefix="Opens in " style={s.countdown} /> : null}
        {c.in_my_area ? <Text style={s.area}>In your working area</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function CampaignsScreen({ data, onOpen, onBack, locationState, deviceLocation, onRequestLocation }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('near');
  const [sheet, setSheet] = useState(null);
  const [history, setHistory] = useState(false);
  const all = data ? data.available.filter((c) => !data.pending_request || c.id !== data.pending_request.id) : [];
  const list = applyFilter(all, filter);
  const live = locationState === 'AVAILABLE' && isLive(deviceLocation);
  const myLocation = live ? { lat: deviceLocation.latitude, lng: deviceLocation.longitude } : null;
  const loc = LOCATION_TEXT[locationState] || LOCATION_TEXT.UNKNOWN;
  const mine = data && (data.active || data.pending_request);

  const header = (
    <View style={{ paddingHorizontal: 20 }}>
      <Header
        title={t('Campaigns')}
        onBack={history ? () => setHistory(false) : onBack}
        right={
          data && data.history.length ? (
            <TouchableOpacity onPress={() => setHistory(!history)} hitSlop={8}>
              <Text style={s.link}>{history ? 'Available' : `History (${data.history.length})`}</Text>
            </TouchableOpacity>
          ) : null
        }
      />
      {!history ? (
        <>
          <Segmented options={[['map', t('Map View')], ['list', t('List View')]]} value={view} onChange={setView} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {FILTERS.map(([k, l]) => (
              <Chip key={k} label={t(l)} active={filter === k} solid onPress={() => setFilter(k)} />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  if (history) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
        {header}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {data.history.map((c, i) => {
            const [label, tone] = HISTORY_LABEL[c.my_status] || [c.my_status, 'neutral'];
            return (
              <TouchableOpacity key={`${c.id}-${i}`} style={s.card} onPress={() => onOpen(c.id)}>
                <View style={{ flex: 1 }}>
                  <View style={s.rowBetween}>
                    <Text style={s.brand}>{(c.brand_name || '').toUpperCase()}</Text>
                    <Badge label={label} tone={tone} />
                  </View>
                  <Text style={s.name}>{c.name}</Text>
                  <Text style={s.meta}>{formatDateRange(c.start_date, c.end_date)}{c.earned !== undefined ? ` · Earned ${formatINR(c.earned)}` : ''}</Text>
                  {c.rejection_reason ? <Text style={[s.meta, { color: colors.danger }]}>{c.rejection_reason}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  const notice = !data ? null : data.approval_message ? (
    <View style={[s.notice, { backgroundColor: colors.warningSoft }]}>
      <Ionicons name="time-outline" size={18} color={colors.warning} />
      <Text style={s.noticeText}>{data.approval_message}</Text>
    </View>
  ) : !live ? (
    <TouchableOpacity style={[s.notice, { backgroundColor: colors.warningSoft }]} onPress={onRequestLocation} disabled={!loc.action}>
      <Ionicons name="location-outline" size={18} color={colors.warning} />
      <Text style={s.noticeText}>
        {loc.text}.{loc.action ? ` Tap to ${loc.action.toLowerCase()}.` : ''}
        {(data.working_areas || []).length ? ' Showing campaigns in your working areas.' : ''}
      </Text>
    </TouchableOpacity>
  ) : null;

  const mineCard = mine ? (
    <TouchableOpacity style={[s.card, { borderColor: data.active ? colors.success : colors.warning }]} onPress={() => onOpen(mine.id)}>
      <View style={{ flex: 1 }}>
        <View style={s.rowBetween}>
          <Text style={s.brand}>{data.active ? 'MY ACTIVE CAMPAIGN' : 'MY REQUEST'}</Text>
          <Badge label={data.active ? 'Active' : 'Reserved'} tone={data.active ? 'success' : 'warning'} />
        </View>
        <Text style={s.name}>{mine.name}</Text>
        <Text style={s.meta}>{mine.brand_name} · {formatINR(mine.daily_rate)}/day</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  ) : null;

  if (view === 'map') {
    return (
      <View style={s.screen}>
        {header}
        <View style={{ flex: 1, marginTop: 12 }}>
          <CampaignMapView campaigns={list} myLocation={myLocation} workingAreas={data ? data.working_areas || [] : []} fullBleed dark selectedId={sheet ? sheet.id : null} onSelect={setSheet} />
          {notice ? <View style={{ position: 'absolute', top: 12, left: 16, right: 16 }}>{notice}</View> : null}
          {data && !list.length ? (
            <View style={s.mapEmpty}>
              <Text style={s.mapEmptyText}>{data.approval_message ? 'Campaigns unlock once your profile is approved.' : 'No campaigns available near you.'}</Text>
            </View>
          ) : null}
        </View>
        {sheet ? <CampaignSheet campaign={sheet} onClose={() => setSheet(null)} onOpen={onOpen} /> : null}
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      {header}
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {notice}
        {mineCard}
        {!data ? (
          <Empty icon="cloud-download-outline" title="Loading campaigns…" />
        ) : data.approval_message ? null : !list.length ? (
          <Empty
            icon="megaphone-outline"
            title={filter === 'soon' ? 'Nothing opening soon' : filter === 'areas' ? 'No campaigns in your areas' : 'No campaigns available near you'}
            text={filter === 'areas' && !(data.working_areas || []).length ? 'Add working areas in You to see campaigns there first.' : 'New campaigns appear here as soon as they reach your area.'}
          />
        ) : (
          list.map((c) => <CampaignCard key={c.id} c={c} onOpen={onOpen} />)
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    title: { fontSize: 28, fontWeight: '800', color: c.text },
    link: { color: c.primary, fontWeight: '700', fontSize: 15 },
    chips: { gap: 10, paddingVertical: 16 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    card: { flexDirection: 'row', gap: 16, backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 18 },
    icon: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    brand: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, color: c.textMuted, flex: 1 },
    name: { fontSize: 18, fontWeight: '800', color: c.text, marginTop: 3 },
    meta: { fontSize: 14, color: c.textMuted, marginTop: 3 },
    rate: { fontSize: 18, fontWeight: '800' },
    slots: { fontSize: 13, color: c.textMuted },
    countdown: { fontSize: 12, fontWeight: '800', color: c.warning, marginTop: 6, fontVariant: ['tabular-nums'] },
    area: { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 4 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
    noticeText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },
    mapEmpty: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: 'rgba(17,24,39,0.9)', borderRadius: 16, padding: 14 },
    mapEmptyText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700' },
  });
