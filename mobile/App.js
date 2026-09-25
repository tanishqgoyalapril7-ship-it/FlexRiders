import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { getAuthToken, loadStoredToken, mobileApi, setAuthToken } from './src/services/api';
import { ThemeProvider, useStyles, useTheme } from './src/theme';
import { formatDate, formatDateTime, notificationStyle } from './src/utils';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import BrandScreen from './src/screens/BrandScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ReferScreen from './src/screens/ReferScreen';
// Registers the background route task at startup (it must exist before location updates arrive).
import { stopRoute } from './src/services/routeTracker';
import SupportScreen from './src/screens/SupportScreen';
import CampaignsScreen from './src/screens/CampaignsScreen';
import CampaignDetailScreen from './src/screens/CampaignDetailScreen';

const REFRESH_INTERVAL_MS = 4000;

const EMPTY_RIDER = {
  name: '',
  rider_id: '',
  status: '',
  brand: '',
  location: '',
  phone: '',
  email: '',
  vehicle: '',
  vehicle_number: '',
  vehicle_category: '',
  upi_id: '',
  // Raw editable fields for Edit Profile
  dob: '',
  city: '',
  area: '',
  gpay_number: '',
  total: 0,
  paid: 0,
  pending: 0,
  assigned_on: '',
  assigned_by: '',
  assigned_at: null,
  rejection_reason: '',
  suspension_reason: '',
};

// Notifications open from the Home bell (and Profile → Settings), not from the tab bar.
const TABS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'person' },
];
// Screens reached from a tab keep that tab highlighted.
const TAB_OF_SCREEN = { campaign: 'campaigns', payments: 'earnings', refer: 'profile' };

const toRider = (profile) => {
  const current = (profile.brand_history || []).find((a) => a.is_current);
  return {
    name: profile.full_name || '',
    rider_id: profile.rider_id || '',
    status: profile.status || '',
    brand: profile.current_brand || '',
    location: [profile.primary_city, profile.primary_area].filter(Boolean).join(', '),
    phone: profile.mobile_number || '',
    email: profile.email || '',
    vehicle: profile.vehicle_type || '',
    vehicle_number: profile.vehicle_number || '',
    vehicle_category: profile.vehicle_category || '',
    dob: profile.dob || '',
    city: profile.primary_city || '',
    area: profile.primary_area || '',
    gpay_number: profile.gpay_number || '',
    upi_id: profile.upi_id || '',
    total: profile.total_earnings || 0,
    paid: profile.paid_earnings || 0,
    pending: profile.pending_earnings || 0,
    assigned_on: current ? formatDate(current.assignment_date) : '',
    assigned_by: current ? current.assigned_by_name || '' : '',
    assigned_at: current ? current.assignment_date : null,
    rejection_reason: profile.rejection_reason || '',
    suspension_reason: profile.suspension_reason || '',
  };
};

// Earnings come from the backend's single calculation (never recomputed on the phone).
const EMPTY_EARNINGS = { today: 0, week: 0, month: 0, lastMonth: 0, total: 0, paid: 0, pending: 0, lastSevenDays: [], campaigns: [] };
const toEarnings = (e) => ({
  today: e.today_earnings,
  week: e.week_earnings,
  month: e.month_earnings,
  lastMonth: e.last_month_earnings,
  total: e.total_earnings,
  paid: e.paid_earnings,
  pending: e.pending_earnings,
  lastSevenDays: (e.last_seven_days || []).map((d) => ({
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2),
    amount: d.amount,
  })),
  campaigns: e.campaigns || [],
});

const toPayment = (p) => ({
  id: p.id,
  date: new Date(p.payment_date),
  dateLabel: formatDate(p.payment_date),
  brand: p.brand_name || 'FlexRiders',
  amount: Number(p.amount) || 0,
  status: p.status,
});

const toNotification = (n) => ({
  id: n.id,
  title: n.title,
  message: n.message,
  category: n.category,
  // Campaign notifications (slot reminders, campaign live) carry the campaign id.
  campaignId: n.category === 'CAMPAIGN' && /^\d+$/.test(n.reference_id || '') ? Number(n.reference_id) : null,
  // Support replies open that conversation.
  supportId: n.category === 'SUPPORT' && /^\d+$/.test(n.reference_id || '') ? Number(n.reference_id) : null,
  unread: !n.is_read,
  timeLabel: formatDateTime(n.created_at),
  ...notificationStyle(n.category, n.title),
});

const showDocumentsInfo = () =>
  Alert.alert(
    'Documents',
    'Document upload is not available in the app yet. Our operations team will contact you to verify your Driving Licence, Aadhaar and vehicle RC.'
  );

function RiderApp() {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [screen, setScreen] = useState('loading'); // loading | splash | login | register | main
  const [loginWithOtp, setLoginWithOtp] = useState(false);
  const [tab, setTab] = useState('home');
  const [rider, setRider] = useState(EMPTY_RIDER);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [campaigns, setCampaigns] = useState(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportConversation, setSupportConversation] = useState(null); // Opened from a notification
  // A shared referral link (superriders://register?ref=CODE) opens registration with the code filled in.
  // A campaign link (superriders://campaign/ID, from the public campaign page) opens that campaign after login.
  const [referralCode, setReferralCode] = useState('');
  const [linkedCampaign, setLinkedCampaign] = useState(null);
  useEffect(() => {
    const handle = (url) => {
      const campaignMatch = /campaign\/(\d+)/.exec(url || '');
      if (campaignMatch) setLinkedCampaign(Number(campaignMatch[1]));
      const match = /[?&]ref=([A-Za-z0-9]+)/.exec(url || '');
      if (match && !getAuthToken()) {
        setReferralCode(match[1].toUpperCase());
        setScreen('register');
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
  const [earnings, setEarnings] = useState(EMPTY_EARNINGS);
  const [campaignId, setCampaignId] = useState(null);

  const logout = useCallback(async () => {
    // Stop location sharing and upload the last points while still signed in.
    await stopRoute().catch(() => {});
    setAuthToken('');
    setRider(EMPTY_RIDER);
    setPayments([]);
    setNotifications([]);
    setCampaigns(null);
    setSupportUnread(0);
    setEarnings(EMPTY_EARNINGS);
    setTab('home');
    setScreen('splash');
  }, []);

  // Loads the logged-in rider's data. Returns true on success, false when the account
  // has no rider profile yet, and null on other errors (e.g. backend unreachable).
  const loadData = useCallback(async () => {
    if (!getAuthToken()) return null;
    try {
      setRider(toRider(await mobileApi.getProfile()));
    } catch (err) {
      if (err.status === 401) logout();
      return err.status === 404 ? false : null;
    }
    const [paymentData, notificationData, campaignData, earningsData, supportData] = await Promise.all([
      mobileApi.getPaymentHistory().catch(() => null),
      mobileApi.getNotifications().catch(() => null),
      mobileApi.getCampaigns().catch(() => null),
      mobileApi.getEarnings().catch(() => null),
      mobileApi.getSupportUnread().catch(() => null),
    ]);
    if (supportData) setSupportUnread(supportData.unread || 0);
    if (earningsData) setEarnings(toEarnings(earningsData));
    if (paymentData) setPayments((paymentData.payments || []).map(toPayment));
    if (Array.isArray(notificationData)) setNotifications(notificationData.map(toNotification));
    if (campaignData) setCampaigns(campaignData);
    return true;
  }, [logout]);

  // Only one refresh runs at a time: when the backend is slow, polling must not pile up requests
  // (that exhausted the backend's database connections and made campaigns fail to load).
  // Refreshes after a rider action wait for any running refresh, then load fresh data;
  // the background poll simply skips a tick while one is running.
  const refreshing = useRef(null);
  const refreshData = useCallback(() => {
    const run = (refreshing.current || Promise.resolve())
      .catch(() => null)
      .then(loadData)
      .finally(() => {
        if (refreshing.current === run) refreshing.current = null;
      });
    refreshing.current = run;
    return run;
  }, [loadData]);
  const poll = useCallback(() => {
    if (!refreshing.current) refreshData();
  }, [refreshData]);

  // Restore a saved login on launch.
  useEffect(() => {
    loadStoredToken()
      .then(async (token) => {
        if (token) await refreshData().catch(() => null); // Offline or a bad response: open the app anyway, polling retries
      })
      .finally(() => setScreen(getAuthToken() ? 'main' : 'splash'));
  }, [refreshData]);

  useEffect(() => {
    if (screen !== 'main') return undefined;
    const id = setInterval(poll, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [screen, poll]);

  const handleLoggedIn = async () => {
    const result = await refreshData();
    if (result === false) {
      Alert.alert('Complete your registration', 'This number is not registered as a rider yet. Please complete the registration form.');
      setScreen('register');
      return;
    }
    setTab('home');
    setScreen('main');
  };

  const handleRegistered = async (result) => {
    await refreshData();
    setTab('home');
    setScreen('main');
    Alert.alert(
      'Application submitted',
      `Your Rider ID is ${result.rider_id}.\n\nOur operations team will review your application. You'll be notified in the app once it's approved.`
    );
  };

  const deleteNotification = async (id) => {
    await mobileApi.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearNotifications = async () => {
    await mobileApi.clearNotifications();
    setNotifications([]);
  };

  const handleAccountDeleted = (message) => {
    logout();
    Alert.alert('Account deleted', message);
  };

  const markAllRead = async () => {
    await mobileApi.markAllNotificationsRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  // Notifications can be opened from Home or Profile; Back returns to where the rider came from.
  const [notificationsBack, setNotificationsBack] = useState('home');
  const openNotifications = (from) => {
    setNotificationsBack(from);
    setTab('notifications');
  };
  const navigate = (target) =>
    target === 'documents'
      ? showDocumentsInfo()
      : target === 'notifications'
      ? openNotifications('home')
      : target === 'support'
      ? openSupport(null)
      : setTab(target);
  const openCampaign = (id) => {
    setCampaignId(id);
    setTab('campaign');
  };
  const goHome = () => setTab('home');
  const openSupport = (conversationId) => {
    setSupportConversation(conversationId || null);
    setTab('support');
  };
  useEffect(() => {
    if (screen === 'main' && linkedCampaign) {
      openCampaign(linkedCampaign);
      setLinkedCampaign(null);
    }
  }, [screen, linkedCampaign]);

  // Android back button: go to the previous screen instead of closing the app; on Home (or the splash) it exits as usual.
  useEffect(() => {
    const onBack = () => {
      if (screen === 'login' || screen === 'register') {
        setScreen('splash');
        return true;
      }
      if (screen !== 'main' || tab === 'home') return false;
      const parent = { campaign: 'campaigns', payments: 'earnings', refer: 'profile', notifications: notificationsBack }[tab];
      setTab(parent || 'home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [screen, tab, notificationsBack]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const renderTab = () => {
    switch (tab) {
      case 'earnings':
        return <EarningsScreen rider={rider} earnings={earnings} payments={payments} onBack={goHome} onViewAll={() => setTab('payments')} />;
      case 'payments':
        return <PaymentsScreen rider={rider} payments={payments} onBack={goHome} />;
      case 'brand':
        return <BrandScreen rider={rider} onBack={goHome} onShowDocuments={showDocumentsInfo} onSupport={() => openSupport(null)} />;
      case 'notifications':
        return (
          <NotificationsScreen
            notifications={notifications}
            onBack={() => setTab(notificationsBack)}
            onMarkAllRead={markAllRead}
            onDelete={deleteNotification}
            onClearAll={clearNotifications}
            onOpenCampaign={openCampaign}
            onOpenSupport={openSupport}
          />
        );
      case 'profile':
        return <ProfileScreen rider={rider} supportUnread={supportUnread} onOpenSupport={() => openSupport(null)} onLogout={logout} onProfileChanged={refreshData} onAccountDeleted={handleAccountDeleted} onOpenRefer={() => setTab('refer')} onOpenNotifications={() => openNotifications('profile')} unreadCount={unreadCount} />;
      case 'refer':
        return <ReferScreen onBack={() => setTab('profile')} />;
      case 'support':
        return (
          <SupportScreen
            key={supportConversation || 'list'}
            initialConversationId={supportConversation}
            onUnreadChanged={setSupportUnread}
            onBack={() => {
              setSupportConversation(null);
              goHome();
            }}
          />
        );
      case 'campaigns':
        return <CampaignsScreen data={campaigns} onOpen={openCampaign} onChanged={refreshData} />;
      case 'campaign':
        return <CampaignDetailScreen key={campaignId} campaignId={campaignId} onBack={() => setTab('campaigns')} onChanged={refreshData} />;
      default:
        return (
          <HomeScreen
            rider={rider}
            earnings={earnings}
            campaigns={campaigns}
            notifications={notifications}
            unreadCount={unreadCount}
            onNavigate={navigate}
            onOpenCampaign={openCampaign}
          />
        );
    }
  };

  const isSplash = screen === 'splash';

  return (
    // In the main app the tab bar pads for the bottom inset itself, so it reaches the screen edge.
    <SafeAreaView
      style={[styles.safeArea, isSplash && { backgroundColor: '#071233' }]}
      edges={screen === 'main' ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
    >
      <StatusBar barStyle={isSplash ? 'light-content' : colors.statusBar} />

      {screen === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isSplash && (
        <SplashScreen
          onLogin={() => {
            setLoginWithOtp(false);
            setScreen('login');
          }}
          onLoginWithOtp={() => {
            setLoginWithOtp(true);
            setScreen('login');
          }}
          onRegister={() => setScreen('register')}
        />
      )}

      {screen === 'login' && (
        <LoginScreen
          initialOtpMode={loginWithOtp}
          onBack={() => setScreen('splash')}
          onLoggedIn={handleLoggedIn}
          onRegister={() => setScreen('register')}
        />
      )}

      {screen === 'register' && (
        <RegisterScreen onBack={() => setScreen('splash')} onRegistered={handleRegistered} initialReferralCode={referralCode} />
      )}

      {screen === 'main' && (
        <View style={{ flex: 1 }}>
          {renderTab()}
          <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
            {TABS.map((t) => {
              const active = (TAB_OF_SCREEN[tab] || tab) === t.key;
              const color = active ? colors.primary : colors.textSubtle;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={styles.tabItem}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.label}
                >
                  <View style={styles.tabIcon}>
                    <Ionicons name={active ? t.icon : `${t.icon}-outline`} size={24} color={color} />
                  </View>
                  <Text style={[styles.tabLabel, { color }, active && styles.tabLabelActive]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RiderApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // Four equal columns; each centres a fixed-size icon slot above a single-line label,
    // so icons line up and labels share one baseline on every screen width.
    tabBar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingTop: 8,
    },
    tabItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    tabIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    tabLabel: { marginTop: 3, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
    tabLabelActive: { fontWeight: '700' },
  });

registerRootComponent(App);
