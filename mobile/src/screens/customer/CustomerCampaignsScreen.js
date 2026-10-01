import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../../theme';
import { EmptyState } from '../../components/ui';
import { Header as ScreenHeader } from '../../components/ds';
import { BrandCampaignCard } from './brandShared';

// Tabs over the brand's own campaigns, by brand_status from the server.
const TABS = [
  ['ALL', 'All', null],
  ['REQUESTED', 'Requested', ['REQUESTED', 'CHANGES_REQUESTED']],
  ['APPROVED', 'Approved', ['APPROVED']],
  ['LIVE', 'Live', ['LIVE', 'PAUSED']],
  ['COMPLETED', 'Completed', ['COMPLETED']],
  ['DRAFT', 'Drafts', ['DRAFT']],
  ['REJECTED', 'Rejected', ['REJECTED', 'CANCELLED']],
];

export default function CustomerCampaignsScreen({ campaigns = [], loading, onRefresh, onOpenCampaign, onCreateCampaign, onBack, initialTab = 'ALL' }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  useEffect(() => setTab(initialTab), [initialTab]);

  const visible = useMemo(() => {
    const keys = (TABS.find(([k]) => k === tab) || TABS[0])[2];
    const term = search.trim().toLowerCase();
    return campaigns.filter(
      (c) =>
        (!keys || keys.includes(c.brand_status)) &&
        (!term || [c.name, c.campaign_code, c.location_area].some((v) => (v || '').toLowerCase().includes(term)))
    );
  }, [campaigns, tab, search]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={Boolean(loading)} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader title="Campaigns" onBack={onBack} />
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, ID or area"
            placeholderTextColor={colors.textSubtle}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map(([key, label, keys]) => {
            const n = keys ? campaigns.filter((c) => keys.includes(c.brand_status)).length : campaigns.length;
            return (
              <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
                <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                  {label} {n ? `(${n})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {visible.length === 0 ? (
          <EmptyState
            icon="megaphone-outline"
            title={campaigns.length ? 'Nothing here' : 'No campaigns yet'}
            message={campaigns.length ? 'No campaigns match this filter.' : 'Create a campaign request to get started.'}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {visible.map((c) => (
              <BrandCampaignCard key={c.id} campaign={c} onOpen={onOpenCampaign} />
            ))}
          </View>
        )}
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={onCreateCampaign} activeOpacity={0.9} accessibilityLabel="Create a new campaign">
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={styles.fabText}>New Campaign</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 110 }, // Room for the floating button
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12 },
    input: { flex: 1, paddingVertical: 11, fontSize: 15, color: c.text },
    tabs: { gap: 8, paddingVertical: 14 },
    tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    tabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabText: { fontSize: 13, fontWeight: '700', color: c.text },
    tabTextActive: { color: c.onPrimary },
    fab: {
      position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 15,
      shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
    },
    fabText: { color: c.onPrimary, fontSize: 16, fontWeight: '800' },
  });
