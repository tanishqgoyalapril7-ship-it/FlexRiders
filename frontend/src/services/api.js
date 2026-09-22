const API_BASE = '/api/v1';

let authToken = localStorage.getItem('sr_admin_token') || '';

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('sr_admin_token', token);
  } else {
    localStorage.removeItem('sr_admin_token');
  }
};

export const getAuthToken = () => authToken;

const fetchWithAuth = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If not authenticated, we handle graceful fallback or auto-login for development preview
    console.warn('Authentication required or expired.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
};

export const api = {
  // Auth
  login: async (phone, password) => {
    const data = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password, role_requested: 'SUPER_ADMIN' }),
    });
    setAuthToken(data.access_token);
    return data;
  },

  getCurrentUser: () => fetchWithAuth('/auth/me'),

  registerRider: (regData) =>
    fetchWithAuth('/auth/register', {
      method: 'POST',
      body: JSON.stringify(regData),
    }),

  // Dashboard Analytics
  getDashboard: () => fetchWithAuth('/reports/dashboard'),

  // Riders
  getRiders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchWithAuth(`/admin/riders${query ? `?${query}` : ''}`);
  },

  getRiderDetail: (id) => fetchWithAuth(`/admin/riders/${id}`),

  approveRider: (id) =>
    fetchWithAuth(`/admin/riders/${id}/approve`, {
      method: 'PATCH',
    }),

  rejectRider: (id, reason) =>
    fetchWithAuth(`/admin/riders/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REJECTED', reason }),
    }),

  suspendRider: (id, reason) =>
    fetchWithAuth(`/admin/riders/${id}/suspend`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'SUSPENDED', reason }),
    }),

  reactivateRider: (id) =>
    fetchWithAuth(`/admin/riders/${id}/reactivate`, {
      method: 'PATCH',
    }),

  // Brands
  getBrands: () => fetchWithAuth('/brands'),

  createBrand: (brandData) =>
    fetchWithAuth('/brands', {
      method: 'POST',
      body: JSON.stringify(brandData),
    }),

  assignBrand: (riderId, brandId, notes = '') =>
    fetchWithAuth(`/brands/assign/${riderId}`, {
      method: 'POST',
      body: JSON.stringify({ brand_id: brandId, notes }),
    }),

  unassignBrand: (riderId) =>
    fetchWithAuth(`/brands/unassign/${riderId}`, {
      method: 'DELETE',
    }),

  // Payments
  getPayments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchWithAuth(`/payments${query ? `?${query}` : ''}`);
  },

  createPayment: (paymentData) =>
    fetchWithAuth('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    }),

  processPayment: (id, action = 'PAID') =>
    fetchWithAuth(`/payments/${id}/process?action=${action}`, {
      method: 'POST',
    }),

  // Notifications
  getNotifications: () => fetchWithAuth('/notifications'),
  markAllNotificationsRead: () =>
    fetchWithAuth('/notifications/read-all', {
      method: 'PATCH',
    }),

  // Audit Logs
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchWithAuth(`/audit-logs${query ? `?${query}` : ''}`);
  },

  // Export URLs
  getRidersExportUrl: () => `${API_BASE}/reports/export/riders`,
  getPaymentsExportUrl: () => `${API_BASE}/reports/export/payments`,
};
