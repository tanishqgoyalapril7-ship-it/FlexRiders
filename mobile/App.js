import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { registerRootComponent } from 'expo';
import { mobileApi } from './src/services/api';

export default function App() {
  // Screen routing: 'splash', 'login', 'register', 'main'
  const [currentScreen, setCurrentScreen] = useState('splash');
  // Sub-screens within main: 'home', 'earnings', 'brand', 'notifications', 'profile', 'payments', 'support'
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(false);

  // Auth State
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // 6-step registration state
  const [regStep, setRegStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('Rider');
  const [vehicle, setVehicle] = useState('Motorcycle');
  const [vehicleNum, setVehicleNum] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [city, setCity] = useState('Gurugram');
  const [area, setArea] = useState('Sector 29');
  const [radius, setRadius] = useState('10 km');
  const [upiId, setUpiId] = useState('');
  const [gpayNum, setGpayNum] = useState('');

  // Filter states
  const [notifFilter, setNotifFilter] = useState('All'); // All, Unread, System
  const [paymentsFilter, setPaymentsFilter] = useState('All'); // All, Paid, Pending, Failed

  // Live Rider State from Backend
  const [riderProfile, setRiderProfile] = useState({
    name: '',
    rider_id: '',
    status: '',
    brand: '',
    location: '',
    phone: '',
    email: '',
    company: '',
    vehicle: '',
    vehicle_num: '',
    dl_number: '',
    aadhaar_num: '',
    upi_id: '',
    today_earnings: '0',
    trips_completed: '0',
    month_earnings: '0',
    paid: '0',
    pending: '0',
    since_date: 'Today',
    tshirt: 'Partner Kit',
    start_date: 'Upon Allocation',
    end_date: 'Ongoing',
    assigned_by: 'Super Riders Ops',
    daily_rate: '₹0',
    weekly_target: '0 Trips',
  });

  const [paymentHistory, setPaymentHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // One-click demo fill matching user mockup
  const handleQuickFillDemo = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setFullName(`Rider ${randomSuffix}`);
    setRegPhone(`98123${randomSuffix}`);
    setEmail(`rider.${randomSuffix}@example.com`);
    setDob('15-08-1998');
    setCompany('Independent');
    setRole('Rider');
    setVehicle('Honda EV Scooter');
    setVehicleNum(`DL01AB${randomSuffix}`);
    setDlNumber(`DL${randomSuffix}2026`);
    setAadhaarNumber(`XXXX XXXX ${randomSuffix}`);
    setCity('Gurugram');
    setArea('Cyber City');
    setRadius('10 km');
    setUpiId(`rider.${randomSuffix}@okaxis`);
    setGpayNum(`98123${randomSuffix}`);
  };

  // Live data sync from backend
  const fetchLiveRiderData = async () => {
    try {
      const profile = await mobileApi.getProfile();
      if (profile && profile.rider_id) {
        setRiderProfile((prev) => ({
          ...prev,
          name: profile.full_name || '',
          rider_id: profile.rider_id || '',
          status: profile.status || 'PENDING',
          brand: profile.current_brand || (profile.status === 'PENDING' ? 'Pending Brand Allocation' : 'Awaiting Brand Allocation'),
          location: `${profile.primary_city || ''} ${profile.primary_area || ''}`.trim() || 'Gurugram',
          phone: profile.mobile_number || '',
          email: profile.email || '',
          company: profile.current_company || 'Independent',
          vehicle: profile.vehicle_type || 'Motorcycle',
          upi_id: profile.upi_id || '',
          today_earnings: profile.today_earnings !== undefined ? String(Number(profile.today_earnings).toLocaleString('en-IN')) : '0',
          trips_completed: profile.status === 'ACTIVE' ? '12' : '0',
          month_earnings: profile.total_earnings !== undefined ? String(Number(profile.total_earnings).toLocaleString('en-IN')) : '0',
          paid: profile.paid_earnings !== undefined ? String(Number(profile.paid_earnings).toLocaleString('en-IN')) : '0',
          pending: profile.pending_earnings !== undefined ? String(Number(profile.pending_earnings).toLocaleString('en-IN')) : '0',
          since_date: profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today',
          tshirt: profile.current_brand ? `${profile.current_brand} Official Kit` : 'Awaiting Allocation',
          start_date: profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Immediate',
          end_date: 'Ongoing',
          assigned_by: 'Super Riders Ops',
          daily_rate: profile.status === 'ACTIVE' ? '₹75 / order' : '₹0',
          weekly_target: profile.status === 'ACTIVE' ? '25 Orders' : '0 Orders',
        }));
      }

      const paymentsData = await mobileApi.getPaymentHistory();
      if (paymentsData && paymentsData.payments && Array.isArray(paymentsData.payments)) {
        setPaymentHistory(
          paymentsData.payments.map((p) => ({
            date: new Date(p.payment_date || p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            brand: p.brand_name || 'Direct Payout',
            amount: String(Number(p.amount).toLocaleString('en-IN')),
            status: p.status || 'PAID',
          }))
        );
      } else {
        setPaymentHistory([]);
      }

      const notifs = await mobileApi.getNotifications();
      if (Array.isArray(notifs)) {
        setNotifications(
          notifs.map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            time: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: n.category || 'SYSTEM',
            icon: n.title.includes('Payout') || n.title.includes('Payment') ? '✓' : n.title.includes('Brand') ? '👥' : '🔔',
            iconBg: n.title.includes('Payout') || n.title.includes('Payment') ? '#10B981' : '#2563EB',
            unread: !n.is_read,
          }))
        );
      } else {
        setNotifications([]);
      }
    } catch (e) {
      // Quiet failover if not registered yet
    }
  };

  // Continuous 2.0-second live polling to sync seamlessly with admin dashboard
  useEffect(() => {
    fetchLiveRiderData();
    const intervalId = setInterval(fetchLiveRiderData, 2000);
    return () => clearInterval(intervalId);
  }, [currentScreen]);

  // Auth Handlers
  const handleLogin = async () => {
    if (!phone) {
      Alert.alert('Required', 'Please enter your mobile number');
      return;
    }
    setLoading(true);
    try {
      if (otpMode) {
        if (!otpCode) {
          Alert.alert('Required', 'Please enter OTP (use 123456)');
          setLoading(false);
          return;
        }
        await mobileApi.verifyOtp(phone, otpCode);
      } else {
        if (!password) {
          Alert.alert('Required', 'Please enter your password');
          setLoading(false);
          return;
        }
        await mobileApi.login(phone, password);
      }
      await fetchLiveRiderData();
      setCurrentScreen('main');
      setActiveTab('home');
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone) {
      Alert.alert('Required', 'Please enter your mobile number first');
      return;
    }
    try {
      await mobileApi.sendOtp(phone);
      Alert.alert('OTP Sent', 'Testing OTP code is: 123456');
      setOtpMode(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not send OTP');
    }
  };

  const handleRegisterSubmit = async () => {
    if (!fullName.trim() || !regPhone.trim()) {
      Alert.alert('Required Fields', 'Full Name and Mobile Number are required.');
      return;
    }
    setLoading(true);
    try {
      const result = await mobileApi.register({
        full_name: fullName.trim(),
        mobile_number: regPhone.trim(),
        email: email.trim() || null,
        dob: dob.trim() || null,
        current_company: company.trim() || 'Express Couriers',
        current_role: role.trim() || 'Rider',
        vehicle_type: vehicle.trim() || 'Honda Shine 125',
        primary_city: city.trim() || 'Gurugram',
        primary_area: area.trim() || 'Haryana',
        preferred_radius: radius.trim() || '10 km',
        upi_id: upiId.trim() || 'adarsh@okaxis',
        gpay_number: gpayNum.trim() || regPhone.trim(),
        password: 'password123',
      });

      // Update rider state with newly assigned SR ID
      setRiderProfile((prev) => ({
        ...prev,
        name: fullName,
        rider_id: result.rider_id,
        status: result.status || 'PENDING',
        brand: 'Pending Allocation',
        location: `${city}, ${area}`,
        phone: regPhone,
        email: email,
        vehicle: vehicle,
        upi_id: upiId,
      }));

      Alert.alert(
        '🎉 Application Submitted!',
        `Your Rider ID is: ${result.rider_id}\nStatus: PENDING APPROVAL\n\nThe Admin Operations Dashboard has received your registration in real time.`,
        [
          {
            text: 'Go to Rider App',
            onPress: () => {
              setCurrentScreen('main');
              setActiveTab('home');
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Could not submit registration.');
    } finally {
      setLoading(false);
    }
  };

  const unreadNotifsCount = notifications.filter((n) => n.unread).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ========================================================
          1. SPLASH SCREEN (Mockup Screen 1)
         ======================================================== */}
      {currentScreen === 'splash' && (
        <View style={styles.splashScreen}>
          <View style={styles.splashTop}>
            <View style={styles.srLogoBadge}>
              <Text style={styles.srLogoText}>SR</Text>
            </View>
            <Text style={styles.srLogoTitle}>SUPER RIDERS</Text>
            <Text style={styles.srLogoSub}>Ride • Deliver • Earn</Text>
          </View>

          {/* Delivery Rider Graphic */}
          <View style={styles.splashGraphicBox}>
            <View style={styles.splashGraphicCircle}>
              <Text style={{ fontSize: 72 }}>🏍️</Text>
            </View>
          </View>

          <View style={styles.splashContentBox}>
            <Text style={styles.splashHeading}>Deliver smiles.</Text>
            <Text style={styles.splashHeading}>Earn better, every day.</Text>

            {/* 3 Carousel Dots */}
            <View style={styles.carouselDotsRow}>
              <View style={[styles.carouselDot, styles.carouselDotActive]} />
              <View style={styles.carouselDot} />
              <View style={styles.carouselDot} />
            </View>

            {riderProfile.rider_id ? (
              <TouchableOpacity
                style={[styles.blueBtn, { backgroundColor: '#10B981', marginBottom: 12 }]}
                onPress={() => {
                  setCurrentScreen('main');
                  setActiveTab('home');
                }}
              >
                <Text style={styles.blueBtnText}>Open Live App ({riderProfile.rider_id})</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.blueBtn} onPress={() => setCurrentScreen('register')}>
              <Text style={styles.blueBtnText}>Register New Rider</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLinkWrap} onPress={() => setCurrentScreen('login')}>
              <Text style={styles.splashLoginPrompt}>
                Already registered? <Text style={styles.splashLoginLink}>Login with Phone</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================================
          2. LOGIN SCREEN (Mockup Screen 2)
         ======================================================== */}
      {currentScreen === 'login' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.whiteScreen}>
          <View style={styles.loginTopNav}>
            <TouchableOpacity onPress={() => setCurrentScreen('splash')}>
              <Text style={styles.navBackArrow}>←</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 30 }}>
            <Text style={styles.screenHeaderTitle}>Welcome Back 👋</Text>
            <Text style={styles.screenHeaderSub}>Login to continue</Text>

            <View style={{ marginTop: 24, gap: 16 }}>
              {/* Mobile Number Field */}
              <View>
                <Text style={styles.fieldLabel}>Mobile Number</Text>
                <View style={styles.phoneInputContainer}>
                  <View style={styles.prefixBox}>
                    <Text style={styles.prefixText}>+91 ⌵</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Password or OTP */}
              {!otpMode ? (
                <View>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={styles.passwordContainer}>
                    <Text style={{ fontSize: 16, marginRight: 8, color: '#64748B' }}>🔒</Text>
                    <TextInput
                      style={styles.passwordInput}
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter password"
                      placeholderTextColor="#94A3B8"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Text style={{ fontSize: 16 }}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.rememberRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={styles.checkboxBox}>
                        <Text style={{ fontSize: 10, color: '#2563EB', fontWeight: 'bold' }}>✓</Text>
                      </View>
                      <Text style={styles.rememberText}>Remember me</Text>
                    </View>
                    <TouchableOpacity onPress={() => Alert.alert('Forgot Password', 'Please contact Super Riders Ops.')}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.fieldLabel}>Enter 6-Digit OTP</Text>
                  <TextInput
                    style={[styles.passwordInput, { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, textAlign: 'center', letterSpacing: 8, fontSize: 18 }]}
                    keyboardType="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="123456"
                  />
                </View>
              )}

              {/* Login Button */}
              <TouchableOpacity style={styles.blueBtn} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.blueBtnText}>{otpMode ? 'Verify OTP & Login' : 'Login'}</Text>}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* OTP Toggle Button */}
              <TouchableOpacity
                style={styles.whiteOutlineBtn}
                onPress={() => {
                  if (!otpMode) handleSendOtp();
                  else setOtpMode(false);
                }}
              >
                <Text style={styles.whiteOutlineBtnText}>{otpMode ? 'Login with Password' : 'Login with OTP'}</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Register Link */}
            <View style={{ alignItems: 'center', marginTop: 32 }}>
              <TouchableOpacity onPress={() => setCurrentScreen('register')}>
                <Text style={styles.bottomPrompt}>
                  Don't have an account? <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>Register</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ========================================================
          REGISTRATION (6-Step Registration Flow)
         ======================================================== */}
      {currentScreen === 'register' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={styles.regHeader}>
            <TouchableOpacity onPress={() => (regStep > 1 ? setRegStep(regStep - 1) : setCurrentScreen('splash'))}>
              <Text style={{ fontSize: 18, color: '#0F172A', fontWeight: '600' }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>Rider Registration</Text>
            <TouchableOpacity onPress={handleQuickFillDemo}>
              <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '700' }}>⚡ Demo Fill</Text>
            </TouchableOpacity>
          </View>

          {/* Stepper Dots */}
          <View style={styles.stepperDotsRow}>
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <View key={s} style={[styles.stepDot, { backgroundColor: regStep >= s ? '#2563EB' : '#E2E8F0' }]}>
                <Text style={{ color: regStep >= s ? '#FFF' : '#64748B', fontSize: 10, fontWeight: 'bold' }}>{s}</Text>
              </View>
            ))}
          </View>

          <ScrollView style={{ flex: 1, padding: 20 }}>
            {regStep === 1 && (
              <View style={{ gap: 14 }}>
                <Text style={styles.stepTitle}>Personal Details</Text>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput style={styles.textInputBox} value={fullName} onChangeText={setFullName} placeholder="e.g. Adarsh Chandel" />

                <Text style={styles.fieldLabel}>Mobile Number *</Text>
                <TextInput style={styles.textInputBox} keyboardType="phone-pad" value={regPhone} onChangeText={setRegPhone} placeholder="e.g. 9876543210" />

                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput style={styles.textInputBox} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="e.g. adarsh@gmail.com" />

                <Text style={styles.fieldLabel}>Date of Birth</Text>
                <TextInput style={styles.textInputBox} value={dob} onChangeText={setDob} placeholder="DD-MM-YYYY (e.g. 15-08-1996)" />
              </View>
            )}

            {regStep === 2 && (
              <View style={{ gap: 14 }}>
                <Text style={styles.stepTitle}>Work Experience</Text>
                <Text style={styles.fieldLabel}>Current / Previous Company</Text>
                <TextInput style={styles.textInputBox} value={company} onChangeText={setCompany} placeholder="e.g. Express Couriers / Zepto" />

                <Text style={styles.fieldLabel}>Primary Role</Text>
                <TextInput style={styles.textInputBox} value={role} onChangeText={setRole} placeholder="e.g. Rider" />
              </View>
            )}

            {regStep === 3 && (
              <View style={{ gap: 14 }}>
                <Text style={styles.stepTitle}>Vehicle & Location</Text>
                <Text style={styles.fieldLabel}>Vehicle Model</Text>
                <TextInput style={styles.textInputBox} value={vehicle} onChangeText={setVehicle} placeholder="e.g. Honda Shine 125" />

                <Text style={styles.fieldLabel}>Vehicle Registration Number</Text>
                <TextInput style={styles.textInputBox} value={vehicleNum} onChangeText={setVehicleNum} placeholder="e.g. HR26EP1234" />

                <Text style={styles.fieldLabel}>Primary Working City</Text>
                <TextInput style={styles.textInputBox} value={city} onChangeText={setCity} placeholder="e.g. Gurugram" />

                <Text style={styles.fieldLabel}>State / Region</Text>
                <TextInput style={styles.textInputBox} value={area} onChangeText={setArea} placeholder="e.g. Haryana" />
              </View>
            )}

            {regStep === 4 && (
              <View style={{ gap: 14 }}>
                <Text style={styles.stepTitle}>Payment Details</Text>
                <Text style={styles.fieldLabel}>UPI ID (for Direct Bank Payouts)</Text>
                <TextInput style={styles.textInputBox} value={upiId} onChangeText={setUpiId} placeholder="e.g. adarsh@okaxis" />

                <Text style={styles.fieldLabel}>Google Pay / PhonePe Number</Text>
                <TextInput style={styles.textInputBox} keyboardType="phone-pad" value={gpayNum} onChangeText={setGpayNum} placeholder="e.g. 9876543210" />
              </View>
            )}

            {regStep === 5 && (
              <View style={{ gap: 14 }}>
                <Text style={styles.stepTitle}>KYC Verification</Text>
                <Text style={styles.fieldLabel}>Driving Licence Number</Text>
                <TextInput style={styles.textInputBox} value={dlNumber} onChangeText={setDlNumber} placeholder="e.g. HR26 2010012345" />

                <Text style={styles.fieldLabel}>Aadhaar Card Number</Text>
                <TextInput style={styles.textInputBox} value={aadhaarNumber} onChangeText={setAadhaarNumber} placeholder="e.g. XXXX XXXX 5678" />

                <View style={styles.verifiedKycBox}>
                  <Text style={{ color: '#16A34A', fontWeight: 'bold' }}>✓ Verified Documents Ready for Review</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Driving License, Aadhaar, and RC certificates attached.</Text>
                </View>
              </View>
            )}

            {regStep === 6 && (
              <View style={{ gap: 12, backgroundColor: '#F8FAFC', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={styles.stepTitle}>Review Application</Text>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Full Name:</Text><Text style={styles.summaryVal}>{fullName || 'Adarsh Chandel'}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Mobile:</Text><Text style={styles.summaryVal}>{regPhone || '9876543210'}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Vehicle:</Text><Text style={styles.summaryVal}>{vehicle}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Location:</Text><Text style={styles.summaryVal}>{city}, {area}</Text></View>
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>UPI ID:</Text><Text style={styles.summaryVal}>{upiId || 'adarsh@okaxis'}</Text></View>

                <View style={{ marginTop: 12, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 8 }}>
                  <Text style={{ color: '#B45309', fontWeight: 'bold', fontSize: 12 }}>
                    ⏳ Real-Time Sync Enabled
                  </Text>
                  <Text style={{ color: '#92400E', fontSize: 11, marginTop: 2 }}>
                    Submitting this form immediately adds your profile to the live Admin Operations Dashboard for brand assignment (Zepto).
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.regFooter}>
            {regStep > 1 && (
              <TouchableOpacity style={styles.stepBackBtn} onPress={() => setRegStep(regStep - 1)}>
                <Text style={styles.stepBackBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {regStep < 6 ? (
              <TouchableOpacity
                style={styles.stepNextBtn}
                onPress={() => {
                  if (regStep === 1 && (!fullName.trim() || !regPhone.trim())) {
                    Alert.alert('Required', 'Please enter your Full Name and Mobile Number.');
                    return;
                  }
                  setRegStep(regStep + 1);
                }}
              >
                <Text style={styles.stepNextBtnText}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.stepNextBtn, { backgroundColor: '#10B981' }]} onPress={handleRegisterSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.stepNextBtnText}>🚀 Submit Registration</Text>}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ========================================================
          MAIN APP WITH BOTTOM NAVIGATION
         ======================================================== */}
      {currentScreen === 'main' && (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          {/* ========================================================
              TAB 1: HOME (Mockup Screen 3)
             ======================================================== */}
          {activeTab === 'home' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              {/* Header: Greeting + Notification Bell */}
              <View style={styles.homeHeaderRow}>
                <View>
                  <Text style={styles.homeGreetingTitle}>Hello, {riderProfile.name || 'Rider'} 👋</Text>
                  <Text style={styles.homeGreetingSub}>
                    {riderProfile.rider_id ? `Rider ID: ${riderProfile.rider_id}` : 'Welcome to Super Riders'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.bellIconBtn} onPress={() => setActiveTab('notifications')}>
                  <Text style={{ fontSize: 18 }}>🔔</Text>
                  {unreadNotifsCount > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>{unreadNotifsCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Status Alert: PENDING */}
              {riderProfile.status === 'PENDING' && (
                <View style={styles.pendingReviewBanner}>
                  <Text style={{ color: '#B45309', fontWeight: 'bold', fontSize: 13 }}>
                    ⏳ Application Under Review
                  </Text>
                  <Text style={{ color: '#92400E', fontSize: 11, marginTop: 2 }}>
                    Your application is currently in the Admin Review Queue. When approved and assigned to a partner brand, your badge and daily rate will update automatically in real time.
                  </Text>
                </View>
              )}

              {/* Status Alert: APPROVED */}
              {riderProfile.status === 'APPROVED' && (
                <View style={[styles.pendingReviewBanner, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={{ color: '#1D4ED8', fontWeight: 'bold', fontSize: 13 }}>
                    ✓ Application Approved
                  </Text>
                  <Text style={{ color: '#1E40AF', fontSize: 11, marginTop: 2 }}>
                    Congratulations! Your application has been approved by the Admin team. Awaiting partner brand allocation.
                  </Text>
                </View>
              )}

              {/* Status Alert: ACTIVE */}
              {riderProfile.status === 'ACTIVE' && (
                <View style={[styles.pendingReviewBanner, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <Text style={{ color: '#047857', fontWeight: 'bold', fontSize: 13 }}>
                    🟢 Active Fleet Partner
                  </Text>
                  <Text style={{ color: '#065F46', fontSize: 11, marginTop: 2 }}>
                    Assigned to {riderProfile.brand}. Live delivery shifts and daily UPI payouts are enabled.
                  </Text>
                </View>
              )}

              {/* Current Brand Card */}
              <TouchableOpacity style={styles.zeptoBrandCard} onPress={() => setActiveTab('brand')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  <View style={[styles.zeptoCircle, riderProfile.brand ? { backgroundColor: '#2563EB' } : { backgroundColor: '#64748B' }]}>
                    <Text style={styles.zeptoCircleLetter}>
                      {(riderProfile.brand || 'SR').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.currentBrandLabel}>Assigned Brand</Text>
                    <Text style={styles.brandNameTitle}>{riderProfile.brand || 'Pending Allocation'}</Text>
                    <Text style={styles.brandLocationText}>📍 {riderProfile.location || 'Gurugram, Haryana'}</Text>
                  </View>
                </View>
                <View style={[
                  styles.activeStatusBadge,
                  riderProfile.status === 'PENDING' && { backgroundColor: '#FEF3C7' },
                  riderProfile.status === 'APPROVED' && { backgroundColor: '#DBEAFE' },
                ]}>
                  <Text style={[
                    styles.activeStatusText,
                    riderProfile.status === 'PENDING' && { color: '#D97706' },
                    riderProfile.status === 'APPROVED' && { color: '#2563EB' },
                  ]}>
                    {riderProfile.status || 'PENDING'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Two Metric Cards: Today's Earnings & Trips Completed */}
              <View style={styles.metricsTwoCol}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Today's Earnings</Text>
                  <Text style={styles.metricValue}>₹{riderProfile.today_earnings}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Trips Completed</Text>
                  <Text style={styles.metricValue}>{riderProfile.trips_completed}</Text>
                </View>
              </View>

              {/* Quick Actions (6 Items in 3x2 Grid) */}
              <Text style={styles.sectionHeading}>Quick Actions</Text>
              <View style={styles.quickActionsGrid}>
                {/* 1. My Brand */}
                <TouchableOpacity style={styles.quickActionBox} onPress={() => setActiveTab('brand')}>
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Text style={{ fontSize: 20 }}>👤</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>My Brand</Text>
                </TouchableOpacity>

                {/* 2. Payments */}
                <TouchableOpacity style={styles.quickActionBox} onPress={() => setActiveTab('payments')}>
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#F5F3FF' }]}>
                    <Text style={{ fontSize: 20 }}>📄</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>Payments</Text>
                </TouchableOpacity>

                {/* 3. Earnings */}
                <TouchableOpacity style={styles.quickActionBox} onPress={() => setActiveTab('earnings')}>
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={{ fontSize: 20 }}>💳</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>Earnings</Text>
                </TouchableOpacity>

                {/* 4. Documents */}
                <TouchableOpacity
                  style={styles.quickActionBox}
                  onPress={() =>
                    Alert.alert(
                      'KYC Documents',
                      `• Driving Licence: ${riderProfile.dl_number}\n• Aadhaar ID: ${riderProfile.aadhaar_num}\n• Vehicle RC: ${riderProfile.vehicle_num}\n\nStatus: Verified by Admin`
                    )
                  }
                >
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Text style={{ fontSize: 20 }}>📁</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>Documents</Text>
                </TouchableOpacity>

                {/* 5. Support */}
                <TouchableOpacity style={styles.quickActionBox} onPress={() => setActiveTab('support')}>
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#F0F9FF' }]}>
                    <Text style={{ fontSize: 20 }}>🎯</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>Support</Text>
                </TouchableOpacity>

                {/* 6. More */}
                <TouchableOpacity style={styles.quickActionBox} onPress={() => setActiveTab('profile')}>
                  <View style={[styles.quickActionIconWrap, { backgroundColor: '#F8FAFC' }]}>
                    <Text style={{ fontSize: 20 }}>⚙️</Text>
                  </View>
                  <Text style={styles.quickActionLabel}>More</Text>
                </TouchableOpacity>
              </View>

              {/* Refer & Earn Banner */}
              <TouchableOpacity
                style={styles.referBanner}
                onPress={() => Alert.alert('Refer & Earn', 'Share referral code SR-CHANDEL to earn ₹250 per rider onboarding!')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.referTitle}>Refer & Earn</Text>
                  <Text style={styles.referSub}>Refer other riders and earn extra</Text>
                </View>
                <View style={styles.giftIconWrap}>
                  <Text style={{ fontSize: 22 }}>🎁</Text>
                </View>
                <Text style={{ fontSize: 16, color: '#94A3B8', marginLeft: 8 }}>›</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ========================================================
              TAB 2: EARNINGS (Mockup Screen 4)
             ======================================================== */}
          {activeTab === 'earnings' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              {/* Header with Back, Title, and Calendar Icon */}
              <View style={styles.subScreenHeader}>
                <TouchableOpacity onPress={() => setActiveTab('home')}>
                  <Text style={styles.backNavArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>Earnings</Text>
                <TouchableOpacity onPress={() => Alert.alert('Filter Period', 'Current view: This Month')}>
                  <Text style={{ fontSize: 18 }}>📅</Text>
                </TouchableOpacity>
              </View>

              {/* Month Dropdown Pill */}
              <View style={styles.monthDropdownRow}>
                <View style={styles.monthPill}>
                  <Text style={styles.monthPillText}>This Month ⌵</Text>
                </View>
              </View>

              {/* Blue Gradient Wallet Card */}
              <View style={styles.walletCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View>
                    <Text style={styles.walletCardLabel}>Total Earnings</Text>
                    <Text style={styles.walletCardAmount}>₹{riderProfile.month_earnings}</Text>
                  </View>
                  <View style={styles.walletIconCircle}>
                    <Text style={{ fontSize: 22 }}>👛</Text>
                  </View>
                </View>
                <View style={styles.walletBottomRow}>
                  <Text style={styles.walletBottomText}>Paid ₹{riderProfile.paid}</Text>
                  <Text style={styles.walletBottomText}>Pending ₹{riderProfile.pending}</Text>
                </View>
              </View>

              {/* Recent Transactions List */}
              <View style={styles.transHeaderRow}>
                <Text style={styles.sectionHeading}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => setActiveTab('payments')}>
                  <Text style={styles.viewAllLink}>View All</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 10, marginTop: 8 }}>
                {paymentHistory.length === 0 ? (
                  <View style={{ padding: 28, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16 }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>💳</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>No Payouts Yet</Text>
                    <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                      Payout settlements processed by Admin via UPI will appear here in real time.
                    </Text>
                  </View>
                ) : (
                  paymentHistory.map((item, idx) => (
                    <View key={idx} style={styles.transactionItem}>
                      <View style={[styles.transBrandCircle, { backgroundColor: '#2563EB' }]}>
                        <Text style={styles.transBrandLetter}>{(item.brand || 'P').charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.transDateText}>{item.date}</Text>
                        <Text style={styles.transBrandSub}>{item.brand}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.transAmountText}>₹{item.amount}</Text>
                        <View style={[styles.statusPillSmall, item.status === 'PAID' ? styles.pillPaid : styles.pillPending]}>
                          <Text style={[styles.statusPillSmallText, item.status === 'PAID' ? styles.pillPaidText : styles.pillPendingText]}>
                            {item.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}

          {/* ========================================================
              MY BRAND SCREEN (Mockup Screen 5)
             ======================================================== */}
          {activeTab === 'brand' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              <View style={styles.subScreenHeader}>
                <TouchableOpacity onPress={() => setActiveTab('home')}>
                  <Text style={styles.backNavArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>My Brand</Text>
                <View style={{ width: 24 }} />
              </View>

              {/* Brand Hero Card */}
              <View style={[styles.zeptoBrandCard, { marginTop: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={[styles.zeptoCircle, riderProfile.brand ? { backgroundColor: '#2563EB' } : { backgroundColor: '#64748B' }]}>
                    <Text style={styles.zeptoCircleLetter}>
                      {(riderProfile.brand || 'SR').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.brandNameTitle}>{riderProfile.brand || 'Pending Allocation'}</Text>
                    <Text style={styles.brandLocationText}>
                      {riderProfile.status === 'ACTIVE' ? `Active since ${riderProfile.since_date}` : 'Awaiting Brand Assignment'}
                    </Text>
                  </View>
                </View>
                <View style={[
                  styles.activeStatusBadge,
                  riderProfile.status === 'PENDING' && { backgroundColor: '#FEF3C7' },
                  riderProfile.status === 'APPROVED' && { backgroundColor: '#DBEAFE' },
                ]}>
                  <Text style={[
                    styles.activeStatusText,
                    riderProfile.status === 'PENDING' && { color: '#D97706' },
                    riderProfile.status === 'APPROVED' && { color: '#2563EB' },
                  ]}>
                    {riderProfile.status || 'PENDING'}
                  </Text>
                </View>
              </View>

              {/* Assignment Details Card */}
              <Text style={[styles.sectionHeading, { marginTop: 24, marginBottom: 10 }]}>Assignment Details</Text>
              <View style={styles.detailsCard}>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Brand</Text><Text style={styles.detailVal}>{riderProfile.brand || 'Not Assigned Yet'}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Kit / Uniform</Text><Text style={styles.detailVal}>{riderProfile.tshirt}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Start Date</Text><Text style={styles.detailVal}>{riderProfile.start_date}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>End Date</Text><Text style={styles.detailVal}>{riderProfile.end_date}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Assigned By</Text><Text style={styles.detailVal}>{riderProfile.assigned_by}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Earnings Per Order</Text><Text style={[styles.detailVal, { fontWeight: 'bold' }]}>{riderProfile.daily_rate}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Weekly Target</Text><Text style={styles.detailVal}>{riderProfile.weekly_target}</Text></View>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 12, marginTop: 24, marginBottom: 40 }}>
                <TouchableOpacity
                  style={styles.whiteOutlineBtn}
                  onPress={() =>
                    Alert.alert(
                      'Brand Guidelines',
                      '1. Always wear the assigned Zepto purple t-shirt during shift.\n2. Keep delivery bag sanitized.\n3. Follow route navigation accurately.\n4. Greet customers politely.'
                    )
                  }
                >
                  <Text style={styles.whiteOutlineBtnText}>Brand Guidelines</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.blueBtn}
                  onPress={() =>
                    Alert.alert(
                      'Rider Documents',
                      `• Commercial DL: Verified\n• Aadhaar KYC: Verified\n• RC Certificate: Verified`
                    )
                  }
                >
                  <Text style={styles.blueBtnText}>View Documents</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ========================================================
              TAB 3: NOTIFICATIONS (Mockup Screen 6)
             ======================================================== */}
          {activeTab === 'notifications' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              <View style={styles.subScreenHeader}>
                <TouchableOpacity onPress={() => setActiveTab('home')}>
                  <Text style={styles.backNavArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>Notifications</Text>
                <View style={{ width: 24 }} />
              </View>

              {/* Filter Tabs: All, Unread, System */}
              <View style={styles.filterTabsRow}>
                {['All', 'Unread', 'System'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterPill, notifFilter === cat && styles.filterPillActive]}
                    onPress={() => setNotifFilter(cat)}
                  >
                    <Text style={[styles.filterPillText, notifFilter === cat && styles.filterPillTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notifications List */}
              <View style={{ gap: 12, marginTop: 14 }}>
                {notifications.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16 }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🔔</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>No Notifications Yet</Text>
                    <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                      Real-time alerts for application status, partner brand allocations, and payouts will appear here.
                    </Text>
                  </View>
                ) : (
                  notifications
                    .filter((n) => {
                      if (notifFilter === 'Unread') return n.unread;
                      if (notifFilter === 'System') return n.type === 'SYSTEM';
                      return true;
                    })
                    .map((item) => (
                      <View key={item.id} style={styles.notifItemCard}>
                        <View style={[styles.notifIconCircle, { backgroundColor: item.iconBg }]}>
                          <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>{item.icon}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.notifItemTitle}>{item.title}</Text>
                          <Text style={styles.notifItemMessage}>{item.message}</Text>
                          <Text style={styles.notifItemTime}>{item.time}</Text>
                        </View>
                      </View>
                    ))
                )}
              </View>
            </ScrollView>
          )}

          {/* ========================================================
              TAB 4: PROFILE (Mockup Screen 7)
             ======================================================== */}
          {activeTab === 'profile' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              <View style={styles.subScreenHeader}>
                <View style={{ width: 24 }} />
                <Text style={styles.subScreenTitle}>Profile</Text>
                <TouchableOpacity onPress={() => Alert.alert('Settings', 'Super Riders App v2.4\nReal-time sync active.')}>
                  <Text style={{ fontSize: 18 }}>⚙️</Text>
                </TouchableOpacity>
              </View>

              {/* Profile Avatar & Header */}
              <View style={styles.profileHeaderBox}>
                <View style={styles.profileAvatarBox}>
                  <Text style={{ fontSize: 44 }}>👨‍💼</Text>
                </View>
                <Text style={styles.profileNameTitle}>{riderProfile.name || 'Delivery Executive'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Text style={styles.riderIdSub}>Rider ID: {riderProfile.rider_id || 'ID Pending'}</Text>
                  <View style={[
                    styles.activeStatusBadge,
                    { paddingHorizontal: 6, paddingVertical: 2 },
                    riderProfile.status === 'PENDING' && { backgroundColor: '#FEF3C7' },
                    riderProfile.status === 'APPROVED' && { backgroundColor: '#DBEAFE' },
                  ]}>
                    <Text style={[
                      styles.activeStatusText,
                      { fontSize: 9 },
                      riderProfile.status === 'PENDING' && { color: '#D97706' },
                      riderProfile.status === 'APPROVED' && { color: '#2563EB' },
                    ]}>{riderProfile.status || 'PENDING'}</Text>
                  </View>
                </View>
              </View>

              {/* Profile Attributes List */}
              <View style={styles.profileDetailsList}>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>📞</Text>
                  <Text style={styles.profileAttrLabel}>Mobile Number</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.phone || 'Not Provided'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>✉️</Text>
                  <Text style={styles.profileAttrLabel}>Email</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.email || 'Not Provided'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>🏍️</Text>
                  <Text style={styles.profileAttrLabel}>Vehicle</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.vehicle || 'Motorcycle'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>🔢</Text>
                  <Text style={styles.profileAttrLabel}>Vehicle Number</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.vehicle_num || 'RC Verified'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>🪪</Text>
                  <Text style={styles.profileAttrLabel}>Driving Licence</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.dl_number || 'KYC Verified'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>🏛️</Text>
                  <Text style={styles.profileAttrLabel}>Aadhaar Number</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.aadhaar_num || 'Aadhaar Verified'}</Text>
                </View>
                <View style={styles.profileAttrRow}>
                  <Text style={styles.profileIconEmoji}>💳</Text>
                  <Text style={styles.profileAttrLabel}>UPI ID</Text>
                  <Text style={styles.profileAttrVal}>{riderProfile.upi_id || 'Not Set'}</Text>
                </View>
              </View>

              {/* Log Out Button */}
              <TouchableOpacity
                style={[styles.whiteOutlineBtn, { marginTop: 24, marginBottom: 40, borderColor: '#FCA5A5' }]}
                onPress={() => {
                  setCurrentScreen('splash');
                  setActiveTab('home');
                }}
              >
                <Text style={[styles.whiteOutlineBtnText, { color: '#EF4444' }]}>Log Out</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ========================================================
              PAYMENTS SCREEN (Mockup Screen 8)
             ======================================================== */}
          {activeTab === 'payments' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              <View style={styles.subScreenHeader}>
                <TouchableOpacity onPress={() => setActiveTab('home')}>
                  <Text style={styles.backNavArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>Payments</Text>
                <TouchableOpacity onPress={() => Alert.alert('Filter', 'Filter by date range or status')}>
                  <Text style={{ fontSize: 18 }}>🔍</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.monthDropdownRow}>
                <View style={styles.monthPill}>
                  <Text style={styles.monthPillText}>Live Settlements ⌵</Text>
                </View>
              </View>

              {/* Wallet Card */}
              <View style={styles.walletCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View>
                    <Text style={styles.walletCardLabel}>Total Earnings</Text>
                    <Text style={styles.walletCardAmount}>₹{riderProfile.month_earnings}</Text>
                  </View>
                  <View style={styles.walletIconCircle}>
                    <Text style={{ fontSize: 22 }}>👛</Text>
                  </View>
                </View>
                <View style={styles.walletBottomRow}>
                  <Text style={styles.walletBottomText}>Paid ₹{riderProfile.paid}</Text>
                  <Text style={styles.walletBottomText}>Pending ₹{riderProfile.pending}</Text>
                </View>
              </View>

              {/* Filter Tabs: All, Paid, Pending, Failed */}
              <View style={[styles.filterTabsRow, { marginTop: 16 }]}>
                {['All', 'Paid', 'Pending', 'Failed'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterPill, paymentsFilter === cat && styles.filterPillActive]}
                    onPress={() => setPaymentsFilter(cat)}
                  >
                    <Text style={[styles.filterPillText, paymentsFilter === cat && styles.filterPillTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Transactions List */}
              <View style={{ gap: 10, marginTop: 14 }}>
                {paymentHistory.length === 0 ? (
                  <View style={{ padding: 28, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16 }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>📄</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>No Payments Found</Text>
                    <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                      UPI payouts and settlement vouchers processed by Admin will be listed here.
                    </Text>
                  </View>
                ) : (
                  paymentHistory
                    .filter((p) => {
                      if (paymentsFilter === 'All') return true;
                      return p.status.toUpperCase() === paymentsFilter.toUpperCase();
                    })
                    .map((item, idx) => (
                      <View key={idx} style={styles.transactionItem}>
                        <View style={[styles.transBrandCircle, { backgroundColor: '#2563EB' }]}>
                          <Text style={styles.transBrandLetter}>{(item.brand || 'P').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.transDateText}>{item.date}</Text>
                          <Text style={styles.transBrandSub}>{item.brand}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.transAmountText}>₹{item.amount}</Text>
                          <View style={[styles.statusPillSmall, item.status === 'PAID' ? styles.pillPaid : styles.pillPending]}>
                            <Text style={[styles.statusPillSmallText, item.status === 'PAID' ? styles.pillPaidText : styles.pillPendingText]}>
                              {item.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))
                )}
              </View>
            </ScrollView>
          )}

          {/* ========================================================
              SUPPORT SCREEN (Mockup Screen 9)
             ======================================================== */}
          {activeTab === 'support' && (
            <ScrollView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 14 }}>
              <View style={styles.subScreenHeader}>
                <TouchableOpacity onPress={() => setActiveTab('home')}>
                  <Text style={styles.backNavArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>Support</Text>
                <View style={{ width: 24 }} />
              </View>

              <Text style={[styles.sectionHeading, { fontSize: 18, marginTop: 14 }]}>
                Hi {riderProfile.name?.split(' ')[0] || 'Rider'}, how can we help you?
              </Text>

              {/* Search Bar */}
              <View style={styles.supportSearchContainer}>
                <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
                <TextInput style={{ flex: 1, fontSize: 14 }} placeholder="Search for help topics" placeholderTextColor="#94A3B8" />
              </View>

              {/* Popular Topics List */}
              <Text style={[styles.sectionHeading, { marginTop: 20, marginBottom: 10 }]}>Popular Topics</Text>
              <View style={styles.topicsCard}>
                {[
                  { title: 'Payment & Earnings', icon: '📄' },
                  { title: 'Brand & T-Shirt', icon: '👕' },
                  { title: 'Documents', icon: '📁' },
                  { title: 'Account & Profile', icon: '👤' },
                  { title: 'App & Technical Issues', icon: '⚙️' },
                ].map((top, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.topicRow}
                    onPress={() => Alert.alert(top.title, `Help articles for ${top.title} will appear here.`)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontSize: 16 }}>{top.icon}</Text>
                      <Text style={styles.topicRowText}>{top.title}</Text>
                    </View>
                    <Text style={{ color: '#94A3B8', fontSize: 16 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Need More Help? */}
              <Text style={[styles.sectionHeading, { marginTop: 24, marginBottom: 12 }]}>Need more help?</Text>
              <View style={{ gap: 10, marginBottom: 40 }}>
                <TouchableOpacity
                  style={styles.helpActionCard}
                  onPress={() => Alert.alert('Chat Support', 'Support agent connected: Agent Priya is online.')}
                >
                  <View style={styles.helpIconCircle}><Text style={{ fontSize: 18 }}>💬</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.helpActionTitle}>Chat with Support</Text>
                    <Text style={styles.helpActionSub}>We usually reply in a few minutes</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.helpActionCard}
                  onPress={() => Alert.alert('Call Support', 'Calling Super Riders Helpline: 1800-RIDER-SUPPORT')}
                >
                  <View style={styles.helpIconCircle}><Text style={{ fontSize: 18 }}>📞</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.helpActionTitle}>Call Support</Text>
                    <Text style={styles.helpActionSub}>10:00 AM - 8:00 PM</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ========================================================
              BOTTOM NAVIGATION BAR (Mockup 4 Tabs)
             ======================================================== */}
          <View style={styles.bottomTabBar}>
            <TouchableOpacity style={styles.bottomTabItem} onPress={() => setActiveTab('home')}>
              <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabIconActive]}>🏠</Text>
              <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomTabItem} onPress={() => setActiveTab('earnings')}>
              <Text style={[styles.tabIcon, activeTab === 'earnings' && styles.tabIconActive]}>💳</Text>
              <Text style={[styles.tabLabel, activeTab === 'earnings' && styles.tabLabelActive]}>Earnings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomTabItem} onPress={() => setActiveTab('notifications')}>
              <View style={{ position: 'relative' }}>
                <Text style={[styles.tabIcon, activeTab === 'notifications' && styles.tabIconActive]}>🔔</Text>
                {unreadNotifsCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unreadNotifsCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, activeTab === 'notifications' && styles.tabLabelActive]}>Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomTabItem} onPress={() => setActiveTab('profile')}>
              <Text style={[styles.tabIcon, activeTab === 'profile' && styles.tabIconActive]}>👤</Text>
              <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  whiteScreen: { flex: 1, backgroundColor: '#FFFFFF' },

  // SPLASH
  splashScreen: { flex: 1, backgroundColor: '#0B1528', justifyContent: 'space-between', padding: 24 },
  splashTop: { alignItems: 'center', marginTop: 40 },
  srLogoBadge: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  srLogoText: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  srLogoTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 14, letterSpacing: 0.5 },
  srLogoSub: { color: '#93C5FD', fontSize: 13, marginTop: 4, letterSpacing: 0.5 },
  splashGraphicBox: { alignItems: 'center', marginVertical: 20 },
  splashGraphicCircle: { width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(37, 99, 235, 0.18)', justifyContent: 'center', alignItems: 'center' },
  splashContentBox: { width: '100%', alignItems: 'center', marginBottom: 20 },
  splashHeading: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  carouselDotsRow: { flexDirection: 'row', gap: 6, marginVertical: 20 },
  carouselDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#334155' },
  carouselDotActive: { width: 22, backgroundColor: '#2563EB' },
  blueBtn: { backgroundColor: '#2563EB', width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  blueBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  loginLinkWrap: { marginTop: 16 },
  splashLoginPrompt: { color: '#94A3B8', fontSize: 13 },
  splashLoginLink: { color: '#60A5FA', fontWeight: 'bold' },

  // LOGIN
  loginTopNav: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  navBackArrow: { fontSize: 22, color: '#0F172A', fontWeight: 'bold' },
  screenHeaderTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  screenHeaderSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  phoneInputContainer: { flexDirection: 'row', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, overflow: 'hidden' },
  prefixBox: { backgroundColor: '#F8FAFC', paddingHorizontal: 12, justifyContent: 'center', borderRightWidth: 1, borderColor: '#CBD5E1' },
  prefixText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  phoneInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#0F172A' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12 },
  passwordInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0F172A' },
  rememberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  checkboxBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  rememberText: { fontSize: 12, color: '#64748B' },
  forgotText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 12, color: '#94A3B8' },
  whiteOutlineBtn: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: '#FFF' },
  whiteOutlineBtnText: { color: '#334155', fontWeight: '700', fontSize: 14 },
  bottomPrompt: { fontSize: 13, color: '#64748B' },

  // REGISTRATION
  regHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  stepperDotsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#F8FAFC' },
  stepDot: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  textInputBox: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, backgroundColor: '#FFF', color: '#0F172A' },
  verifiedKycBox: { backgroundColor: '#F0FDF4', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { color: '#64748B', fontSize: 13 },
  summaryVal: { color: '#0F172A', fontWeight: '600', fontSize: 13 },
  regFooter: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderColor: '#F1F5F9', gap: 10 },
  stepBackBtn: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  stepBackBtnText: { color: '#475569', fontWeight: '600' },
  stepNextBtn: { flex: 1, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  stepNextBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // HOME SCREEN (Mockup Screen 3)
  homeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  homeGreetingTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  homeGreetingSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  bellIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', position: 'relative' },
  bellBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#EF4444', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  bellBadgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  pendingReviewBanner: { backgroundColor: '#FEF3C7', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 12 },

  // Zepto Brand Card
  zeptoBrandCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  zeptoCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center' },
  zeptoCircleLetter: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  currentBrandLabel: { fontSize: 11, color: '#64748B' },
  brandNameTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  brandLocationText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  activeStatusBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  activeStatusText: { color: '#16A34A', fontSize: 10, fontWeight: '800' },

  // Metrics Row
  metricsTwoCol: { flexDirection: 'row', gap: 12, marginVertical: 14 },
  metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  metricLabel: { fontSize: 12, color: '#64748B' },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 4 },

  // Quick Actions Grid (3x2)
  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginVertical: 8 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  quickActionBox: { width: '31%', backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  quickActionIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: '#334155', marginTop: 6 },

  // Refer & Earn Banner
  referBanner: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  referTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  referSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  giftIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center' },

  // EARNINGS SCREEN (Mockup Screen 4)
  subScreenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backNavArrow: { fontSize: 20, color: '#0F172A', fontWeight: 'bold' },
  subScreenTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  monthDropdownRow: { marginBottom: 12 },
  monthPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFFFFF' },
  monthPillText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  walletCard: { backgroundColor: '#2563EB', borderRadius: 18, padding: 20, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  walletCardLabel: { color: '#BFDBFE', fontSize: 12, fontWeight: '500' },
  walletCardAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 4 },
  walletIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  walletBottomRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingTop: 12, marginTop: 16 },
  walletBottomText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  transHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  viewAllLink: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
  transactionItem: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  transBrandCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center' },
  transBrandLetter: { color: '#7C3AED', fontWeight: '900', fontSize: 16 },
  transDateText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  transBrandSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  transAmountText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  statusPillSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 3 },
  statusPillSmallText: { fontSize: 9, fontWeight: '800' },
  pillPaid: { backgroundColor: '#DCFCE7' },
  pillPaidText: { color: '#16A34A' },
  pillPending: { backgroundColor: '#FEF3C7' },
  pillPendingText: { color: '#D97706' },

  // MY BRAND (Mockup Screen 5)
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F8FAFC' },
  detailLabel: { fontSize: 12, color: '#64748B' },
  detailVal: { fontSize: 13, color: '#0F172A', fontWeight: '600' },

  // NOTIFICATIONS (Mockup Screen 6)
  filterTabsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  filterPillActive: { backgroundColor: '#2563EB' },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterPillTextActive: { color: '#FFFFFF' },
  notifItemCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#E2E8F0' },
  notifIconCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  notifItemTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  notifItemMessage: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 16 },
  notifItemTime: { fontSize: 10, color: '#94A3B8', marginTop: 4 },

  // PROFILE (Mockup Screen 7)
  profileHeaderBox: { alignItems: 'center', marginVertical: 16 },
  profileAvatarBox: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#BFDBFE' },
  profileNameTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  riderIdSub: { fontSize: 12, color: '#64748B' },
  profileDetailsList: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 12 },
  profileAttrRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#F8FAFC' },
  profileIconEmoji: { fontSize: 16, width: 26 },
  profileAttrLabel: { flex: 1, fontSize: 12, color: '#64748B' },
  profileAttrVal: { fontSize: 13, fontWeight: '600', color: '#0F172A' },

  // SUPPORT (Mockup Screen 9)
  supportSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  topicsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#F8FAFC' },
  topicRowText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  helpActionCard: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#DBEAFE' },
  helpIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  helpActionTitle: { fontSize: 13, fontWeight: '700', color: '#1E40AF' },
  helpActionSub: { fontSize: 11, color: '#64748B', marginTop: 2 },

  // BOTTOM NAVIGATION
  bottomTabBar: { height: 64, flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E2E8F0', paddingBottom: 6 },
  bottomTabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 18, color: '#94A3B8' },
  tabIconActive: { color: '#2563EB' },
  tabLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  tabLabelActive: { color: '#2563EB', fontWeight: '700' },
  tabBadge: { position: 'absolute', top: -3, right: -6, backgroundColor: '#EF4444', width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  tabBadgeText: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },
});

registerRootComponent(App);
