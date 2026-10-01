import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import CustomerHomeScreen from './CustomerHomeScreen';
import CustomerCampaignsScreen from './CustomerCampaignsScreen';
import CustomerCreateWizardScreen from './CustomerCreateWizardScreen';
import CustomerCampaignDetailScreen from './CustomerCampaignDetailScreen';
import CustomerSettingsScreen from './CustomerSettingsScreen';
import CustomerNotificationsScreen from './CustomerNotificationsScreen';
import { subscribeSignals } from '../../services/realtime';

// Three tabs. Creating a campaign starts from Home ("Create Campaign") or the Campaigns tab's floating button.
const CUSTOMER_TABS = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone-outline', activeIcon: 'megaphone' },
  { key: 'settings', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export default function CustomerApp({ onLogout }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  // Navigation State
  const [tab, setTab] = useState('home'); // home | campaigns | create | settings | campaign-detail | notifications
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignsTab, setCampaignsTab] = useState('ALL');

  // Data State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [dashData, campData, notifData, profData] = await Promise.all([
        mobileApi.getCustomerDashboard().catch(() => null),
        mobileApi.getCustomerCampaigns().catch(() => []),
        mobileApi.getCustomerNotifications().catch(() => []),
        mobileApi.getCustomerProfile().catch(() => null),
      ]);
      if (dashData) setDashboard(dashData);
      if (Array.isArray(campData)) setCampaigns(campData);
      if (Array.isArray(notifData)) setNotifications(notifData);
      if (profData) setProfile(profData);
    } catch (err) {
      console.log('Customer data fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // "Your campaign changed" signals (approved, live, riders joined…) refetch at once.
  useEffect(() => {
    let unsubscribe = () => {};
    mobileApi
      .getCustomerRealtime()
      .then((config) => {
        unsubscribe = subscribeSignals(config, () => loadData());
      })
      .catch(() => {});
    return () => unsubscribe();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openCampaign = (id) => {
    setActiveCampaignId(id);
    setTab('campaign-detail');
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setTab('create');
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setTab('create');
  };

  // Notification button in Settings opens notifications
  const openNotifications = () => {
    setTab('notifications');
  };

  const markNotifRead = async (id) => {
    try {
      await mobileApi.markCustomerNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (_) {}
  };

  // Android Back Handler
  useEffect(() => {
    const onBack = () => {
      if (tab === 'campaign-detail') {
        setTab('campaigns');
        return true;
      }
      if (tab === 'notifications') {
        setTab('settings');
        return true;
      }
      if (tab === 'create') {
        setTab('home');
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [tab]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderContent = () => {
    switch (tab) {
      case 'campaigns':
        return (
          <CustomerCampaignsScreen
            campaigns={campaigns}
            loading={refreshing}
            onRefresh={handleRefresh}
            onOpenCampaign={openCampaign}
            onCreateCampaign={openCreate}
            initialTab={campaignsTab}
            onBack={() => setTab('home')}
          />
        );
      case 'create':
        return (
          <CustomerCreateWizardScreen
            initialCampaign={editingCampaign}
            onBack={() => setTab(editingCampaign ? 'campaign-detail' : 'home')}
            onCampaignCreated={() => {
              loadData();
              setTab('campaigns');
            }}
          />
        );
      case 'campaign-detail':
        return (
          <CustomerCampaignDetailScreen
            campaignId={activeCampaignId}
            onBack={() => setTab('campaigns')}
            onEditCampaign={openEdit}
            onChanged={loadData}
          />
        );
      case 'settings':
        return (
          <CustomerSettingsScreen
            profile={profile || dashboard}
            onBack={() => setTab('home')}
            unreadCount={unreadCount}
            onOpenNotifications={openNotifications}
            onLogout={onLogout}
            onProfileChanged={loadData}
          />
        );
      case 'notifications':
        return (
          <CustomerNotificationsScreen
            notifications={notifications}
            loading={refreshing}
            onRefresh={handleRefresh}
            onBack={() => setTab('settings')}
            onMarkRead={markNotifRead}
            onOpenCampaign={openCampaign}
          />
        );
      case 'home':
      default:
        return (
          <CustomerHomeScreen
            dashboardData={dashboard}
            unreadCount={unreadCount}
            onOpenNotifications={openNotifications}
            onOpenProfile={() => setTab('settings')}
            campaigns={campaigns}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onCreateCampaign={openCreate}
            onViewAllCampaigns={(status) => {
              setCampaignsTab(typeof status === 'string' ? status : 'ALL');
              setTab('campaigns');
            }}
            onOpenCampaign={openCampaign}
          />
        );
    }
  };

  const isFullscreenView = ['create', 'campaign-detail', 'notifications'].includes(tab);

  return (
    // The app shell (App.js) already pads the top inset; the tab bar pads the bottom one.
    <View style={styles.safeArea}>
      <View style={styles.container}>{renderContent()}</View>

      {/* Bottom tabs */}
      {!isFullscreenView && (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {CUSTOMER_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={styles.tabBtn}
                onPress={() => { if (t.key === 'campaigns') setCampaignsTab('ALL'); setTab(t.key); }}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={styles.iconBox}>
                  <Ionicons name={active ? t.activeIcon : t.icon} size={22} color={active ? colors.primary : colors.textMuted} />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 6,
      paddingHorizontal: 8,
      alignItems: 'flex-start',
    },
    // Every tab: same icon box height, so all four labels sit on one line.
    tabBtn: { alignItems: 'center', flex: 1, paddingVertical: 2 },
    iconBox: { height: 36, alignItems: 'center', justifyContent: 'center' },
    tabLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
    tabLabelActive: { color: colors.primary, fontWeight: '700' },
  });
