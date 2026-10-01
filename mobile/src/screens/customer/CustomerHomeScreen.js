import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../../theme';
import { EmptyState } from '../../components/ui';
import { BrandCampaignCard } from './brandShared';

const greeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 17) return 'Good Afternoon';
  if (h >= 17 && h < 21) return 'Good Evening';
  return 'Good Night';
};

// Overview cards: brand_status groups from the server, with what each means for the brand.
const GROUPS = [
  { key: 'REQUESTED', statuses: ['REQUESTED', 'CHANGES_REQUESTED'], label: 'Requested', sub: 'Awaiting FlexRiders review', icon: 'time-outline', tone: 'warning' },
  { key: 'APPROVED', statuses: ['APPROVED'], label: 'Approved', sub: 'Ready to go live', icon: 'shield-checkmark-outline', tone: 'primary' },
  { key: 'LIVE', statuses: ['LIVE', 'PAUSED'], label: 'Live', sub: 'Running campaigns', icon: 'radio-outline', tone: 'success' },
  { key: 'COMPLETED', statuses: ['COMPLETED'], label: 'Completed', sub: 'Finished campaigns', icon: 'flag-outline', tone: 'violet' },
];

const inThisMonth = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/** Brand home: greeting, create card, an overview of campaigns by status (this month or all time) and the
 * live (or latest) campaigns. Every number is counted from the brand's own campaigns on the server. */
export default function CustomerHomeScreen({
  dashboardData,
  campaigns = [],
  onRefresh,
  refreshing,
  onCreateCampaign,
  onViewAllCampaigns,
  onOpenCampaign,
  unreadCount = 0,
  onOpenNotifications,
  onOpenProfile,
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [period, setPeriod] = useState('MONTH'); // MONTH | ALL
  const tones = {
    warning: [colors.warning, colors.warningSoft],
    primary: [colors.primary, colors.primarySoft],
    success: [colors.success, colors.successSoft],
    violet: ['#7C3AED', 'rgba(124, 58, 237, 0.12)'],
  };

  const scoped = useMemo(() => (period === 'ALL' ? campaigns : campaigns.filter((c) => inThisMonth(c.created_at))), [campaigns, period]);
  const live = campaigns.filter((c) => c.brand_status === 'LIVE');
  const requested = campaigns.filter((c) => ['REQUESTED', 'CHANGES_REQUESTED'].includes(c.brand_status));
  const company = dashboardData ? dashboardData.company_name : '';
  // Greet the person, not the brand: the first name of the contact person (never an email or phone fallback).
  const person = dashboardData && dashboardData.customer_name && !/[@\d]/.test(dashboardData.customer_name)
    ? dashboardData.customer_name.trim().split(/\s+/)[0]
    : '';
  const who = person || company;

  const section = (title, list) =>
    list.length ? (
      <>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <TouchableOpacity onPress={() => onViewAllCampaigns()} hitSlop={8}>
            <Text style={styles.link}>See all</Text>
          </TouchableOpacity>
        </View>
        <View style={{ gap: 14 }}>
          {list.slice(0, 3).map((c) => (
            <BrandCampaignCard key={c.id} campaign={c} onOpen={onOpenCampaign} />
          ))}
        </View>
      </>
    ) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{greeting()},</Text>
          <Text style={styles.brand} numberOfLines={1}>
            {who || ' '} {who ? '👋' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={onOpenNotifications} accessibilityLabel={`Notifications, ${unreadCount} unread`}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {unreadCount ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.avatar} onPress={onOpenProfile} accessibilityLabel="Profile">
          <Text style={styles.avatarText}>{(who || 'B').charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.create} activeOpacity={0.9} onPress={onCreateCampaign} accessibilityRole="button">
        <View style={[styles.glow, { top: -40, right: -30 }]} />
        <View style={[styles.glow, { bottom: -60, right: 60, width: 120, height: 120 }]} />
        <View style={styles.plus}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.createTitle}>Create Campaign</Text>
          <Text style={styles.createSub}>Launch a new campaign in a few steps</Text>
        </View>
        <View style={styles.megaphone}>
          <Ionicons name="megaphone" size={40} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <TouchableOpacity style={styles.period} onPress={() => setPeriod(period === 'MONTH' ? 'ALL' : 'MONTH')} hitSlop={8}>
          <Text style={styles.link}>{period === 'MONTH' ? 'This Month' : 'All Time'}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {GROUPS.map((g) => {
          const [fg, bg] = tones[g.tone];
          const n = scoped.filter((c) => g.statuses.includes(c.brand_status)).length;
          return (
            <TouchableOpacity key={g.key} style={[styles.stat, { backgroundColor: bg }]} activeOpacity={0.85} onPress={() => onViewAllCampaigns(g.key)}>
              <View style={styles.statTop}>
                <View style={[styles.statIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons name={g.icon} size={24} color={fg} />
                </View>
                <View style={styles.chev}>
                  <Ionicons name="chevron-forward" size={14} color={fg} />
                </View>
              </View>
              <Text style={styles.statValue}>{dashboardData ? n : '–'}</Text>
              <Text style={styles.statLabel}>{g.label}</Text>
              <Text style={styles.statSub} numberOfLines={1}>{g.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!dashboardData ? (
        <EmptyState icon="cloud-offline-outline" title="Loading your campaigns" message="Pull down to refresh if this takes long." />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="megaphone-outline" title="No campaigns yet" message="Create your first campaign request. FlexRiders reviews it before it goes live." />
      ) : (
        section('Live Campaigns', live) || section('Requested Campaigns', requested) || section('Recent Campaigns', campaigns)
      )}
      {live.length && requested.length ? section('Requested Campaigns', requested) : null}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hello: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    brand: { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 2 },
    iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.background },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
    create: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.primary,
      borderRadius: 20,
      paddingVertical: 20,
      paddingHorizontal: 18,
      marginTop: 20,
      overflow: 'hidden',
      shadowColor: c.primary,
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    glow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' },
    plus: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    createTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
    createSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
    megaphone: { transform: [{ rotate: '-18deg' }], opacity: 0.95 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
    sectionTitle: { fontSize: 19, fontWeight: '800', color: c.text },
    link: { fontSize: 14, color: c.primary, fontWeight: '700' },
    period: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    stat: { flexBasis: '46%', flexGrow: 1, borderRadius: 18, padding: 14 },
    statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    statIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    chev: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 26, fontWeight: '800', color: c.text, marginTop: 10 },
    statLabel: { fontSize: 14, fontWeight: '700', color: c.text },
    statSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  });
