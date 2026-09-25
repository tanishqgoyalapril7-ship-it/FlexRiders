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

  if (response.status === 401 && !endpoint.startsWith('/auth/login')) {
    // Session missing or expired: App shows the login screen.
    setAuthToken('');
    window.dispatchEvent(new Event('sr-auth-expired'));
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
};

export const api = {
  // Public brand page (no login)
  getPublicCampaign: async (slug) => {
    const response = await fetch(`${API_BASE}/public/campaigns/${encodeURIComponent(slug)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'This campaign page is not available.');
    return data;
  },
  // Auth
  login: async (phone, password) => {
    const data = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    if (!['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN'].includes(data.role)) {
      throw new Error('This account does not have admin access. Riders use the mobile app.');
    }
    setAuthToken(data.access_token);
    return data;
  },

  logout: () => setAuthToken(''),

  // Admin accounts & system
  getCurrentAdmin: () => fetchWithAuth('/admin/users/me'),
  getAdminUsers: () => fetchWithAuth('/admin/users'),
  getAdminRoles: () => fetchWithAuth('/admin/users/roles'),
  createAdminUser: (data) => fetchWithAuth('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminUser: (id, data) => fetchWithAuth(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateAdminUser: (id) => fetchWithAuth(`/admin/users/${id}`, { method: 'DELETE' }),
  getSystemSettings: () => fetchWithAuth('/admin/system/settings'),
  getResetPreview: () => fetchWithAuth('/admin/system/reset-preview'),
  resetData: (scope, confirmation) =>
    fetchWithAuth('/admin/system/reset', { method: 'POST', body: JSON.stringify({ scope, confirmation }) }),

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
  createRider: (data) => fetchWithAuth('/admin/riders', { method: 'POST', body: JSON.stringify(data) }),
  updateRider: (id, data) => fetchWithAuth(`/admin/riders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getRiderDeleteImpact: (id) => fetchWithAuth(`/admin/riders/${id}/delete-impact`),
  deleteRider: (id) => fetchWithAuth(`/admin/riders/${id}`, { method: 'DELETE' }),
  archiveRider: (id, reason) => fetchWithAuth(`/admin/riders/${id}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }),
  restoreRider: (id) => fetchWithAuth(`/admin/riders/${id}/restore`, { method: 'POST' }),

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
  getBrands: (activeOnly = false) => fetchWithAuth(`/brands${activeOnly ? '?active_only=true' : ''}`),

  getBrandDetail: (id) => fetchWithAuth(`/brands/${id}`),
  getBrandDeleteImpact: (id) => fetchWithAuth(`/brands/${id}/delete-impact`),
  deleteBrand: (id) => fetchWithAuth(`/brands/${id}`, { method: 'DELETE' }),

  updateBrand: (id, brandData) =>
    fetchWithAuth(`/brands/${id}`, {
      method: 'PUT',
      body: JSON.stringify(brandData),
    }),

  createBrand: (brandData) =>
    fetchWithAuth('/brands', {
      method: 'POST',
      body: JSON.stringify(brandData),
    }),

  assignBrand: (riderId, brandId, { assignmentDate, notes } = {}) =>
    fetchWithAuth(`/brands/assign/${riderId}`, {
      method: 'POST',
      body: JSON.stringify({ brand_id: Number(brandId), assignment_date: assignmentDate || null, notes: notes || null }),
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

  editPayment: (id, data) => fetchWithAuth(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelPayment: (id, reason) => fetchWithAuth(`/payments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

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
  markNotificationRead: (id) => fetchWithAuth(`/notifications/${id}/read`, { method: 'PATCH' }),
  deleteNotification: (id) => fetchWithAuth(`/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: (readOnly = false) => fetchWithAuth(`/notifications${readOnly ? '?read_only=true' : ''}`, { method: 'DELETE' }),

  // Audit Logs
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchWithAuth(`/audit-logs${query ? `?${query}` : ''}`);
  },

  // Campaigns
  getCampaigns: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return fetchWithAuth(`/campaigns${query ? `?${query}` : ''}`);
  },
  getCampaignSummary: () => fetchWithAuth('/campaigns/summary'),
  getOperationsOverview: () => fetchWithAuth('/reports/operations'),
  getCampaign: (id) => fetchWithAuth(`/campaigns/${id}`),
  createCampaign: (data) => fetchWithAuth('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id, data) => fetchWithAuth(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getRouteDates: (id, assignmentId) => fetchWithAuth(`/campaigns/${id}/route-dates${assignmentId ? `?assignment_id=${assignmentId}` : ''}`),
  getRoutes: (id, date, assignmentId) =>
    fetchWithAuth(`/campaigns/${id}/routes?date=${date}${assignmentId ? `&assignment_id=${assignmentId}` : ''}`),
  getCampaignRiderVisibility: (id) => fetchWithAuth(`/campaigns/${id}/rider-visibility`),
  getCampaignDeleteImpact: (id) => fetchWithAuth(`/campaigns/${id}/delete-impact`),
  deleteCampaign: (id) => fetchWithAuth(`/campaigns/${id}`, { method: 'DELETE' }),
  addRiderToCampaign: (id, data) => fetchWithAuth(`/campaigns/${id}/riders`, { method: 'POST', body: JSON.stringify(data) }),
  // action: publish | unpublish | pause | resume | complete | cancel
  changeCampaignStatus: (id, action) => fetchWithAuth(`/campaigns/${id}/${action}`, { method: 'POST' }),
  uploadCampaignImage: async (id, file) => {
    const form = new FormData();
    form.append('image', file);
    const response = await fetch(`${API_BASE}/campaigns/${id}/image`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: form,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Image upload failed');
    }
    return response.json();
  },
  getCampaignApplications: (id, status = 'ALL') => fetchWithAuth(`/campaigns/${id}/applications?status=${status}`),
  getJoinRequests: (status = 'REQUESTED', campaignId = '') =>
    fetchWithAuth(`/campaigns/join-requests?status=${status}${campaignId ? `&campaign_id=${campaignId}` : ''}`),
  setRequestKit: (id, applicationId, data) =>
    fetchWithAuth(`/campaigns/${id}/applications/${applicationId}/kit`, { method: 'POST', body: JSON.stringify(data) }),
  approveCampaignApplication: (id, applicationId, replacementForAssignmentId = null) =>
    fetchWithAuth(`/campaigns/${id}/applications/${applicationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ replacement_for_assignment_id: replacementForAssignmentId }),
    }),
  rejectCampaignApplication: (id, applicationId, reason) =>
    fetchWithAuth(`/campaigns/${id}/applications/${applicationId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getCampaignRiders: (id) => fetchWithAuth(`/campaigns/${id}/riders`),
  getCampaignRiderActivity: (id, assignmentId) => fetchWithAuth(`/campaigns/${id}/riders/${assignmentId}/activity`),
  removeCampaignRider: (id, assignmentId, reason) =>
    fetchWithAuth(`/campaigns/${id}/riders/${assignmentId}/remove`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getCampaignPhotos: (id, status = 'ALL') => fetchWithAuth(`/campaigns/${id}/photos?status=${status}`),
  approveCampaignActivity: (id, activityId) => fetchWithAuth(`/campaigns/${id}/activities/${activityId}/approve`, { method: 'POST' }),
  rejectCampaignActivity: (id, activityId, reason) =>
    fetchWithAuth(`/campaigns/${id}/activities/${activityId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  approveCampaignPhoto: (id, photoId) => fetchWithAuth(`/campaigns/${id}/photos/${photoId}/approve`, { method: 'POST' }),
  rejectCampaignPhoto: (id, photoId, reason) =>
    fetchWithAuth(`/campaigns/${id}/photos/${photoId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getCampaignPayouts: (id) => fetchWithAuth(`/campaigns/${id}/payouts`),
  approveCampaignPayout: (id, payoutId) => fetchWithAuth(`/campaigns/${id}/payouts/${payoutId}/approve`, { method: 'POST' }),
  payCampaignPayout: (id, payoutId) => fetchWithAuth(`/campaigns/${id}/payouts/${payoutId}/pay`, { method: 'POST' }),
  // Campaign fulfilment, recovery and money
  getCampaignFulfillment: (id, ridersAvailable) =>
    fetchWithAuth(`/campaigns/${id}/fulfillment${ridersAvailable != null && ridersAvailable !== '' ? `?riders_available=${ridersAvailable}` : ''}`),
  setReplacementSlots: (id, count) =>
    fetchWithAuth(`/campaigns/${id}/replacement-slots`, { method: 'POST', body: JSON.stringify({ extra_replacement_slots: Number(count) }) }),
  addCampaignExtension: (id, data) => fetchWithAuth(`/campaigns/${id}/extensions`, { method: 'POST', body: JSON.stringify(data) }),
  getBrandPayments: (id) => fetchWithAuth(`/campaigns/${id}/brand-payments`),
  addBrandPayment: (id, data) => fetchWithAuth(`/campaigns/${id}/brand-payments`, { method: 'POST', body: JSON.stringify(data) }),
  getAdjustments: (id) => fetchWithAuth(`/campaigns/${id}/adjustments`),
  resolveAdjustment: (id, adjustmentId, status, note) =>
    fetchWithAuth(`/campaigns/${id}/adjustments/${adjustmentId}/resolve`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  getBrandKit: (id) => fetchWithAuth(`/campaigns/${id}/brand-kit`),
  updateBrandKit: (id, data) => fetchWithAuth(`/campaigns/${id}/brand-kit`, { method: 'PUT', body: JSON.stringify(data) }),
  addPickupLocation: (id, data) => fetchWithAuth(`/campaigns/${id}/pickup-locations`, { method: 'POST', body: JSON.stringify(data) }),
  updatePickupLocation: (id, locationId, data) =>
    fetchWithAuth(`/campaigns/${id}/pickup-locations/${locationId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePickupLocation: (id, locationId) => fetchWithAuth(`/campaigns/${id}/pickup-locations/${locationId}`, { method: 'DELETE' }),
  updateRiderKit: (id, kitId, data) =>
    fetchWithAuth(`/campaigns/${id}/brand-kit/riders/${kitId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  excuseRiderDay: (id, assignmentId, day, reason) =>
    fetchWithAuth(`/campaigns/${id}/riders/${assignmentId}/excuse`, { method: 'POST', body: JSON.stringify({ day, reason }) }),
  getCampaignTerms: (id) => fetchWithAuth(`/campaigns/${id}/terms`),
  getStandardTerms: () => fetchWithAuth('/campaigns/standard-terms'),
  publishCampaignTerms: (id, data) => fetchWithAuth(`/campaigns/${id}/terms`, { method: 'POST', body: JSON.stringify(data) }),
  markKitReturned: (id, kitId) => fetchWithAuth(`/campaigns/${id}/brand-kit/riders/${kitId}/return`, { method: 'POST' }),
  shareCampaign: (id, enabled) => fetchWithAuth(`/campaigns/${id}/share`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  getActivityLog: (id) => fetchWithAuth(`/campaigns/${id}/activity-log`),
  getCampaignSnapshot: (id) => fetchWithAuth(`/campaigns/${id}/snapshot`),

  // Export endpoints require the admin token, so download through fetch instead of opening the URL.
  downloadCampaignReport: async (id) => {
    const response = await fetch(`${API_BASE}/campaigns/${id}/export`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!response.ok) throw new Error('Could not export the campaign report');
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = (disposition.match(/filename=([^;]+)/) || [])[1] || `campaign_${id}.csv`;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },

  // CSV exports need the admin token, so they download through fetch.
  downloadRidersExport: () => downloadFile('/reports/export/riders', 'riders.csv'),
  downloadPaymentsExport: () => downloadFile('/reports/export/payments', 'payments.csv'),
};

async function downloadFile(endpoint, fallbackName) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!response.ok) throw new Error('Could not download the export');
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = (disposition.match(/filename=\"?([^;"]+)/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
