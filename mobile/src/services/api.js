import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In development:
// - Android Emulator: 10.0.2.2 routes to the host computer's localhost
// - iOS Simulator: 127.0.0.1 connects to localhost
// - Physical Devices: use your computer's local Wi-Fi IP
// Release builds never fall back to a development address: without EXPO_PUBLIC_API_URL they use the live API.
const PRODUCTION_API_URL = 'https://flexriders-api.vercel.app/api/v1';
// While developing, the app is loaded from Metro on the computer, so the computer's current Wi-Fi address is
// in the bundle URL. A local API address (192.168.x.x etc.) follows it, so a new Wi-Fi address doesn't break login.
const LAN_HOST = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const devHost = () => {
  try {
    const url = NativeModules.SourceCode && NativeModules.SourceCode.scriptURL;
    const host = url ? url.split('://')[1].split(/[:/]/)[0] : '';
    return LAN_HOST.test(host) ? host : '';
  } catch (e) {
    return '';
  }
};
const getDefaultBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    const configured = process.env.EXPO_PUBLIC_API_URL;
    // A release build must never point at a developer's laptop: a local address in .env (from development)
    // would make the published app unusable, so release builds fall back to the live API.
    const configuredHostOnly = (/^https?:\/\/([^:/]+)/.exec(configured) || [])[1] || '';
    if (!__DEV__ && (LAN_HOST.test(configuredHostOnly) || configuredHostOnly === 'localhost' || configuredHostOnly === '127.0.0.1')) {
      return PRODUCTION_API_URL;
    }
    const host = __DEV__ ? devHost() : '';
    const [, scheme, configuredHost, rest] = /^(https?:\/\/)([^:/]+)(.*)$/.exec(configured) || [];
    return host && LAN_HOST.test(configuredHost || '') ? `${scheme}${host}${rest}` : configured;
  }
  if (!__DEV__) {
    return PRODUCTION_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }
  return 'http://127.0.0.1:8000/api/v1';
};

export const API_BASE_URL = getDefaultBaseUrl();

// Requests give up after 20s, so a slow or restarting backend can't leave the app waiting forever
// (a hung request would otherwise also block the next background refresh).
const REQUEST_TIMEOUT_MS = 20000;
const nativeFetch = global.fetch;
const fetch = (url, { timeoutMs = REQUEST_TIMEOUT_MS, ...options } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return nativeFetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') throw new Error('The server is taking too long to respond. Please try again.');
      throw err;
    })
    .finally(() => clearTimeout(timer));
};

let authToken = '';

// FastAPI returns validation errors (422) as an array of {loc, msg} objects.
const formatError = (err, fallback) => {
  if (Array.isArray(err.detail)) {
    return err.detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('\n');
  }
  return err.detail || fallback;
};

const TOKEN_KEY = 'sr_rider_token';
const ROLE_KEY = 'sr_user_role';

let authRole = '';

// Keeps the user logged in across app restarts.
export const setAuthToken = (token, role) => {
  authToken = token || '';
  if (role !== undefined) authRole = role || '';
  if (token) {
    AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    if (role) AsyncStorage.setItem(ROLE_KEY, role).catch(() => {});
  } else {
    AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    AsyncStorage.removeItem(ROLE_KEY).catch(() => {});
    authRole = '';
  }
};

export const loadStoredToken = async () => {
  const [token, role] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY).catch(() => null),
    AsyncStorage.getItem(ROLE_KEY).catch(() => null),
  ]);
  authToken = token || '';
  authRole = role || '';
  return authToken;
};

export const getAuthRole = () => authRole;

// Uploaded files are served by the backend under /uploads.
export const assetUrl = (path) => (path && path.startsWith('/') ? API_BASE_URL.replace(/\/api\/v1$/, '') + path : path);

const authedPost = async (path, body) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatError(err, 'Something went wrong'));
  }
  return res.json();
};

// Unauthenticated POST (password recovery, email codes); errors carry the server's message.
const publicPost = async (path, body) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatError(data, 'Something went wrong. Please try again.'));
  return data;
};

// Rider data is only ever fetched for the logged-in rider.
const authedGet = async (path) => {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${authToken}` } });
  if (!res.ok) {
    // Keep the server's message (e.g. "This campaign is not available for your vehicle.").
    const body = await res.json().catch(() => ({}));
    const err = new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

// PATCH / DELETE with an optional JSON body; errors carry the server's message.
const authedRequest = async (method, path, body) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${authToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatError(err, 'Something went wrong'));
  }
  return res.json();
};

export const getAuthToken = () => authToken;

/** Multipart file upload. Expo's fetch (the global fetch since SDK 52) rejects React Native's
 *  { uri, name, type } file parts ("Unsupported FormDataPart implementation"), so files are sent with
 *  React Native's XMLHttpRequest, which reads the file from its uri. Resolves with the JSON reply; rejects
 *  with a readable message (tooLarge for 413, fallback when the server gives no detail). */
const uploadForm = (path, form, { fallback, tooLarge, timeoutMs = 60000 }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = timeoutMs; // Photo uploads can be slow on mobile data
    xhr.onload = () => {
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (e) {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 413) return reject(new Error(tooLarge));
      return reject(new Error(formatError(data, fallback)));
    };
    xhr.onerror = () => reject(new Error('Network error. Check your internet connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload took too long. Please try again on a better connection.'));
    xhr.send(form);
  });

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
    setAuthToken(data.access_token, data.role || 'RIDER');
    return data;
  },

  sendOtp: async (phone) => {
    const cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatError(data, 'Could not send the OTP'));
    return data;
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
    setAuthToken(data.access_token, data.role || 'RIDER');
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
      timeoutMs: 60000, // Includes the selfie; mobile data can be slow
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

  // Server-controlled switches (e.g. whether the driver selfie is required at registration).
  getAppConfig: async () => {
    const res = await fetch(`${API_BASE_URL}/public/app-config`, { timeoutMs: 10000 });
    if (!res.ok) throw new Error('config');
    return res.json();
  },

  // Password recovery (email code), forced change after an admin reset, email check at registration.
  forgotPassword: (identifier) => publicPost('/auth/password/forgot', { identifier }),
  // A reset by SMS code also logs the rider in (the reply carries a login).
  resetPassword: async (identifier, code, newPassword) => {
    const data = await publicPost('/auth/password/reset', { identifier, code, new_password: newPassword });
    if (data.access_token) setAuthToken(data.access_token, data.role || 'RIDER');
    return data;
  },
  sendEmailCode: (email) => publicPost('/auth/email/verification-code', { email }),
  // Sign-up phone check: a real SMS code from the gateway phone; the returned proof goes with the registration.
  sendPhoneCode: (phone) => publicPost('/auth/phone/verification-code', { phone }),
  verifyPhoneCode: (phone, code) => publicPost('/auth/phone/verify-code', { phone, code }),
  changePassword: async (currentPassword, newPassword) => {
    const data = await authedPost('/auth/password/change', { current_password: currentPassword, new_password: newPassword });
    if (data.access_token) setAuthToken(data.access_token); // Other devices are signed out; this one continues
    return data;
  },

  getProfile: () => authedGet('/riders/me'),

  // Platform Terms & Privacy: whether a newer version needs accepting, and accepting it.
  getConsent: () => authedGet('/auth/consent'),
  acceptConsent: () => authedPost('/auth/consent', { accept_terms: true }),

  getPaymentHistory: () => authedGet('/riders/me/payments'),

  getNotifications: () => authedGet('/notifications'),
  // One earnings calculation shared with the admin dashboard and campaign screens.
  getEarnings: () => authedGet('/riders/me/earnings'),
  getReferrals: () => authedGet('/riders/me/referrals'),

  // Campaigns. `coords` is the device's current location ({lat, lng}) when the rider allowed it; the
  // server matches geo-targeted campaigns to it and to the rider's working areas.
  getCampaigns: (coords) => {
    const qs = coords && coords.lat != null ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
    return authedGet(`/riders/me/campaigns${qs}`);
  },
  getCampaign: (campaignId, coords) => {
    const qs = coords && coords.lat != null ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
    return authedGet(`/riders/me/campaigns/${campaignId}${qs}`);
  },

  // Working areas (max 3) and area search (real places from the backend geocoder; works before login too).
  // near: the device's current location ({lat, lng}) so nearby places come first.
  searchAreas: async (q, near) => {
    const bias = near && near.lat != null ? `&lat=${near.lat}&lng=${near.lng}` : '';
    const res = await fetch(`${API_BASE_URL}/geo/search?q=${encodeURIComponent(q)}${bias}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.detail) || 'Area search is unavailable right now.');
    return data;
  },
  getWorkingAreas: () => authedGet('/riders/me/working-areas'),
  updateWorkingAreas: (areas) => authedRequest('PUT', '/riders/me/working-areas', { areas }),
  updateLocation: (coords) => authedPost('/riders/me/location', { lat: coords.lat, lng: coords.lng }),
  // { kind, url }: a video link, or a temporary link to an uploaded video.
  getCampaignVideo: (campaignId) => authedGet(`/riders/me/campaigns/${campaignId}/video`),

  // termsVersion: the campaign Terms & Conditions version the rider just read and accepted (if the campaign has terms).
  joinCampaign: (campaignId, tshirtSize, pickupLocationId, termsVersion, coords) =>
    authedPost(`/riders/me/campaigns/${campaignId}/join`, {
      ...(tshirtSize ? { tshirt_size: tshirtSize, pickup_location_id: pickupLocationId || null } : {}),
      ...(termsVersion ? { terms_version: termsVersion } : {}),
      ...(coords && coords.lat != null ? { lat: coords.lat, lng: coords.lng } : {}),
    }),

  acceptCampaignTerms: (campaignId, version) => authedPost(`/riders/me/campaigns/${campaignId}/terms/accept`, { version }),

  withdrawCampaignRequest: (campaignId) => authedPost(`/riders/me/campaigns/${campaignId}/withdraw`),

  uploadCampaignProof: async (campaignId, photo, slot) => {
    const form = new FormData();
    form.append('photo', { uri: photo.uri, name: photo.fileName || 'proof.jpg', type: photo.mimeType || 'image/jpeg' });
    if (slot) form.append('slot', slot); // MORNING / EVENING / NIGHT
    return uploadForm(`/riders/me/campaigns/${campaignId}/activity`, form, {
      fallback: 'Could not upload your photo',
      tooLarge: 'This photo is too large to upload. Please take it again.',
    });
  },

  // Identity / vehicle documents (private files, reviewed by the FlexRiders team)
  getMyDocuments: () => authedGet('/riders/me/documents'),
  uploadDocument: async (docType, file) => {
    const form = new FormData();
    form.append('doc_type', docType);
    form.append('file', { uri: file.uri, name: file.fileName || file.name || 'document.jpg', type: file.mimeType || 'image/jpeg' });
    return uploadForm('/riders/me/documents', form, {
      fallback: 'Could not upload the document',
      tooLarge: 'This file is too large. Please upload a smaller photo.',
    });
  },
  // Image source for a private file (sent with the rider's login, never cached publicly).
  authedImage: (path) => ({ uri: `${API_BASE_URL}${path}`, headers: { Authorization: `Bearer ${authToken}` } }),
  requestPayout: () => authedPost('/riders/me/payout-request'),
  getMyRoute: (campaignId, date) => authedGet(`/riders/me/campaigns/${campaignId}/my-route${date ? `?date=${date}` : ''}`),

  // Support chat
  getSupportRealtime: () => authedGet('/riders/me/support/realtime'),
  getSupportUnread: () => authedGet('/riders/me/support/unread'),
  getSupportConversations: () => authedGet('/riders/me/support/conversations'),
  getSupportCampaignOptions: () => authedGet('/riders/me/support/campaign-options'),
  startSupportConversation: (subject, message, campaignId) =>
    authedPost('/riders/me/support/conversations', { subject, message, campaign_id: campaignId || null }),
  getSupportMessages: (id, beforeId) => authedGet(`/riders/me/support/conversations/${id}/messages${beforeId ? `?before_id=${beforeId}` : ''}`),
  sendSupportMessage: (id, message) => authedPost(`/riders/me/support/conversations/${id}/messages`, { message }),
  markSupportRead: (id) => authedPost(`/riders/me/support/conversations/${id}/read`),

  deleteNotification: (id) => authedRequest('DELETE', `/notifications/${id}`),
  clearNotifications: () => authedRequest('DELETE', '/notifications'),
  // Only non-verified fields; an empty string removes the value.
  updateProfile: (changes) => authedRequest('PATCH', '/riders/me', changes),
  // Switch vehicle (type, model, number together); a new vehicle then needs its proof uploaded.
  changeVehicle: (vehicle) => authedRequest('PUT', '/riders/me/vehicle', vehicle),
  deleteAccount: (password, reason) => authedRequest('DELETE', '/riders/me', { password, reason }),

  markAllNotificationsRead: () =>
    fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}` },
    }),

  // Customer / Brand App endpoints
  customerSignup: async (payload) => {
    const data = await publicPost('/customer/auth/signup', payload);
    setAuthToken(data.access_token, data.role || 'CUSTOMER');
    return data;
  },
  customerLogin: async (identifier, password) => {
    const isEmail = identifier.includes('@');
    const cleanId = isEmail ? identifier.trim() : identifier.replace(/\s+/g, '').replace('+', '');
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isEmail ? { email: cleanId } : { phone: cleanId }),
        password,
        role_requested: 'CUSTOMER',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatError(err, 'Invalid mobile / email or password'));
    }
    const data = await res.json();
    setAuthToken(data.access_token, data.role || 'CUSTOMER');
    return data;
  },
  getCustomerDashboard: () => authedGet('/customer/dashboard'),
  getCustomerCampaigns: (params = '') => authedGet(`/customer/campaigns${params ? '?' + params : ''}`),
  getCustomerCampaign: (id) => authedGet(`/customer/campaigns/${id}`),
  createCustomerCampaign: (payload) => authedPost('/customer/campaigns', payload),
  updateCustomerCampaign: (id, payload) => authedRequest('PUT', `/customer/campaigns/${id}`, payload),
  // Optional campaign banner (same as the admin form's), while the request can still be edited.
  uploadCustomerCampaignBanner: async (id, file) => {
    const form = new FormData();
    form.append('image', { uri: file.uri, name: file.fileName || 'banner.jpg', type: file.mimeType || 'image/jpeg' });
    return uploadForm(`/customer/campaigns/${id}/image`, form, {
      fallback: 'Could not upload the banner',
      tooLarge: 'This image is too large. Please choose a smaller one.',
    });
  },
  getCustomerNotifications: () => authedGet('/customer/notifications'),
  markCustomerNotificationRead: (id) => authedRequest('PUT', `/customer/notifications/${id}/read`, {}),
  getCustomerProfile: () => authedGet('/customer/profile'),
  updateCustomerProfile: (payload) => authedRequest('PUT', '/customer/profile', payload),
  getCustomerPlannerConfig: () => authedGet('/customer/planner-config'),
  // Monitoring the brand's own campaigns (the server refuses other brands' campaigns).
  getCustomerCampaignRiders: (id) => authedGet(`/customer/campaigns/${id}/riders`),
  getCustomerCampaignPhotoDays: (id) => authedGet(`/customer/campaigns/${id}/photos`),
  getCustomerCampaignPhotos: (id, date) => authedGet(`/customer/campaigns/${id}/photos?date=${date}`),
  getCustomerCampaignMap: (id, date) => authedGet(`/customer/campaigns/${id}/map${date ? `?date=${date}` : ''}`),
  getCustomerRealtime: () => authedGet('/customer/realtime'),
  getGeoDefaults: () => authedGet('/geo/defaults'),
};
