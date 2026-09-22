import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Bell,
  Home,
  CreditCard,
  User,
  Shield,
  Briefcase,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  Camera,
  FileText,
  HelpCircle,
  TrendingUp,
  Share2,
} from 'lucide-react';
import { api } from '../services/api';

export default function MobileSimulator({ onClose }) {
  // Screen states: 'splash', 'login', 'register', 'home', 'payments', 'profile', 'notifications'
  const [currentScreen, setCurrentScreen] = useState('home');
  const [activeTab, setActiveTab] = useState('home'); // bottom nav: home, payments, notifications, profile

  // Form states for login
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginWithOtpMode, setLoginWithOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Form state for 6-step registration (Clean state for live testing)
  const [regStep, setRegStep] = useState(1);
  const [regData, setRegData] = useState({
    full_name: '',
    mobile_number: '',
    email: '',
    dob: '',
    current_company: '',
    current_role: 'Rider',
    experience_years: 1,
    experience_months: 0,
    vehicle_type: 'Bike',
    primary_city: 'Gurugram',
    primary_area: '',
    preferred_radius: '10 km',
    upi_id: '',
    gpay_number: '',
  });
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  // Rider live profile & payments loaded from backend
  const [riderData, setRiderData] = useState({
    rider_id: '',
    full_name: 'Delivery Rider',
    mobile_number: '',
    email: '',
    company: '',
    role: 'Rider',
    vehicle: 'Bike',
    location: 'Gurugram',
    current_brand: 'Not Assigned Yet',
    status: 'PENDING',
    upi_id: '',
    today_earnings: 0,
    month_earnings: 0,
    paid_earnings: 0,
    pending_earnings: 0,
  });

  const [paymentsList, setPaymentsList] = useState([]);
  const [notificationsList, setNotificationsList] = useState([]);
  const [notifFilter, setNotifFilter] = useState('ALL');

  useEffect(() => {
    const syncSimulatorData = async () => {
      try {
        const [riders, payments, notifs] = await Promise.all([
          api.getRiders().catch(() => []),
          api.getPayments().catch(() => []),
          api.getNotifications().catch(() => []),
        ]);
        if (riders && riders.length > 0) {
          const latestRider = riders[0];
          const riderPayments = (payments || []).filter(p => p.rider_id === latestRider.id);
          setPaymentsList(riderPayments);
          setRiderData({
            rider_id: latestRider.rider_id,
            full_name: latestRider.full_name,
            mobile_number: latestRider.mobile_number,
            email: latestRider.email || '',
            company: latestRider.current_company || 'Independent',
            role: latestRider.current_role || 'Rider',
            vehicle: latestRider.vehicle_type || 'Bike',
            location: `${latestRider.primary_city || ''} ${latestRider.primary_area || ''}`.trim() || 'Gurugram',
            current_brand: latestRider.current_brand || (latestRider.status === 'PENDING' ? 'Pending Allocation' : 'Awaiting Brand'),
            status: latestRider.status || 'PENDING',
            upi_id: latestRider.upi_id || '',
            today_earnings: 0,
            month_earnings: latestRider.total_earnings || 0,
            paid_earnings: latestRider.paid_earnings || 0,
            pending_earnings: latestRider.pending_earnings || 0,
          });
        } else {
          setRiderData({
            rider_id: '',
            full_name: 'No Registered Rider',
            mobile_number: '',
            email: '',
            company: '',
            role: 'Rider',
            vehicle: 'Bike',
            location: 'Gurugram',
            current_brand: 'No Brand',
            status: 'PENDING',
            upi_id: '',
            today_earnings: 0,
            month_earnings: 0,
            paid_earnings: 0,
            pending_earnings: 0,
          });
          setPaymentsList([]);
        }
        if (notifs && Array.isArray(notifs)) {
          setNotificationsList(notifs.map(n => ({
            id: n.id,
            title: n.title,
            desc: n.message,
            time: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: n.category || 'SYSTEM',
            color: '#2563EB'
          })));
        }
      } catch (err) {
        // quiet fallback
      }
    };
    syncSimulatorData();
    const interval = setInterval(syncSimulatorData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickDemoFill = () => {
    const rnd = Math.floor(1000 + Math.random() * 9000);
    setRegData({
      full_name: 'Tanishq Sharma',
      mobile_number: `981234${rnd}`,
      email: `tanishq.${rnd}@example.com`,
      dob: '15-08-1998',
      current_company: 'Express Couriers',
      current_role: 'Rider',
      experience_years: 2,
      experience_months: 0,
      vehicle_type: 'Electric Bike',
      primary_city: 'Gurugram',
      primary_area: 'Cyber City Sector 24',
      preferred_radius: '10 km',
      upi_id: `tanishq.${rnd}@okaxis`,
      gpay_number: `981234${rnd}`,
    });
  };

  // Submit registration directly to live backend
  const handleRegisterSubmit = async () => {
    try {
      const payload = {
        ...regData,
        mobile_number: regData.mobile_number.replace(/\s+/g, ''),
        password: 'password123',
      };
      const res = await api.registerRider(payload);
      setRiderData((prev) => ({
        ...prev,
        rider_id: res.rider_id,
        full_name: regData.full_name,
        mobile_number: regData.mobile_number,
        location: `${regData.primary_city} ${regData.primary_area}`.trim(),
        status: res.status || 'PENDING',
        current_brand: 'Under Review',
      }));
      setRegSuccessMsg(`Application Submitted! Assigned ID: ${res.rider_id}. Your application is now in the Admin Review Queue.`);
      setTimeout(() => {
        setCurrentScreen('home');
        setActiveTab('home');
      }, 1800);
    } catch (e) {
      setRegSuccessMsg(`Registration notice: ${e.message || 'Submitted for review'}`);
      setTimeout(() => {
        setCurrentScreen('home');
        setActiveTab('home');
      }, 1800);
    }
  };

  const handleBottomNav = (tab) => {
    setActiveTab(tab);
    if (tab === 'home') setCurrentScreen('home');
    if (tab === 'payments') setCurrentScreen('payments');
    if (tab === 'notifications') setCurrentScreen('notifications');
    if (tab === 'profile') setCurrentScreen('profile');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 120 }}>
      {/* Device Wrapper */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '390px',
          height: '780px',
          backgroundColor: '#0F172A',
          borderRadius: '44px',
          padding: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Dynamic Island / Speaker Notch */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '110px',
            height: '24px',
            backgroundColor: '#000000',
            borderRadius: '20px',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1E293B', marginRight: '6px' }} />
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0F172A' }} />
        </div>

        {/* Close Button top-right outside phone */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-14px',
            right: '-14px',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >
          <X size={18} />
        </button>

        {/* Screen Viewport */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '34px',
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Status Bar */}
          <div
            style={{
              height: '42px',
              padding: '10px 20px 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.74rem',
              fontWeight: 700,
              color: currentScreen === 'splash' ? '#FFFFFF' : '#0F172A',
              backgroundColor: currentScreen === 'splash' ? 'transparent' : '#FFFFFF',
              zIndex: 50,
            }}
          >
            <span>9:41</span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem' }}>5G</span>
              <div style={{ width: '18px', height: '9px', border: '1px solid currentColor', borderRadius: '3px', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '1px', top: '1px', bottom: '1px', width: '12px', background: 'currentColor', borderRadius: '1.5px' }} />
              </div>
            </div>
          </div>

          {/* SCREEN 1: SPLASH */}
          {currentScreen === 'splash' && (
            <div
              style={{
                flex: 1,
                position: 'relative',
                background: 'linear-gradient(180deg, #0B1528 0%, #172554 60%, #1E3A8A 100%)',
                color: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <div style={{ marginTop: '50px' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 16px',
                    borderRadius: '16px',
                    background: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                    fontWeight: 900,
                    fontFamily: 'var(--font-display)',
                    boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4)',
                  }}
                >
                  SR
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.5px' }}>
                  SUPER RIDERS
                </h1>
                <p style={{ fontSize: '0.88rem', color: '#93C5FD', marginTop: '6px', fontWeight: 500 }}>
                  Ride • Deliver • Earn
                </p>
              </div>

              {/* Rider Bike Graphic */}
              <div style={{ margin: '20px 0', opacity: 0.9 }}>
                <div
                  style={{
                    width: '180px',
                    height: '180px',
                    margin: '0 auto',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bike size={90} color="#60A5FA" />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '12px', fontSize: '0.95rem' }}
                  onClick={() => setCurrentScreen('register')}
                >
                  Get Started
                </button>
                <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                  Already have an account?{' '}
                  <span
                    style={{ color: '#60A5FA', fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => setCurrentScreen('login')}
                  >
                    Login
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 2: LOGIN */}
          {currentScreen === 'login' && (
            <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textAlign: 'center', marginBottom: '28px', marginTop: '10px' }}>
                  <div style={{ width: '48px', height: '48px', margin: '0 auto 8px', borderRadius: '12px', background: '#2563EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.25rem' }}>
                    SR
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>Welcome Back</h2>
                  <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>Login to your account to continue</p>
                </div>

                {/* Mobile Input */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Mobile Number</label>
                  <div style={{ display: 'flex', border: '1px solid #CBD5E1', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 12px', background: '#F8FAFC', fontSize: '0.85rem', color: '#64748B', borderRight: '1px solid #CBD5E1', fontWeight: 600 }}>
                      +91
                    </div>
                    <input
                      type="tel"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="Enter mobile number"
                      style={{ flex: 1, border: 'none', padding: '10px 12px', outline: 'none', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>

                {!loginWithOtpMode ? (
                  /* Password Input */
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter password"
                        style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '10px 38px 10px 12px', outline: 'none', fontSize: '0.88rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* OTP Input */
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Enter 6-Digit OTP (Dev hint: 123456)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '10px 12px', outline: 'none', fontSize: '1rem', letterSpacing: '4px', textAlign: 'center', fontWeight: 700 }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '0.76rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                    <input type="checkbox" defaultChecked /> Remember me
                  </label>
                  <span style={{ color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Forgot password?</span>
                </div>

                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '12px' }}
                  onClick={() => {
                    setCurrentScreen('home');
                    setActiveTab('home');
                  }}
                >
                  Login
                </button>

                <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.76rem', margin: '8px 0' }}>or</div>

                <button
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '11px', borderRadius: '10px', fontSize: '0.84rem' }}
                  onClick={() => setLoginWithOtpMode(!loginWithOtpMode)}
                >
                  {loginWithOtpMode ? 'Login with Password' : 'Login with OTP'}
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748B' }}>
                Don't have an account?{' '}
                <span
                  style={{ color: '#2563EB', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setCurrentScreen('register')}
                >
                  Register
                </span>
              </div>
            </div>
          )}

          {/* SCREEN 3: 6-STEP REGISTRATION */}
          {currentScreen === 'register' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
              {/* Stepper Header */}
              <div style={{ padding: '12px 16px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setCurrentScreen('login')} style={{ color: '#0F172A' }}>
                      <ChevronLeft size={20} />
                    </button>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>Registration</span>
                  </div>
                  <button
                    onClick={handleQuickDemoFill}
                    style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 700, background: '#EFF6FF', padding: '4px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}
                  >
                    ⚡ Demo Fill
                  </button>
                </div>

                {/* 6 Step Progress Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <React.Fragment key={s}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: regStep >= s ? '#2563EB' : '#E2E8F0',
                          color: regStep >= s ? '#FFFFFF' : '#94A3B8',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {s}
                      </div>
                      {s < 6 && (
                        <div
                          style={{
                            flex: 1,
                            height: '2px',
                            background: regStep > s ? '#2563EB' : '#E2E8F0',
                            margin: '0 4px',
                          }}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B', textAlign: 'center', marginTop: '6px', fontWeight: 600 }}>
                  {regStep === 1 && 'Step 1: Personal Details'}
                  {regStep === 2 && 'Step 2: Work Information'}
                  {regStep === 3 && 'Step 3: Location Details'}
                  {regStep === 4 && 'Step 4: Payment UPI'}
                  {regStep === 5 && 'Step 5: Document Upload'}
                  {regStep === 6 && 'Step 6: Review & Submit'}
                </div>
              </div>

              {/* Step Forms */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {regSuccessMsg ? (
                  <div style={{ background: '#ECFDF5', padding: '20px', borderRadius: '12px', border: '1px solid #10B981', textAlign: 'center', marginTop: '40px' }}>
                    <CheckCircle size={40} color="#10B981" style={{ margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#065F46' }}>Registration Submitted!</h3>
                    <p style={{ fontSize: '0.82rem', color: '#047857', marginTop: '6px' }}>{regSuccessMsg}</p>
                  </div>
                ) : (
                  <>
                    {regStep === 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Avatar Picker Circle */}
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                          <div
                            style={{
                              width: '70px',
                              height: '70px',
                              borderRadius: '50%',
                              background: '#DBEAFE',
                              margin: '0 auto 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2563EB',
                              position: 'relative',
                            }}
                          >
                            <Camera size={26} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>Upload Profile Photo</span>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Full Name *</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.full_name}
                            onChange={(e) => setRegData({ ...regData, full_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Mobile Number *</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.mobile_number}
                            onChange={(e) => setRegData({ ...regData, mobile_number: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Email Address</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.email}
                            onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Date of Birth</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.dob}
                            onChange={(e) => setRegData({ ...regData, dob: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {regStep === 2 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Current Logistics Company</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.current_company}
                            onChange={(e) => setRegData({ ...regData, current_company: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Vehicle Type *</label>
                          <select
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.vehicle_type}
                            onChange={(e) => setRegData({ ...regData, vehicle_type: e.target.value })}
                          >
                            <option value="Bike">Motorcycle / Bike</option>
                            <option value="Scooter">Scooter / Activa</option>
                            <option value="Electric Bike">Electric Bike (EV)</option>
                            <option value="Other">Other Fleet</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Years of Experience</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.experience_years}
                            onChange={(e) => setRegData({ ...regData, experience_years: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    )}

                    {regStep === 3 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Primary Working City *</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.primary_city}
                            onChange={(e) => setRegData({ ...regData, primary_city: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Primary Working Area</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.primary_area}
                            onChange={(e) => setRegData({ ...regData, primary_area: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Preferred Radius</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.preferred_radius}
                            onChange={(e) => setRegData({ ...regData, preferred_radius: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {regStep === 4 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>UPI ID (for Direct Payouts) *</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            placeholder="e.g. mobile@okaxis"
                            value={regData.upi_id}
                            onChange={(e) => setRegData({ ...regData, upi_id: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>Google Pay Linked Number</label>
                          <input
                            className="form-input"
                            style={{ width: '100%', marginTop: '3px' }}
                            value={regData.gpay_number}
                            onChange={(e) => setRegData({ ...regData, gpay_number: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {regStep === 5 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>1. Government Photo ID</span>
                          <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '2px' }}>✓ Aadhaar Card selected</div>
                        </div>
                        <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>2. Driving License</span>
                          <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '2px' }}>✓ DL Copy selected</div>
                        </div>
                        <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>3. Vehicle Registration (RC)</span>
                          <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '2px' }}>✓ RC Copy selected</div>
                        </div>
                      </div>
                    )}

                    {regStep === 6 && (
                      <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: '#0F172A' }}>Application Summary</div>
                        <div style={{ marginBottom: '6px' }}><strong>Name:</strong> {regData.full_name}</div>
                        <div style={{ marginBottom: '6px' }}><strong>Mobile:</strong> {regData.mobile_number}</div>
                        <div style={{ marginBottom: '6px' }}><strong>Company:</strong> {regData.current_company}</div>
                        <div style={{ marginBottom: '6px' }}><strong>Location:</strong> {regData.primary_city}</div>
                        <div style={{ marginBottom: '6px' }}><strong>Vehicle:</strong> {regData.vehicle_type}</div>
                        <div style={{ marginBottom: '6px' }}><strong>UPI ID:</strong> {regData.upi_id}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '10px' }}>
                          Status upon submit: <strong style={{ color: '#D97706' }}>PENDING REVIEW</strong>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Stepper Footer Controls */}
              {!regSuccessMsg && (
                <div style={{ padding: '12px 16px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                  {regStep > 1 ? (
                    <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={() => setRegStep(regStep - 1)}>
                      Back
                    </button>
                  ) : <div />}

                  {regStep < 6 ? (
                    <button className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.8rem' }} onClick={() => setRegStep(regStep + 1)}>
                      Next Step
                    </button>
                  ) : (
                    <button className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.8rem', background: '#10B981' }} onClick={handleRegisterSubmit}>
                      Submit Application
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SCREEN 4: RIDER HOME DASHBOARD */}
          {currentScreen === 'home' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 70px', background: '#F8FAFC' }}>
              {/* Header Greeting */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>Hello, {riderData.full_name?.split(' ')[0]} 👋</h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748B' }}>Welcome back!</p>
                </div>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#2563EB',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                  onClick={() => setCurrentScreen('profile')}
                >
                  AC
                </div>
              </div>

              {/* Current Brand & Location Box */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                  borderRadius: '16px',
                  padding: '16px',
                  color: '#FFFFFF',
                  marginBottom: '14px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#2563EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem' }}>
                      SR
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Current Brand</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{riderData.current_brand}</div>
                    </div>
                  </div>
                  <span className="status-pill pill-active" style={{ fontSize: '0.65rem' }}>
                    {riderData.status}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94A3B8' }}>
                  <MapPin size={13} color="#38BDF8" />
                  <span>Working Location: <strong style={{ color: '#FFFFFF' }}>{riderData.location}</strong></span>
                </div>
              </div>

              {/* Earnings Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Today's Earnings</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    ₹{riderData.today_earnings}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>This Month</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                    ₹{riderData.month_earnings?.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: '10px' }}>
                  Quick Actions
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => setCurrentScreen('profile')}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>My Profile</span>
                  </div>

                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => alert(`Active Brand: ${riderData.current_brand}\nAssigned by Admin on 10 Sep 2026.`)}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F5F3FF', color: '#8B5CF6', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>My Brand</span>
                  </div>

                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => {
                      setCurrentScreen('payments');
                      setActiveTab('payments');
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', color: '#10B981', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CreditCard size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Payments</span>
                  </div>

                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => {
                      setCurrentScreen('payments');
                      setActiveTab('payments');
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>History</span>
                  </div>

                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => alert('Documents: Driving License (Verified), Aadhaar Card (Verified), Vehicle RC (Verified)')}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FFFBEB', color: '#D97706', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Shield size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Documents</span>
                  </div>

                  <div
                    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => {
                      setCurrentScreen('notifications');
                      setActiveTab('notifications');
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bell size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>
                      Alerts {notificationsList.length > 0 ? `(${notificationsList.length})` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 5: PAYMENT HISTORY */}
          {currentScreen === 'payments' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 70px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => setCurrentScreen('home')} style={{ color: '#0F172A' }}>
                    <ChevronLeft size={20} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>Payment History</span>
                </div>
              </div>

              {/* Monthly Earnings Box */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  borderRadius: '16px',
                  padding: '16px',
                  color: '#FFFFFF',
                  marginBottom: '14px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                }}
              >
                <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>September 2026 ▼</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0 2px' }}>
                  ₹{riderData.month_earnings?.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.68rem', opacity: 0.85, marginBottom: '12px' }}>Total Earnings</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>₹{riderData.paid_earnings?.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.85 }}>Paid</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>₹{riderData.pending_earnings?.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.85 }}>Pending</div>
                  </div>
                </div>
              </div>

              {/* Filter Chips */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 600 }}>All Brands ▼</span>
                <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 600 }}>All Status ▼</span>
                <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 600 }}>Date ▼</span>
              </div>

              {/* Transactions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {paymentsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>💳</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A' }}>No Payouts Yet</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                      Real-time UPI payout settlements will be listed here as processed.
                    </div>
                  </div>
                ) : (
                  paymentsList.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                          {(p.brand_name || 'SR').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A' }}>
                            {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Recent'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{p.brand_name || 'Direct Payout'}</div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>₹{Number(p.amount || 0).toLocaleString('en-IN')}</div>
                        <span className={`status-pill pill-${(p.status || 'PAID').toLowerCase()}`} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SCREEN 6: MY PROFILE */}
          {currentScreen === 'profile' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 70px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button onClick={() => setCurrentScreen('home')} style={{ color: '#0F172A' }}>
                  <ChevronLeft size={20} />
                </button>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>My Profile</span>
                <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600 }}>Edit</span>
              </div>

              {/* Avatar Profile Card */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#2563EB', color: 'white', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800 }}>
                  {riderData.full_name ? riderData.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'SR'}
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>{riderData.full_name}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                  Rider ID: <strong>{riderData.rider_id}</strong>
                </div>
                <span className="status-pill pill-active" style={{ fontSize: '0.65rem', marginTop: '4px' }}>
                  {riderData.status}
                </span>
              </div>

              {/* Details List */}
              <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mobile Number</span>
                  <span style={{ fontWeight: 600 }}>{riderData.mobile_number}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Email</span>
                  <span style={{ fontWeight: 600 }}>{riderData.email}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Company</span>
                  <span style={{ fontWeight: 600 }}>{riderData.company}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Role</span>
                  <span style={{ fontWeight: 600 }}>{riderData.role}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Vehicle</span>
                  <span style={{ fontWeight: 600 }}>{riderData.vehicle}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Primary Location</span>
                  <span style={{ fontWeight: 600 }}>{riderData.location}</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Assigned Brand</span>
                  <span style={{ fontWeight: 700, color: '#2563EB' }}>{riderData.current_brand} &gt;</span>
                </div>
                <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>UPI ID</span>
                  <span style={{ fontWeight: 600 }}>{riderData.upi_id}</span>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 7: NOTIFICATIONS */}
          {currentScreen === 'notifications' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 70px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => setCurrentScreen('home')} style={{ color: '#0F172A' }}>
                    <ChevronLeft size={20} />
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>Notifications</span>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {['ALL', 'UNREAD', 'SYSTEM'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setNotifFilter(tab)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '14px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: notifFilter === tab ? '#2563EB' : '#FFFFFF',
                      color: notifFilter === tab ? '#FFFFFF' : '#64748B',
                      border: '1px solid #CBD5E1',
                    }}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {/* Notifications List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notificationsList.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: n.color + '20', color: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                      <CheckCircle size={14} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>{n.title}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>{n.desc}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Navigation Bar (Visible on home, payments, notifications, profile) */}
          {['home', 'payments', 'notifications', 'profile'].includes(currentScreen) && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '62px',
                background: '#FFFFFF',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                paddingBottom: '6px',
                zIndex: 40,
              }}
            >
              <div
                style={{ textAlign: 'center', cursor: 'pointer', color: activeTab === 'home' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleBottomNav('home')}
              >
                <Home size={20} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, display: 'block', marginTop: '2px' }}>Home</span>
              </div>

              <div
                style={{ textAlign: 'center', cursor: 'pointer', color: activeTab === 'payments' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleBottomNav('payments')}
              >
                <CreditCard size={20} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, display: 'block', marginTop: '2px' }}>Payments</span>
              </div>

              <div
                style={{ textAlign: 'center', cursor: 'pointer', color: activeTab === 'notifications' ? '#2563EB' : '#94A3B8', position: 'relative' }}
                onClick={() => handleBottomNav('notifications')}
              >
                <Bell size={20} style={{ margin: '0 auto' }} />
                <span style={{ position: 'absolute', top: '-2px', right: '4px', width: '6px', height: '6px', background: '#EF4444', borderRadius: '50%' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, display: 'block', marginTop: '2px' }}>Alerts</span>
              </div>

              <div
                style={{ textAlign: 'center', cursor: 'pointer', color: activeTab === 'profile' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleBottomNav('profile')}
              >
                <User size={20} style={{ margin: '0 auto' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 600, display: 'block', marginTop: '2px' }}>Profile</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
