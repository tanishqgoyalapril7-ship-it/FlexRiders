import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../../theme';
import { ProgressBar } from '../../components/ui';
import { formatDateRange } from '../../utils';
import { assetUrl } from '../../services/api';

// The lifecycle as brands see it (brand_status from the server).
export const BRAND_STATUS = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: 'document-outline' },
  REQUESTED: { label: 'Pending Admin Review', tone: 'warning', icon: 'time-outline' },
  CHANGES_REQUESTED: { label: 'Changes Requested', tone: 'danger', icon: 'create-outline' },
  APPROVED: { label: 'Approved', tone: 'primary', icon: 'checkmark-circle-outline' },
  LIVE: { label: 'Live', tone: 'success', icon: 'radio-outline' },
  PAUSED: { label: 'Paused', tone: 'warning', icon: 'pause-circle-outline' },
  COMPLETED: { label: 'Completed', tone: 'neutral', icon: 'flag-outline' },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: 'close-circle-outline' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' },
};

const toneOf = (colors, tone) =>
  ({
    success: [colors.success, colors.successSoft],
    warning: [colors.warning, colors.warningSoft],
    danger: [colors.danger, colors.dangerSoft],
    primary: [colors.primary, colors.primarySoft],
    neutral: [colors.textMuted, colors.surfaceAlt],
  })[tone];

export function BrandStatusPill({ status }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const s = BRAND_STATUS[status] || { label: status, tone: 'neutral', icon: 'ellipse-outline' };
  const [fg, bg] = toneOf(colors, s.tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {status === 'LIVE' ? <View style={[styles.dot, { backgroundColor: fg }]} /> : <Ionicons name={s.icon} size={12} color={fg} />}
      <Text style={[styles.pillText, { color: fg }]}>{s.label}</Text>
    </View>
  );
}

/** A brand's campaign card: banner, real ID, status, area, period and joined/required riders with progress. */
export function BrandCampaignCard({ campaign: c, onOpen }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const required = c.required_riders || 0;
  const pct = required ? Math.min(100, Math.round((c.joined_riders / required) * 100)) : 0;
  const live = c.brand_status === 'LIVE';
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onOpen(c.id)}>
      <View style={styles.row}>
        {c.image_url ? (
          <Image source={{ uri: assetUrl(c.image_url) }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="megaphone" size={30} color={colors.primary} />
          </View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.top}>
            <Text style={styles.name} numberOfLines={2}>{c.name}</Text>
            <BrandStatusPill status={c.brand_status} />
          </View>
          <Text style={styles.code}>{c.campaign_code}</Text>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>{c.location_area || 'Area not set'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{formatDateRange(c.start_date, c.end_date)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.progressRow}>
        <Ionicons name="people-outline" size={16} color={colors.text} />
        <Text style={styles.progressText}>
          {c.joined_riders} / {required} riders joined
        </Text>
        <View style={{ flex: 1 }} />
        <View style={styles.statsBtn}>
          <Ionicons name="stats-chart" size={16} color={colors.primary} />
        </View>
      </View>
      <View style={styles.barRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={c.joined_riders} max={required || 1} color={live ? colors.primary : colors.textSubtle} />
        </View>
        <Text style={styles.pct}>{pct}%</Text>
        <Text style={styles.link}>View Details</Text>
      </View>
      {c.brand_status === 'CHANGES_REQUESTED' && c.admin_feedback ? (
        <Text style={styles.feedback} numberOfLines={2}>FlexRiders: {c.admin_feedback}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 11, fontWeight: '800' },
    card: { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 14, gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
    row: { flexDirection: 'row', gap: 12 },
    thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: c.surfaceAlt },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    name: { flex: 1, fontSize: 16, fontWeight: '800', color: c.text },
    code: { fontSize: 12, color: c.primary, fontWeight: '800' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 13, color: c.textMuted, flex: 1 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    progressText: { fontSize: 13, color: c.text, fontWeight: '700' },
    statsBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pct: { fontSize: 12, color: c.textMuted, fontWeight: '700', minWidth: 32, textAlign: 'right' },
    link: { fontSize: 13, color: c.primary, fontWeight: '800' },
    feedback: { fontSize: 12, color: c.danger, backgroundColor: c.dangerSoft, borderRadius: 10, padding: 8 },
  });
