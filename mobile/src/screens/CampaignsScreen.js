import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, FilterPills, OutlineButton, PrimaryButton, ProgressBar, ScreenHeader, SectionHeader, StatusBadge } from '../components/ui';
import { formatDateRange, formatINR } from '../utils';
import { useJoinCampaign } from '../components/KitPickup';

const SECTIONS = ['Available', 'My Campaign', 'History'];

// Card for a campaign the rider can browse and join.
export function AvailableCampaignCard({ campaign, onOpen, onChanged }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const full = campaign.remaining_slots === 0;

  const { start: join, joining, sheet } = useJoinCampaign(campaign, onChanged);

  return (
    <Card style={styles.campaignCard}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.campaignName}>{campaign.name}</Text>
          <Text style={styles.brand}>{campaign.brand_name}</Text>
        </View>
        <StatusBadge status={campaign.my_status || (campaign.lifecycle && campaign.lifecycle.key) || campaign.status} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <Text style={styles.metaText}>{formatDateRange(campaign.start_date, campaign.end_date)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="cash-outline" size={14} color={colors.success} />
          <Text style={[styles.metaText, { color: colors.success, fontWeight: '700' }]}>{formatINR(campaign.daily_rate)} / eligible day</Text>
        </View>
        {campaign.location_area ? (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{campaign.location_area}</Text>
          </View>
        ) : null}
        {campaign.eligible_vehicle_label && campaign.eligible_vehicle_label !== 'All vehicles' ? (
          <View style={styles.metaItem}>
            <Ionicons name="bicycle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{campaign.eligible_vehicle_label} only</Text>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 6, marginTop: 12 }}>
        <View style={styles.slotRow}>
          <Text style={styles.slotText}>
            {campaign.filled_slots} / {campaign.slot_capacity || campaign.total_slots} riders assigned
          </Text>
          <Text style={[styles.slotText, { color: full ? colors.warning : colors.primary, fontWeight: '700' }]}>
            {full ? 'Full' : `${campaign.remaining_slots} slots left`}
          </Text>
        </View>
        <ProgressBar value={campaign.filled_slots} max={campaign.slot_capacity || campaign.total_slots} color={full ? colors.warning : colors.primary} />
      </View>

      {campaign.rules.length ? (
        <View style={styles.rules}>
          {campaign.rules.slice(0, 2).map((rule) => (
            <View key={rule} style={styles.ruleRow}>
              <Ionicons name="checkmark-circle-outline" size={15} color={colors.textMuted} />
              <Text style={styles.ruleText} numberOfLines={2}>{rule}</Text>
            </View>
          ))}
          {campaign.rules.length > 2 ? <Text style={styles.moreRules}>+{campaign.rules.length - 2} more requirements</Text> : null}
        </View>
      ) : null}

      {!campaign.can_join && campaign.join_blocked_reason ? (
        <View style={styles.blocked}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.blockedText}>{campaign.join_blocked_reason}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <OutlineButton label="View Campaign" onPress={() => onOpen(campaign.id)} style={{ flex: 1, paddingVertical: 12 }} />
        {campaign.can_join ? (
          <PrimaryButton label="Join Campaign" onPress={join} loading={joining} style={{ flex: 1, paddingVertical: 12 }} />
        ) : null}
      </View>
      {sheet}
    </Card>
  );
}

// Compact card for the rider's current campaign, reused on the Home screen.
export function ActiveCampaignCard({ campaign, onOpen }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const p = campaign.progress;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen(campaign.id)}>
      <Card style={[styles.campaignCard, { borderColor: colors.primary }]}>
        <View style={styles.cardTop}>
          <View style={styles.activeIcon}>
            <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.campaignName} numberOfLines={1}>{campaign.name}</Text>
            <Text style={styles.brand}>
              {campaign.brand_name} · {formatINR(campaign.daily_rate)}/day
            </Text>
          </View>
          <StatusBadge status={campaign.my_status} />
        </View>
        <View style={styles.statsRow}>
          {[
            ['Today', p.today_photos && p.today_photos.in_window ? `${Math.min(p.today_photos.valid, p.photos_required)}/${p.photos_required}` : '—'],
            ['Streak', `${p.current_streak}d`],
            ['Photo-days', `${p.completed_days}/${p.target_days}`],
            ['Earned', formatINR(p.earned)],
          ].map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {p.can_submit_today ? (
          <View style={styles.dueRow}>
            <Ionicons name="camera-outline" size={16} color={colors.primary} />
            <Text style={styles.dueText}>
              Upload today's {p.photos_required} photos to earn {formatINR(campaign.daily_rate)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </View>
        ) : null}
      </Card>
    </TouchableOpacity>
  );
}

export default function CampaignsScreen({ data, onOpen, onChanged }) {
  const styles = useStyles(makeStyles);
  const [section, setSection] = useState(data && data.active ? 'My Campaign' : 'Available');
  // The campaign the rider already asked to join is shown under "Awaiting Approval" instead.
  const available = data ? data.available.filter((c) => !data.pending_request || c.id !== data.pending_request.id) : [];
  const history = data ? data.history : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Campaigns" />
      <FilterPills options={SECTIONS} value={section} onChange={setSection} />

      {!data ? (
        <View style={{ marginTop: 16 }}>
          <EmptyState icon="megaphone-outline" title="Loading campaigns" message="Fetching the latest campaigns for you." />
        </View>
      ) : null}

      {data && section === 'Available' && (
        <>
          {data.active ? (
            <View style={[styles.notice, { marginTop: 16 }]}>
              <Text style={styles.noticeText}>You're currently participating in another campaign. You can browse campaigns, but you can join a new one after it ends.</Text>
            </View>
          ) : null}
          {data.pending_request ? (
            <>
              <SectionHeader title="Awaiting Approval" />
              <PendingRequestCard campaign={data.pending_request} onOpen={onOpen} onChanged={onChanged} />
            </>
          ) : null}
          <SectionHeader title={`Available Campaigns (${available.length})`} />
          {available.length === 0 ? (
            <EmptyState icon="megaphone-outline" title="No campaigns right now" message="New campaigns will appear here as soon as they're published." />
          ) : (
            <View style={{ gap: 14 }}>
              {available.map((c) => (
                <AvailableCampaignCard key={c.id} campaign={c} onOpen={onOpen} onChanged={onChanged} />
              ))}
            </View>
          )}
        </>
      )}

      {data && section === 'My Campaign' && (
        <>
          <SectionHeader title="My Active Campaign" />
          {data.active ? (
            <ActiveCampaignCard campaign={data.active} onOpen={onOpen} />
          ) : (
            <EmptyState icon="flag-outline" title="No active campaign" message="Join an available campaign to start earning a daily payout." />
          )}
        </>
      )}

      {data && section === 'History' && (
        <>
          <SectionHeader title="Campaign History" />
          {history.length === 0 ? (
            <EmptyState icon="time-outline" title="No history yet" message="Campaigns you've completed or left will appear here." />
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {history.map((c, i) => (
                <TouchableOpacity
                  key={`${c.id}-${c.my_status}-${i}`}
                  style={[styles.historyRow, i === history.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => onOpen(c.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyName}>{c.name}</Text>
                    <Text style={styles.brand}>
                      {c.brand_name} · {formatDateRange(c.start_date, c.end_date)}
                    </Text>
                    {c.rejection_reason ? <Text style={styles.historyReason}>{c.rejection_reason}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatusBadge status={c.my_status} />
                    {c.earned !== undefined ? <Text style={styles.historyEarned}>{formatINR(c.earned)}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function PendingRequestCard({ campaign, onOpen, onChanged }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const withdraw = () =>
    Alert.alert('Withdraw request?', `Withdraw your request to join ${campaign.name}?`, [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          try {
            await mobileApi.withdrawCampaignRequest(campaign.id);
            await onChanged();
          } catch (err) {
            Alert.alert('Could not withdraw', err.message);
          }
        },
      },
    ]);
  return (
    <Card style={styles.campaignCard}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.campaignName}>{campaign.name}</Text>
          <Text style={styles.brand}>
            {campaign.brand_name} · {formatINR(campaign.daily_rate)}/day
          </Text>
        </View>
        <StatusBadge status="REQUESTED" />
      </View>
      <View style={[styles.blocked, { marginTop: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
        <Text style={[styles.blockedText, { fontWeight: '700', color: colors.text }]}>Application Submitted</Text>
        {campaign.my_request && campaign.my_request.kit_status !== 'NOT_REQUIRED' ? (
          <Text style={styles.blockedText}>
            T-shirt{campaign.my_request.tshirt_size ? ` (${campaign.my_request.tshirt_size})` : ''}: {campaign.my_request.kit_status_label}
          </Text>
        ) : null}
        <Text style={styles.blockedText}>Campaign: Waiting for Admin Approval</Text>
        {campaign.my_request && campaign.my_request.kit_status === 'PENDING' ? (
          <Text style={styles.blockedText}>Open the campaign to see where to collect your T-shirt.</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <OutlineButton label="View Campaign" onPress={() => onOpen(campaign.id)} style={{ flex: 1, paddingVertical: 12 }} />
        <OutlineButton label="Withdraw" onPress={withdraw} style={{ flex: 1, paddingVertical: 12, borderColor: colors.danger }} textStyle={{ color: colors.danger }} />
      </View>
    </Card>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    campaignCard: { padding: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    campaignName: { fontSize: 16, fontWeight: '700', color: c.text },
    brand: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontSize: 13, color: c.textMuted },
    slotRow: { flexDirection: 'row', justifyContent: 'space-between' },
    slotText: { fontSize: 12, color: c.textMuted },
    rules: { marginTop: 12, gap: 6 },
    ruleRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    ruleText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },
    moreRules: { fontSize: 12, color: c.primary, fontWeight: '600', marginLeft: 21 },
    blocked: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 10, marginTop: 12 },
    blockedText: { flex: 1, fontSize: 12, color: c.textMuted, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    notice: { backgroundColor: c.primarySoft, borderRadius: 12, padding: 12 },
    noticeText: { fontSize: 13, color: c.text, lineHeight: 18 },
    activeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 17, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: c.primarySoft, borderRadius: 10, padding: 10 },
    dueText: { flex: 1, fontSize: 13, fontWeight: '600', color: c.primary },
    historyRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    historyName: { fontSize: 14, fontWeight: '700', color: c.text },
    historyReason: { fontSize: 12, color: c.danger, marginTop: 3 },
    historyEarned: { fontSize: 13, fontWeight: '700', color: c.text },
  });
