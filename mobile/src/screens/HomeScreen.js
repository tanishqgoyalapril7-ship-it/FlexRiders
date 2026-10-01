import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import CampaignMapView from '../components/CampaignMapView';
import { CampaignSheet, distanceLabel } from '../components/CampaignBits';
import { LOCATION_TEXT, isLive } from '../services/locationService';
import { assetUrl, mobileApi } from '../services/api';
import { formatINR } from '../utils';

const CARD_W = Math.min(Dimensions.get('window').width - 56, 360);
const HEADER_H = 96; // Header card height, so the map centres below it
const SHEET_H = 230; // "Recommended for you" panel

/** Home: a full-screen map of the campaigns that reach this rider (real targets, payouts and slots), shown
 * as price bubbles. Like a delivery app, the live location and greeting sit in the header card at the top;
 * the recommended campaigns (and any active campaign) sit in the panel at the bottom. */
export default function HomeScreen({ rider, campaigns, unreadCount, onNavigate, onOpenCampaign, deviceLocation, locationState, onRequestLocation }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [sheet, setSheet] = useState(null);
  const list = useRef(null);
  const nearby = campaigns ? campaigns.available || [] : [];
  const live = locationState === 'AVAILABLE' && isLive(deviceLocation);
  const myLocation = live ? { lat: deviceLocation.latitude, lng: deviceLocation.longitude } : null;
  const loc = LOCATION_TEXT[locationState] || LOCATION_TEXT.UNKNOWN;
  const active = campaigns && campaigns.active;
  const pending = campaigns && campaigns.pending_request;
  const firstName = (rider.name || '').split(' ')[0] || 'Rider';
  // "Sector 12, Gurugram" -> "Sector 12" over "Gurugram"
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
  } else if (!nearby.length) {
    notice = (
      <InfoCard
        icon="map-outline"
        title="No campaigns available near you"
        text={campaigns.location_message || 'New campaigns appear here as soon as they reach your area or working areas.'}
        action={(campaigns.working_areas || []).length ? null : 'Add working areas'}
        onAction={() => onNavigate('areas')}
      />
    );
  }

  return (
    <View style={s.screen}>
      <CampaignMapView
        campaigns={nearby}
        myLocation={myLocation}
        workingAreas={campaigns ? campaigns.working_areas || [] : []}
        fullBleed
        dark
        topInset={HEADER_H}
        bottomInset={SHEET_H + (active || pending ? 76 : 0)}
        selectedId={sheet ? sheet.id : null}
        onSelect={select}
      />

      <View style={s.header}>
        <View style={s.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello} numberOfLines={1}>Hi {firstName} 👋</Text>
            <TouchableOpacity
              style={s.locRow}
              onPress={live ? () => onNavigate('areas') : onRequestLocation}
              disabled={!live && !loc.action}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityLabel={live ? 'Your location. Change working areas' : loc.action || loc.text}
            >
              <Ionicons name={live ? 'location' : 'location-outline'} size={16} color={live ? colors.primary : colors.warning} />
              <Text style={[s.place, !live && { color: colors.warning }]} numberOfLines={1}>
                {live ? [place, placeSub].filter(Boolean).join(', ') : `${place}${placeSub ? ` · ${placeSub}` : ''}`}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              {live ? (
                <View style={s.livePill}>
                  <View style={[s.dot, { backgroundColor: colors.success }]} />
                  <Text style={s.liveText}>Live</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => onNavigate('notifications')} accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
            {unreadCount ? <View style={s.bellDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onNavigate('profile')} accessibilityLabel="Your profile">
            <Avatar rider={rider} initial={firstName.charAt(0).toUpperCase()} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.panel}>
        <View style={s.handle} />
        {active || pending ? (
          <TouchableOpacity style={s.activeCard} onPress={() => onOpenCampaign((active || pending).id)} activeOpacity={0.9}>
            <View style={[s.dot, { backgroundColor: active ? colors.success : colors.warning }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.activeLabel}>{active ? 'Your active campaign' : 'Request pending approval'}</Text>
              <Text style={s.activeName} numberOfLines={1}>{(active || pending).name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
        <View style={s.panelHead}>
          <View>
            <Text style={s.panelTitle}>Recommended for you</Text>
            {nearby.length ? <Text style={s.panelSub}>{nearby.length} campaign{nearby.length === 1 ? '' : 's'} near you right now</Text> : null}
          </View>
          {nearby.length ? (
            <TouchableOpacity onPress={() => onNavigate('campaigns')} hitSlop={10}>
              <Text style={s.detailsLink}>See all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {notice ? (
          notice
        ) : (
          <FlatList
            ref={list}
            data={nearby}
            horizontal
            keyExtractor={(c) => String(c.id)}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + 12}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12 }}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item: c }) => (
              <TouchableOpacity style={[s.card, { width: CARD_W }]} activeOpacity={0.9} onPress={() => onOpenCampaign(c.id)}>
                <View style={s.cardTop}>
                  <BrandTile campaign={c} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                    <View style={s.metaRow}>
                      <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                      <Text style={s.meta} numberOfLines={1}>{[c.location_area, distanceLabel(c.distance_km)].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </View>
                </View>
                <View style={s.cardBottom}>
                  <View>
                    <Text style={s.rate}>
                      {formatINR(c.daily_rate)}
                      <Text style={s.rateUnit}> /day</Text>
                    </Text>
                    <Text style={[s.slots, c.remaining_slots === 0 && { color: colors.warning }]}>
                      {c.remaining_slots === 0 ? 'All slots taken' : `${c.remaining_slots} slot${c.remaining_slots === 1 ? '' : 's'} left`}
                    </Text>
                  </View>
                  <View style={s.details}>
                    <Text style={s.detailsText}>View</Text>
                    <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      {sheet ? <CampaignSheet campaign={sheet} onClose={() => setSheet(null)} onOpen={onOpenCampaign} /> : null}
    </View>
  );
}

/** The rider's own registration selfie (private, loaded with their token); their initial until it loads or if missing. */
function Avatar({ rider, initial }) {
  const s = useStyles(makeStyles);
  const [failed, setFailed] = useState(false);
  if (rider.has_photo && !failed) {
    return <Image source={mobileApi.authedImage('/riders/me/selfie')} style={[s.avatar, s.avatarPhoto]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={s.avatar}>
      <Text style={s.avatarText}>{initial}</Text>
    </View>
  );
}

/** The campaign's banner, else the brand's logo, else its name on a coloured tile. */
function BrandTile({ campaign: c }) {
  const s = useStyles(makeStyles);
  const image = c.image_url || c.brand_logo;
  if (image) return <Image source={{ uri: assetUrl(image) }} style={s.tile} />;
  return (
    <View style={[s.tile, s.tileEmpty]}>
      <Text style={s.tileText}>{(c.brand_name || c.name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function InfoCard({ icon, title, text, action, onAction, tone = 'primary' }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={[s.infoIcon, { backgroundColor: tone === 'warning' ? colors.warningSoft : colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={colors[tone]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{title}</Text>
        {text ? <Text style={[s.meta, { lineHeight: 19 }]}>{text}</Text> : null}
        {action ? (
          <TouchableOpacity onPress={onAction} style={{ marginTop: 8 }}>
            <Text style={s.detailsLink}>{action}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 };

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#1d2433' },
    header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadow },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    place: { fontSize: 14, fontWeight: '600', color: c.textMuted, flexShrink: 1 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.successSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4 },
    liveText: { color: c.success, fontSize: 11, fontWeight: '800' },
    iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.surfaceAlt },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    avatarPhoto: { backgroundColor: c.surfaceAlt, borderWidth: 2, borderColor: c.primary },
    avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    hello: { fontSize: 22, fontWeight: '800', color: c.text },
    dot: { width: 7, height: 7, borderRadius: 4 },
    panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, gap: 14, ...shadow },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border },
    panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    panelTitle: { fontSize: 17, fontWeight: '800', color: c.text },
    panelSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    activeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.primarySoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
    activeLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    activeName: { fontSize: 15, fontWeight: '800', color: c.text, marginTop: 1 },
    card: { backgroundColor: c.surfaceAlt, borderRadius: 18, padding: 14, gap: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    tile: { width: 48, height: 48, borderRadius: 12, backgroundColor: c.border },
    tileEmpty: { backgroundColor: '#6D28D9', alignItems: 'center', justifyContent: 'center' },
    tileText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
    name: { fontSize: 16, fontWeight: '800', color: c.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    meta: { fontSize: 13, color: c.textMuted, flexShrink: 1 },
    rate: { fontSize: 22, fontWeight: '800', color: c.text },
    rateUnit: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    slots: { fontSize: 12, fontWeight: '700', color: c.success, marginTop: 2 },
    details: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    detailsText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    detailsLink: { color: c.primary, fontWeight: '800', fontSize: 14 },
    infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  });
