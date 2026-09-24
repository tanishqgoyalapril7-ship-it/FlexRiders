import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// FastAPI returns validation errors (422) as an array of {loc, msg} objects.
const formatError = (err, fallback) => {
  if (Array.isArray(err.detail)) {
    return err.detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('\n');
  }
  return err.detail || fallback;
};

const TOKEN_KEY = 'sr_rider_token';

// Keeps the rider logged in across app restarts.
export const setAuthToken = (token) => {
  authToken = token || '';
  (token ? AsyncStorage.setItem(TOKEN_KEY, token) : AsyncStorage.removeItem(TOKEN_KEY)).catch(() => {});
};

export const loadStoredToken = async () => {
  authToken = (await AsyncStorage.getItem(TOKEN_KEY).catch(() => null)) || '';
  return authToken;
};

// Uploaded files are served by the backend under /uploads.
export const assetUrl = (path) => (path && path.startsWith('/') ? API_BASE_URL.replace(/\/api\/v1$/, '') + path : path);

const authedPost = async (path) => {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatError(err, 'Something went wrong'));
  }
  return res.json();
};

// Rider data is only ever fetched for the logged-in rider.
const authedGet = async (path) => {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${authToken}` } });
  if (!res.ok) {
    const err = new Error(`Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
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
      throw new Error(formatError(err, 'Invalid mobile number or password'));
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
      throw new Error(formatError(err, 'Invalid OTP code'));
    }
    const data = await res.json();
    setAuthToken(data.access_token);
    return data;
  },

  register: async (regData) => {
    // Send only what the rider actually entered; the backend fills defaults for the rest.
    const payload = Object.fromEntries(
      Object.entries({
        ...regData,
        mobile_number: regData.mobile_number.replace(/\s+/g, ''),
        experience_years: regData.experience_years ? Number(regData.experience_years) : null,
        experience_months: regData.experience_months ? Number(regData.experience_months) : null,
      }).filter(([, v]) => v !== null && v !== undefined && v !== '')
    );

    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatError(err, 'Registration failed'));
    }
    const data = await res.json();
    if (data.access_token) {
      setAuthToken(data.access_token);
    }
    return data;
  },

  getProfile: () => authedGet('/riders/me'),

  getPaymentHistory: () => authedGet('/riders/me/payments'),

  getNotifications: () => authedGet('/notifications'),

  // Campaigns
  getCampaigns: () => authedGet('/riders/me/campaigns'),

  getCampaign: (campaignId) => authedGet(`/riders/me/campaigns/${campaignId}`),

  joinCampaign: (campaignId) => authedPost(`/riders/me/campaigns/${campaignId}/join`),

  withdrawCampaignRequest: (campaignId) => authedPost(`/riders/me/campaigns/${campaignId}/withdraw`),

  uploadCampaignProof: async (campaignId, photo) => {
    const form = new FormData();
    form.append('photo', { uri: photo.uri, name: photo.fileName || 'proof.jpg', type: photo.mimeType || 'image/jpeg' });
    const res = await fetch(`${API_BASE_URL}/riders/me/campaigns/${campaignId}/activity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatError(err, 'Could not upload your photo'));
    }
    return res.json();
  },

  markAllNotificationsRead: () =>
    fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}` },
    }),
};
