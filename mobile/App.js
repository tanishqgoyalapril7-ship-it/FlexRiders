import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { getAuthRole, getAuthToken, loadStoredToken, mobileApi, setAuthToken } from './src/services/api';
import { ThemeProvider, useStyles, useTheme } from './src/theme';
import { formatDate, formatDateTime, notificationStyle } from './src/utils';
import { BootSplash, LanguageScreen, LocationPrompt, RoleScreen, Walkthrough } from './src/screens/onboarding/Onboarding';
import RiderSignup from './src/screens/onboarding/RiderSignup';
import TshirtScreen from './src/screens/rider/TshirtScreen';
import { vehicleCategoryLabel } from './src/components/formFields';
import { VerificationStatus, WorkingAreasScreen } from './src/screens/onboarding/Verification';
import { LanguageProvider, useT } from './src/i18n';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import TermsConsentScreen from './src/screens/TermsConsentScreen';
import ChangeVehicleScreen from './src/screens/rider/ChangeVehicleScreen';
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
import { acquireLocation, getLocationStatus, openLocationSettings, watchLocation } from './src/services/locationService';
import { subscribeSignals } from './src/services/realtime';
import CustomerApp from './src/screens/customer/CustomerApp';
import CustomerSignupScreen from './src/screens/customer/CustomerSignupScreen';

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
  has_photo: false,
};

// Notifications open from the Home bell (and Profile → Settings), not from the tab bar.
const TABS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet' },
  { key: 'profile', label: 'You', icon: 'person' },
];
// Screens reached from a tab keep that tab highlighted.
const TAB_OF_SCREEN = {
  campaign: 'campaigns', payments: 'earnings', refer: 'profile', verification: 'profile', vehicle: 'profile', 'change-vehicle': 'profile',
  areas: 'profile', tshirt: 'profile', language: 'profile', activity: 'campaigns', active: 'campaigns',
};

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
    has_photo: Boolean(profile.profile_photo),
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
  createdAt: n.created_at,
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
  const [screen, setScreen] = useState('loading');
  const { t: translate, chosen: languageChosen } = useT();
  const [introStep, setIntroStep] = useState('walk');
  // loading | intro | splash | login | forgot | change-password | terms | register | main
  // Signed out: the walkthrough shows on every launch; the language step only until a language is chosen.
  const [consent, setConsent] = useState(null); // Terms & Privacy status when a newer version needs accepting
  const consentChecked = useRef(false); // Checked once per login, not on every background refresh
  const vehicleBack = useRef('vehicle'); // Change Vehicle opens from Profile or from My Vehicle; Back returns there
  const [forgotFor, setForgotFor] = useState('');
  const [forgotReturnScreen, setForgotReturnScreen] = useState('login');
  const [otpLogin, setOtpLogin] = useState(false); // Only where the server allows it (local development)
  useEffect(() => {
    mobileApi.getAppConfig().then((c) => setOtpLogin(c.otp_login === true)).catch(() => {});
  }, []);
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
  // The device's current location (only read while the rider uses the app) and why it may be missing.
  const activeLocationRef = useRef(null);
  const [deviceLocation, setDeviceLocation] = useState(null);
  const [locationState, setLocationState] = useState('UNKNOWN'); // see locationService: SERVICES_OFF, DENIED, …, AVAILABLE

  const logout = useCallback(async () => {
    // Stop location sharing and upload the last points while still signed in.
    await stopRoute().catch(() => {});
    setAuthToken('', '');
    consentChecked.current = false;
    setConsent(null);
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
      if (err.status === 403 && /new password/i.test(err.message || '')) {
        setScreen('change-password'); // Admin reset: a new password comes first
        return 'CHANGE_PASSWORD';
      }
      return err.status === 404 ? false : null;
    }
    if (!consentChecked.current) {
      const status = await mobileApi.getConsent().catch(() => null);
      if (status) consentChecked.current = true;
      if (status && status.required) {
        setConsent(status);
        setScreen('terms'); // A newer Terms / Privacy version: accept it before continuing
        return 'TERMS';
      }
    }
    const locationParams = activeLocationRef.current;
    const [paymentData, notificationData, campaignData, earningsData, supportData] = await Promise.all([
      mobileApi.getPaymentHistory().catch(() => null),
      mobileApi.getNotifications().catch(() => null),
      mobileApi.getCampaigns(locationParams).catch(() => null),
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

  // Current location: permission → services → a real fix, then a foreground watcher keeps it fresh
  // (and moves the map marker). There is no fallback position: the state says why a fix is missing.
  const stopWatch = useRef(null);
  const lastSent = useRef(null);
  const sendLocation = useCallback((fix, force) => {
    // Backend copy of the rider's current location, at most every 60 s unless they moved 100 m.
    const prev = lastSent.current;
    const moved = prev ? Math.hypot((fix.latitude - prev.latitude) * 111, (fix.longitude - prev.longitude) * 111 * Math.cos((fix.latitude * Math.PI) / 180)) : Infinity;
    if (!force && prev && Date.now() - prev.at < 60000 && moved < 0.1) return;
    lastSent.current = { latitude: fix.latitude, longitude: fix.longitude, at: Date.now() };
    mobileApi
      .updateLocation({ lat: fix.latitude, lng: fix.longitude })
      .then(() => __DEV__ && console.log('[location] backend updated', fix.latitude, fix.longitude))
      .catch((err) => __DEV__ && console.log('[location] backend update failed', err.message));
  }, []);
  const applyFix = useCallback(
    (fix) => {
      activeLocationRef.current = { lat: fix.latitude, lng: fix.longitude };
      setDeviceLocation((prev) => ({ ...fix, label: fix.label || (prev && prev.label) || null }));
      setLocationState('AVAILABLE');
    },
    []
  );
  const acquiring = useRef(false);
  const refreshLocation = useCallback(
    async (prompt) => {
      if (acquiring.current) return;
      acquiring.current = true;
      setLocationState((s) => (s === 'AVAILABLE' ? s : 'FETCHING'));
      try {
        const result = await acquireLocation({ prompt });
        if (__DEV__) console.log('[location] acquire result', result.state);
        if (result.state === 'AVAILABLE') {
          applyFix(result.fix);
          sendLocation(result.fix, true);
          refreshData();
          if (!stopWatch.current) {
            stopWatch.current = await watchLocation((fix) => {
              applyFix(fix);
              sendLocation(fix, false);
            });
          }
        } else {
          // Never keep showing an old position as current.
          activeLocationRef.current = null;
          setDeviceLocation(null);
          setLocationState(result.state);
          if (stopWatch.current) {
            stopWatch.current();
            stopWatch.current = null;
          }
        }
      } finally {
        acquiring.current = false;
      }
    },
    [refreshData, sendLocation, applyFix]
  );

  // Signed-in riders: read location on the main screen (the OS prompt shows once, automatically), and
  // re-check whenever the app comes back to the foreground, e.g. after turning Location on in Settings.
  const locationPrompted = useRef(false);
  useEffect(() => {
    if (screen !== 'main') return undefined;
    if (!locationPrompted.current) {
      locationPrompted.current = true;
      getLocationStatus().then((st) =>
        // Never asked yet: explain why first (the OS prompt shows when the rider taps Allow).
        st.permission === 'undetermined' && st.canAskAgain ? setScreen('post-location') : refreshLocation(false)
      );
    } else {
      refreshLocation(false);
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLocation(false);
      else if (stopWatch.current) {
        stopWatch.current(); // No location use while the app is in the background
        stopWatch.current = null;
      }
    });
    return () => {
      sub.remove();
      if (stopWatch.current) {
        stopWatch.current();
        stopWatch.current = null;
      }
    };
  }, [screen, refreshLocation]);

  const locationAction = useCallback(() => {
    if (locationState === 'DENIED_PERMANENT' || locationState === 'SERVICES_OFF') {
      openLocationSettings(locationState).then(() => refreshLocation(false));
    } else {
      refreshLocation(true);
    }
  }, [locationState, refreshLocation]);

  // Campaign slot/status changes arrive as realtime signals; the list is then refetched.
  const realtimeConfig = campaigns && campaigns.realtime;
  useEffect(() => {
    if (screen !== 'main' || !realtimeConfig) return undefined;
    return subscribeSignals(realtimeConfig, () => poll());
  }, [screen, realtimeConfig && realtimeConfig.topic]);

  // Restore a saved login on launch and pre-populate with cached device location.
  useEffect(() => {
    const minSplash = new Promise((resolve) => setTimeout(resolve, 1600)); // Lets the launch animation play
    (async () => {
      // A fix from a previous session isn't current: location is read fresh on the main screen.
      const token = await loadStoredToken();
      const role = getAuthRole();
      if (token && role === 'CUSTOMER') {
        await minSplash;
        setScreen('customer-main');
        return;
      }
      if (token) await refreshData().catch(() => null);
    })()
      .then(() => minSplash, () => minSplash)
      .finally(() =>
      setScreen((current) => {
        if (['change-password', 'terms', 'customer-main'].includes(current)) return current;
        if (getAuthToken()) {
          return getAuthRole() === 'CUSTOMER' ? 'customer-main' : 'main';
        }
        return 'intro'; // Walkthrough (plus language until one is chosen), then the Rider/Brand choice
      })
    );
  }, [refreshData]);

  useEffect(() => {
    if (screen !== 'main') return undefined;
    const id = setInterval(poll, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [screen, poll]);

  const handleLoggedIn = async (login) => {
    if (login && login.role === 'CUSTOMER') {
      setScreen('customer-main');
      return;
    }
    if (login && login.must_change_password) {
      setScreen('change-password');
      return;
    }
    const result = await refreshData();
    if (result === 'CHANGE_PASSWORD' || result === 'TERMS') return;
    if (result === false) {
      Alert.alert('Complete your registration', 'This number is not registered as a rider yet. Please complete the registration form.');
      setScreen('register');
      return;
    }
    setTab('home');
    setScreen('main');
  };

  const handleCustomerLoggedIn = () => {
    setScreen('customer-main');
  };

  // After sign-up: document status → working areas → location pre-prompt → Home.
  const handleRegistered = async () => {
    await refreshData();
    setTab('home');
    setScreen('post-verify');
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
      ? setTab('verification')
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
      if (screen === 'login' || screen === 'customer-login') {
        setScreen('splash');
        return true;
      }
      if (screen === 'register') {
        setScreen('login');
        return true;
      }
      if (screen === 'forgot') {
        setScreen('login');
        return true;
      }
      if (screen === 'customer-signup') {
        setScreen('customer-login');
        return true;
      }
      if (screen === 'splash') {
        setIntroStep('lang');
        setScreen('intro');
        return true;
      }
      if (screen === 'intro' && introStep === 'lang') {
        setIntroStep('walk');
        return true;
      }
      if (screen === 'post-location') {
        setScreen('post-areas');
        return true;
      }
      if (screen === 'post-areas') {
        setScreen('post-verify');
        return true;
      }
      if (screen === 'customer-main') {
        return false;
      }
      if (screen !== 'main' || tab === 'home') return false;
      const parent = {
        campaign: 'campaigns', payments: 'earnings', refer: 'profile', notifications: notificationsBack,
        verification: 'profile', vehicle: 'profile', 'change-vehicle': vehicleBack.current, areas: 'profile', tshirt: 'profile', language: 'profile',
      }[tab];
      setTab(parent || 'home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [screen, tab, notificationsBack, introStep]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const renderTab = () => {
    switch (tab) {
      case 'earnings':
        return <EarningsScreen rider={rider} earnings={earnings} onBack={goHome} onViewAll={() => setTab('payments')} onEditUpi={() => setTab('profile')} onChanged={refreshData} />;
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
        return (
          <ProfileScreen
            rider={rider}
            onBack={goHome}
            supportUnread={supportUnread}
            onOpenSupport={() => openSupport(null)}
            onLogout={logout}
            onProfileChanged={refreshData}
            onAccountDeleted={handleAccountDeleted}
            onNavigate={(target) => {
              if (target === 'notifications') return openNotifications('profile');
              if (target === 'change-vehicle') vehicleBack.current = 'profile';
              return setTab(target);
            }}
            unreadCount={unreadCount}
          />
        );
      case 'verification':
        return <VerificationStatus riderStatus={rider.status} vehicleCategory={rider.vehicle_category} title="Verification Status" onBack={() => setTab('profile')} />;
      case 'vehicle':
        return (
          <VerificationStatus
            riderStatus={rider.status}
            vehicleCategory={rider.vehicle_category}
            title="My Vehicle"
            vehicle={{ category: vehicleCategoryLabel(rider.vehicle_category), model: rider.vehicle, number: rider.vehicle_number }}
            onBack={() => setTab('profile')}
            onChangeVehicle={() => {
              vehicleBack.current = 'vehicle';
              setTab('change-vehicle');
            }}
          />
        );
      case 'change-vehicle':
        return (
          <ChangeVehicleScreen
            rider={rider}
            onBack={() => setTab(vehicleBack.current)}
            onSaved={async () => {
              await refreshData();
              setTab(vehicleBack.current);
            }}
          />
        );
      case 'areas':
        return <WorkingAreasScreen onBack={() => setTab('profile')} saveLabel="Save" onSaved={() => { refreshData(); setTab('profile'); }} />;
      case 'tshirt':
        return <TshirtScreen campaigns={campaigns} onBack={() => setTab('profile')} onOpenCampaign={openCampaign} />;
      case 'language':
        return <LanguageScreen onDone={() => setTab('profile')} onBack={() => setTab('profile')} />;
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
        return (
          <CampaignsScreen
            data={campaigns}
            onOpen={openCampaign}
            onBack={goHome}
            onChanged={refreshData}
            locationState={locationState}
            deviceLocation={deviceLocation}
            onRequestLocation={locationAction}
          />
        );
      case 'campaign':
        return <CampaignDetailScreen key={campaignId} campaignId={campaignId} locationParams={activeLocationRef.current} onBack={() => setTab('campaigns')} onChanged={refreshData} />;
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
            deviceLocation={deviceLocation}
            locationState={locationState}
            onRequestLocation={locationAction}
          />
        );
    }
  };

  const isSplash = screen === 'splash';
  const isBoot = screen === 'loading';

  return (
    // In the main app the tab bar pads for the bottom inset itself, so it reaches the screen edge.
    <SafeAreaView
      style={[styles.safeArea, isBoot && { backgroundColor: '#F3F3F3' }]}
      edges={screen === 'main' || screen === 'customer-main' ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
    >
      <StatusBar barStyle={isBoot ? 'dark-content' : colors.statusBar} />

      {screen === 'loading' && <BootSplash />}

      {screen === 'intro' && (introStep === 'walk' ? <Walkthrough onDone={() => (languageChosen ? setScreen('splash') : setIntroStep('lang'))} /> : <LanguageScreen onDone={() => setScreen('splash')} onBack={() => setIntroStep('walk')} />)}

      {isSplash && (
        <RoleScreen
          onBack={() => {
            setIntroStep('lang');
            setScreen('intro');
          }}
          onRider={() => {
            setLoginWithOtp(false);
            setScreen('login');
          }}
          onBrand={() => setScreen('customer-login')}
        />
      )}

      {screen === 'login' && (
        <LoginScreen
          initialOtpMode={loginWithOtp}
          onBack={() => setScreen('splash')}
          onLoggedIn={handleLoggedIn}
          onRegister={() => setScreen('register')}
          onCustomerLogin={() => setScreen('customer-login')}
          onForgot={(phone) => {
            setForgotFor(phone || '');
            setForgotReturnScreen('login');
            setScreen('forgot');
          }}
        />
      )}

      {screen === 'customer-login' && (
        <LoginScreen
          brand
          onBack={() => setScreen('splash')}
          onLoggedIn={handleLoggedIn}
          onRegister={() => setScreen('customer-signup')}
          onForgot={(phoneOrEmail) => {
            setForgotFor(phoneOrEmail || '');
            setForgotReturnScreen('customer-login');
            setScreen('forgot');
          }}
        />
      )}

      {screen === 'customer-signup' && (
        <CustomerSignupScreen
          onBack={() => setScreen('customer-login')}
          onSignedUp={handleCustomerLoggedIn}
          onOpenLogin={() => setScreen('customer-login')}
        />
      )}

      {screen === 'customer-main' && (
        <CustomerApp onLogout={logout} />
      )}

      {screen === 'forgot' && (
        <ForgotPasswordScreen
          initialIdentifier={forgotFor}
          onBack={() => setScreen(forgotReturnScreen)}
          onDone={() => setScreen(forgotReturnScreen)}
          onLoggedIn={handleLoggedIn}
          onUseOtp={
            forgotReturnScreen === 'login'
              ? () => {
                  setLoginWithOtp(true);
                  setScreen('login');
                }
              : null
          }
        />
      )}

      {screen === 'change-password' && (
        <ChangePasswordScreen
          onLogout={logout}
          onChanged={async () => {
            await refreshData();
            setTab('home');
            setScreen('main');
          }}
        />
      )}

      {screen === 'terms' && (
        <TermsConsentScreen
          consent={consent}
          onLogout={logout}
          onAccepted={async () => {
            setConsent(null);
            await refreshData();
            setTab('home');
            setScreen('main');
          }}
        />
      )}

      {screen === 'register' && (
        <RiderSignup onBack={() => setScreen('login')} onLogin={() => setScreen('login')} onRegistered={handleRegistered} initialReferralCode={referralCode} />
      )}

      {screen === 'post-verify' && (
        <VerificationStatus
          riderStatus={rider.status}
          vehicleCategory={rider.vehicle_category}
          onContinue={() => setScreen('post-areas')}
          continueLabel="Continue"
        />
      )}

      {screen === 'post-areas' && <WorkingAreasScreen onBack={() => setScreen('post-verify')} onSaved={() => setScreen('post-location')} />}

      {screen === 'post-location' && (
        <LocationPrompt
          onBack={() => setScreen('post-areas')}
          onAllow={() => {
            setScreen('main');
            refreshLocation(true);
          }}
          onSkip={() => {
            setScreen('main');
            setLocationState('DENIED');
          }}
        />
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
                    {translate(t.label)}
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
        <LanguageProvider>
          <RiderApp />
        </LanguageProvider>
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
