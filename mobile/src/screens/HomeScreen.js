import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { BrandAvatar, IconButton, SectionHeader, StatusBadge, toneColors } from '../components/ui';
import { formatINR } from '../utils';
import { ActiveCampaignCard } from './CampaignsScreen';

const QUICK_ACTIONS = [
  { label: 'My Brand', icon: 'briefcase-outline', target: 'brand' },
  { label: 'Earnings', icon: 'bar-chart-outline', target: 'earnings' },
  { label: 'Payments', icon: 'card-outline', target: 'payments' },
  { label: 'Documents', icon: 'document-text-outline', target: 'documents' },
  { label: 'Support', icon: 'headset-outline', target: 'support' },
  { label: 'Campaigns', icon: 'megaphone-outline', target: 'campaigns' },
];

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const isRecent = (value) => Boolean(value) && Date.now() - new Date(value).getTime() < RECENT_MS;

// The rider's most relevant next step, following the journey:
// application review → approved → brand assigned → campaign active → campaign completed.
// Returns null when the active-campaign card already tells the story.
function homeStage(rider, campaigns) {
  if (rider.status === 'PENDING' || rider.status === 'UNDER_REVIEW') {
    return { tone: 'warning', icon: 'time-outline', title: 'Application under review', text: "Our operations team is reviewing your application. You'll be notified here once it's approved." };
  }
  if (rider.status === 'REJECTED') {
    return { tone: 'danger', icon: 'close-circle-outline', title: 'Application not approved', text: rider.rejection_reason || 'Please contact your operations manager for details.' };
  }
  if (rider.status === 'SUSPENDED') {
    return { tone: 'danger', icon: 'alert-circle-outline', title: 'Account suspended', text: rider.suspension_reason || 'Please contact your operations manager for details.' };
  }
  if (campaigns && campaigns.active) return null;

  const completed = campaigns ? campaigns.history.find((c) => c.my_status === 'COMPLETED') : null;
  if (completed && isRecent(completed.ended_at)) {
    return {
      tone: 'success',
      icon: 'trophy-outline',
      title: 'Campaign completed',
      text: `${completed.name} has ended. You earned ${formatINR(completed.earned)} for ${completed.completed_days} approved days.`,
      action: { label: 'View campaign', campaignId: completed.id },
    };
  }
  if (campaigns && campaigns.pending_request) {
    return {
      tone: 'primary',
      icon: 'hourglass-outline',
      title: 'Campaign request sent',
      text: `Your request to join ${campaigns.pending_request.name} is awaiting admin approval.`,
      action: { label: 'View request', campaignId: campaigns.pending_request.id },
    };
  }
  if (rider.brand && isRecent(rider.assigned_at)) {
    return {
      tone: 'success',
      icon: 'briefcase-outline',
      title: 'Brand assigned',
      text: `You've been assigned to ${rider.brand}.`,
      action: { label: 'View brand', target: 'brand' },
    };
  }
  if (rider.status === 'APPROVED' && !rider.brand) {
    return {
      tone: 'primary',
      icon: 'checkmark-circle-outline',
      title: 'Application approved',
      text: "You'll be notified when you're assigned to a partner brand. Meanwhile, you can join an open campaign.",
      action: { label: 'Browse campaigns', target: 'campaigns' },
    };
  }
  return null;
}

export default function HomeScreen({ rider, earnings, campaigns, notifications, unreadCount, onNavigate, onOpenCampaign }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const banner = homeStage(rider, campaigns);
  const activeCampaign = campaigns ? campaigns.active : null;
  const bannerColors = banner ? toneColors(colors, banner.tone) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hello, {rider.name.split(' ')[0] || 'Rider'}</Text>
          {rider.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.location} numberOfLines={1}>{rider.location}</Text>
            </View>
          ) : null}
        </View>
        <IconButton icon="notifications-outline" badge={unreadCount} onPress={() => onNavigate('notifications')} />
      </View>

      {banner ? (
        <View style={[styles.banner, { backgroundColor: bannerColors.bg }]}>
          <Ionicons name={banner.icon} size={20} color={bannerColors.fg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: bannerColors.fg }]}>{banner.title}</Text>
            <Text style={styles.bannerText}>{banner.text}</Text>
            {banner.action ? (
              <TouchableOpacity
                style={styles.bannerAction}
                onPress={() => (banner.action.campaignId ? onOpenCampaign(banner.action.campaignId) : onNavigate(banner.action.target))}
              >
                <Text style={[styles.bannerActionText, { color: bannerColors.fg }]}>{banner.action.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={bannerColors.fg} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.9} onPress={() => onNavigate('brand')} style={styles.hero}>
        <View style={styles.heroTop}>
          <BrandAvatar brand={rider.brand} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.heroLabel}>Current Brand</Text>
            <Text style={styles.heroBrand} numberOfLines={1}>{rider.brand || 'Not assigned yet'}</Text>
            <Text style={styles.heroLabel}>
              {rider.assigned_on ? `Assigned ${rider.assigned_on}` : `Rider ID: ${rider.rider_id}`}
            </Text>
            {activeCampaign ? (
              <Text style={styles.heroLabel} numberOfLines={1}>
                Campaign: {activeCampaign.name}
              </Text>
            ) : null}
          </View>
          <StatusBadge status={rider.status} />
        </View>
        <View style={styles.heroStats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Today's Earnings</Text>
            <Text style={styles.heroValue}>{formatINR(earnings.today)}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={{ flex: 1, paddingLeft: 18 }}>
            <Text style={styles.heroLabel}>Pending Payout</Text>
            <Text style={styles.heroValue}>{formatINR(earnings.pending)}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {activeCampaign ? (
        <>
          <SectionHeader title="My Campaign" actionLabel="All campaigns" onAction={() => onNavigate('campaigns')} />
          <ActiveCampaignCard campaign={activeCampaign} onOpen={onOpenCampaign} />
        </>
      ) : null}

      <SectionHeader title="Quick Actions" />
      <View style={styles.grid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity key={action.label} style={styles.tile} onPress={() => onNavigate(action.target)} activeOpacity={0.8}>
            <View style={styles.tileIcon}>
              <Ionicons name={action.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.tileLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader
        title="Recent Activity"
        actionLabel={notifications.length ? 'View All' : null}
        onAction={() => onNavigate('notifications')}
      />
      <View style={styles.activityCard}>
        {notifications.length === 0 ? (
          <Text style={styles.activityEmpty}>Updates about your application, brand and payouts will appear here.</Text>
        ) : (
          notifications.slice(0, 3).map((n, i) => {
            const tone = toneColors(colors, n.tone);
            return (
              <View key={n.id} style={[styles.activityRow, i === Math.min(notifications.length, 3) - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.activityIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={n.icon} size={18} color={tone.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.activityTime}>{n.timeLabel}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    greeting: { fontSize: 24, fontWeight: '800', color: c.text },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    location: { fontSize: 13, color: c.textMuted, flexShrink: 1 },
    banner: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, marginBottom: 14 },
    bannerTitle: { fontSize: 14, fontWeight: '700' },
    bannerText: { fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 },
    bannerAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
    bannerActionText: { fontSize: 13, fontWeight: '700' },
    hero: { backgroundColor: c.hero, borderRadius: 20, padding: 18 },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
    heroLabel: { color: c.heroMuted, fontSize: 12 },
    heroBrand: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginVertical: 2 },
    heroStats: {
      flexDirection: 'row',
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.12)',
    },
    heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
    heroValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    tile: {
      width: '31.5%',
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 16,
      alignItems: 'center',
    },
    tileIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: { fontSize: 12, fontWeight: '600', color: c.text, marginTop: 8 },
    activityCard: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16 },
    activityEmpty: { fontSize: 13, color: c.textMuted, paddingVertical: 18, lineHeight: 19 },
    activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    activityIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    activityTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    activityTime: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  });
