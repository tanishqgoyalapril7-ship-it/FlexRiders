import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { getAuthToken, loadStoredToken, mobileApi, setAuthToken } from './src/services/api';
import { ThemeProvider, useStyles, useTheme } from './src/theme';
import { formatDate, formatDateTime, notificationStyle, summarizeEarnings } from './src/utils';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import BrandScreen from './src/screens/BrandScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
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

const TABS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications' },
  { key: 'profile', label: 'Profile', icon: 'person' },
];

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

const toPayment = (p) => ({
  id: p.id,
  date: new Date(p.payment_date),
  dateLabel: formatDate(p.payment_date),
  brand: p.brand_name || 'Super Riders',
  amount: Number(p.amount) || 0,
  status: p.status,
});

const toNotification = (n) => ({
  id: n.id,
  title: n.title,
  message: n.message,
  category: n.category,
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
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [screen, setScreen] = useState('loading'); // loading | splash | login | register | main
  const [loginWithOtp, setLoginWithOtp] = useState(false);
  const [tab, setTab] = useState('home');
  const [rider, setRider] = useState(EMPTY_RIDER);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [campaigns, setCampaigns] = useState(null);
  const [campaignId, setCampaignId] = useState(null);

  const logout = useCallback(() => {
    setAuthToken('');
    setRider(EMPTY_RIDER);
    setPayments([]);
    setNotifications([]);
    setCampaigns(null);
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
    const [paymentData, notificationData, campaignData] = await Promise.all([
      mobileApi.getPaymentHistory().catch(() => null),
      mobileApi.getNotifications().catch(() => null),
      mobileApi.getCampaigns().catch(() => null),
    ]);
    if (paymentData) setPayments((paymentData.payments || []).map(toPayment));
    if (notificationData) setNotifications(notificationData.map(toNotification));
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
    loadStoredToken().then(async (token) => {
      if (token) await refreshData();
      setScreen(getAuthToken() ? 'main' : 'splash');
    });
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

  const navigate = (target) => (target === 'documents' ? showDocumentsInfo() : setTab(target));
  const openCampaign = (id) => {
    setCampaignId(id);
    setTab('campaign');
  };
  const goHome = () => setTab('home');
  const earnings = useMemo(() => summarizeEarnings(payments), [payments]);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const renderTab = () => {
    switch (tab) {
      case 'earnings':
        return <EarningsScreen rider={rider} earnings={earnings} payments={payments} onBack={goHome} onViewAll={() => setTab('payments')} />;
      case 'payments':
        return <PaymentsScreen rider={rider} payments={payments} onBack={goHome} />;
      case 'brand':
        return <BrandScreen rider={rider} onBack={goHome} onShowDocuments={showDocumentsInfo} onSupport={() => setTab('support')} />;
      case 'notifications':
        return (
          <NotificationsScreen
            notifications={notifications}
            onBack={goHome}
            onMarkAllRead={markAllRead}
            onDelete={deleteNotification}
            onClearAll={clearNotifications}
          />
        );
      case 'profile':
        return <ProfileScreen rider={rider} onLogout={logout} onProfileChanged={refreshData} onAccountDeleted={handleAccountDeleted} />;
      case 'support':
        return <SupportScreen onBack={goHome} />;
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
    <SafeAreaView style={[styles.safeArea, isSplash && { backgroundColor: '#071233' }]}>
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

      {screen === 'register' && <RegisterScreen onBack={() => setScreen('splash')} onRegistered={handleRegistered} />}

      {screen === 'main' && (
        <View style={{ flex: 1 }}>
          {renderTab()}
          <View style={styles.tabBar}>
            {TABS.map((t) => {
              const active = tab === t.key || (t.key === 'campaigns' && tab === 'campaign');
              const color = active ? colors.primary : colors.textSubtle;
              return (
                <TouchableOpacity key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
                  <View>
                    <Ionicons name={active ? t.icon : `${t.icon}-outline`} size={22} color={color} />
                    {t.key === 'notifications' && unreadCount > 0 ? (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.tabLabel, { color }, active && { fontWeight: '700' }]}>{t.label}</Text>
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
    <ThemeProvider>
      <RiderApp />
    </ThemeProvider>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
      paddingBottom: 6,
    },
    tabItem: { flex: 1, alignItems: 'center', gap: 3 },
    tabLabel: { fontSize: 10.5, fontWeight: '600' },
    tabBadge: {
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  });

registerRootComponent(App);
