import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { formatDateRange, formatINR } from '../utils';
import { BrandAvatar, PrimaryButton } from './ui';

export const distanceLabel = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`);

const pad = (n) => String(n).padStart(2, '0');

/** Live countdown to the campaign's real start time (server `starts_at`). */
export function Countdown({ startsAt, style, prefix = '' }) {
  const target = startsAt ? Date.parse(startsAt) : NaN;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (Number.isNaN(target)) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (Number.isNaN(target)) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(left / 86400);
  const text = `${days ? `${days}d ` : ''}${pad(Math.floor((left % 86400) / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return <Text style={style}>{left > 0 ? `${prefix}${text}` : 'Starting now'}</Text>;
}

export function startLabel(campaign) {
  if (!campaign.starts_at) return null;
  const d = new Date(campaign.starts_at);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Starts in 2 days 14 hours", from the real start time. */
export function startsInWords(startsAt) {
  const secs = Math.floor((Date.parse(startsAt) - Date.now()) / 1000);
  if (!(secs > 0)) return null;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d ? `${d} day${d === 1 ? '' : 's'} ${h} hour${h === 1 ? '' : 's'}` : h ? `${h} hour${h === 1 ? '' : 's'} ${m} min` : `${m} min`;
}

/** Bottom sheet for a campaign tapped on the map. */
export function CampaignSheet({ campaign, onClose, onOpen }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  if (!campaign) return null;
  const starts = campaign.opening_soon ? startsInWords(campaign.starts_at) : null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View style={styles.logo}>
            <Ionicons name="ribbon-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.brand}>{(campaign.brand_name || '').toUpperCase()}</Text>
            <Text style={styles.name} numberOfLines={2}>{campaign.name}</Text>
            <Text style={styles.sub} numberOfLines={1}>{[campaign.code && `#${campaign.code}`, campaign.location_area].filter(Boolean).join(' • ')}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.stats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>EARNINGS</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{formatINR(campaign.daily_rate)} / day</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>DISTANCE</Text>
            <Text style={styles.statValue}>{distanceLabel(campaign.distance_km) || '—'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>SLOTS</Text>
            <Text style={styles.statValue}>{campaign.filled_slots} / {campaign.slot_capacity} filled</Text>
          </View>
        </View>
        {starts ? (
          <View style={styles.starts}>
            <Ionicons name="time-outline" size={20} color={colors.warning} />
            <Text style={styles.startsText}>Starts in {starts}</Text>
          </View>
        ) : null}
        {campaign.in_my_area ? (
          <View style={styles.areaChip}>
            <Ionicons name="home-outline" size={14} color={colors.primary} />
            <Text style={styles.areaText}>In your working area: {campaign.my_area_label}</Text>
          </View>
        ) : null}
        <PrimaryButton label="View Details & Apply" onPress={() => { onClose(); onOpen(campaign.id); }} style={{ marginTop: 16, borderRadius: 28, paddingVertical: 17 }} />
      </View>
    </Modal>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    head: { flexDirection: 'row', alignItems: 'center' },
    logo: { width: 60, height: 60, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    sub: { fontSize: 14, color: c.textMuted, marginTop: 3 },
    divider: { height: 1, backgroundColor: c.border, marginTop: 18 },
    starts: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.warningSoft, borderRadius: 16, padding: 16, marginTop: 4 },
    startsText: { color: c.warning, fontSize: 16, fontWeight: '800' },
    brand: { fontSize: 13, color: c.textMuted, fontWeight: '800', letterSpacing: 0.3 },
    name: { fontSize: 18, fontWeight: '800', color: c.text, marginTop: 2 },
    status: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    statusText: { fontSize: 11, fontWeight: '800' },
    stats: { flexDirection: 'row', gap: 10, marginVertical: 18 },
    stat: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 12 },
    statValue: { fontSize: 16, fontWeight: '800', color: c.text, marginTop: 4 },
    statLabel: { fontSize: 12, color: c.textMuted, fontWeight: '700', letterSpacing: 0.4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
    rowLabel: { fontSize: 13, color: c.textMuted, width: 100 },
    rowValue: { flex: 1, fontSize: 13, color: c.text, fontWeight: '600', textAlign: 'right' },
    areaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: c.primarySoft, borderRadius: 10, padding: 10 },
    areaText: { fontSize: 12, color: c.primary, fontWeight: '600', flex: 1 },
  });
