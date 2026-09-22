import { Platform } from 'react-native';

// In development:
// - Android Emulator: 10.0.2.2 routes to the host computer's localhost
// - iOS Simulator: 127.0.0.1 connects to localhost
// - Physical Devices: use your computer's local Wi-Fi IP
const getDefaultBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }
  return 'http://127.0.0.1:8000/api/v1';
};

export const API_BASE_URL = getDefaultBaseUrl();

let authToken = '';

export const setAuthToken = (token) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

export const mobileApi = {
  login: async (phone, password) => {
    const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, password, role_requested: 'RIDER' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Invalid mobile number or password');
    }
    const data = await res.json();
    setAuthToken(data.access_token);
    return data;
  },

  sendOtp: async (phone) => {
    const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone }),
    });
    return res.json();
  },

  verifyOtp: async (phone, otp) => {
    const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, otp }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Invalid OTP code');
    }
    const data = await res.json();
    setAuthToken(data.access_token);
    return data;
  },

  register: async (regData) => {
    const payload = {
      full_name: regData.full_name,
      mobile_number: regData.mobile_number.replace(/\s+/g, ''),
      email: regData.email || null,
      dob: regData.dob || null,
      password: regData.password || 'Rider@123',
      current_company: regData.current_company || 'Independent',
      current_role: regData.current_role || 'Rider',
      experience_years: Number(regData.experience_years) || 1,
      experience_months: Number(regData.experience_months) || 0,
      vehicle_type: regData.vehicle_type || 'Bike',
      primary_city: regData.primary_city || 'Gurugram',
      primary_area: regData.primary_area || '',
      preferred_radius: regData.preferred_radius || '10 km',
      upi_id: regData.upi_id || null,
      gpay_number: regData.gpay_number || null,
      documents: [
        { doc_type: 'DRIVING_LICENSE', document_name: 'Driving License', file_url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600' },
        { doc_type: 'GOVT_ID', document_name: 'Aadhaar Card', file_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600' },
        { doc_type: 'VEHICLE_RC', document_name: 'Vehicle RC', file_url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600' }
      ]
    };

    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    const data = await res.json();
    if (data.access_token) {
      setAuthToken(data.access_token);
    }
    return data;
  },

  getProfile: async () => {
    const url = authToken ? `${API_BASE_URL}/riders/me` : `${API_BASE_URL}/riders/live-current/profile`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error('Failed to fetch profile');
    }
    return res.json();
  },

  getPaymentHistory: async (month = 'September 2026') => {
    const url = authToken
      ? `${API_BASE_URL}/riders/me/payments?month=${encodeURIComponent(month)}`
      : `${API_BASE_URL}/riders/live-current/payments?month=${encodeURIComponent(month)}`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { month, total_earnings: 0, paid_amount: 0, pending_amount: 0, payments: [] };
    }
    return res.json();
  },

  getNotifications: async () => {
    const url = authToken
      ? `${API_BASE_URL}/notifications`
      : `${API_BASE_URL}/riders/live-current/notifications`;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    return res.json();
  },
};
