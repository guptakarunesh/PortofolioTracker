import { Platform } from 'react-native';
import Constants from 'expo-constants';

function inferExpoHost() {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== 'string') return null;
  return hostUri.split(':')[0];
}

const inferredHost = inferExpoHost();
const isProd = process.env.NODE_ENV === 'production';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (inferredHost
    ? `${isProd ? 'https' : 'http'}://${inferredHost}:4000`
    : Platform.OS === 'android'
      ? `${isProd ? 'https' : 'http'}://10.0.2.2:4000`
      : `${isProd ? 'https' : 'http'}://localhost:4000`);

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
}

export const buildApiUrl = (path) => `${API_BASE_URL}${path}`;

export async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function apiRequestRaw(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response;
}

export const api = {
  getLegalVersions: () => apiRequest('/legal/versions'),
  register: (payload) => apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  sendLoginOtp: (payload) => apiRequest('/api/auth/otp/send', { method: 'POST', body: JSON.stringify(payload) }),
  verifyLoginOtp: (payload) => apiRequest('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => apiRequest('/api/auth/me'),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  exportUserData: () => apiRequest('/api/user/export'),
  deleteAccount: (reason = 'user_requested') =>
    apiRequest('/api/user/account', { method: 'DELETE', body: JSON.stringify({ reason }) }),

  getSummary: () => apiRequest('/api/dashboard/summary'),
  getAllocationInsight: () => apiRequest('/api/dashboard/allocation-insight'),
  getLiveMarketRates: () => apiRequest('/api/market-rates/live'),
  getLiveFxRates: ({ base = 'INR', symbols = [] } = {}) => {
    const symbolsParam = Array.isArray(symbols) && symbols.length ? `&symbols=${encodeURIComponent(symbols.join(','))}` : '';
    return apiRequest(`/api/fx/live?base=${encodeURIComponent(base)}${symbolsParam}`);
  },

  getAssets: () => apiRequest('/api/assets'),
  createAsset: (payload) => apiRequest('/api/assets', { method: 'POST', body: JSON.stringify(payload) }),
  updateAsset: (id, payload) => apiRequest(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAsset: (id) => apiRequest(`/api/assets/${id}`, { method: 'DELETE' }),

  getLiabilities: () => apiRequest('/api/liabilities'),
  createLiability: (payload) => apiRequest('/api/liabilities', { method: 'POST', body: JSON.stringify(payload) }),
  updateLiability: (id, payload) =>
    apiRequest(`/api/liabilities/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLiability: (id) => apiRequest(`/api/liabilities/${id}`, { method: 'DELETE' }),

  getTransactions: () => apiRequest('/api/transactions'),
  createTransaction: (payload) => apiRequest('/api/transactions', { method: 'POST', body: JSON.stringify(payload) }),

  getReminders: () => apiRequest('/api/reminders'),
  createReminder: (payload) => apiRequest('/api/reminders', { method: 'POST', body: JSON.stringify(payload) }),
  updateReminderStatus: (id, status) =>
    apiRequest(`/api/reminders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getPerformanceLastSix: () => apiRequest('/api/performance/last-six'),
  getSnapshotReport: (date) =>
    apiRequest(`/api/reports/snapshot${date ? `?date=${encodeURIComponent(date)}` : ''}`),

  getSettings: () => apiRequest('/api/settings'),
  upsertSettings: (payload) => apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  getFamilyMembers: () => apiRequest('/api/family'),
  getFamilyAccess: () => apiRequest('/api/family/access'),
  addFamilyMember: (payload) => apiRequest('/api/family', { method: 'POST', body: JSON.stringify(payload) }),
  updateFamilyMember: (id, payload) =>
    apiRequest(`/api/family/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  removeFamilyMember: (id) => apiRequest(`/api/family/${id}`, { method: 'DELETE' }),
  cancelFamilyInvite: (id) => apiRequest(`/api/family/invites/${id}`, { method: 'DELETE' }),
  resendFamilyInvite: (id) => apiRequest(`/api/family/invites/${id}/resend`, { method: 'POST' }),
  getFamilyAudit: () => apiRequest('/api/family/audit'),

  getSubscriptionStatus: () => apiRequest('/api/subscription/status'),
  getSubscriptionHistory: () => apiRequest('/api/subscription/history'),
  createRazorpayOrder: (payload) =>
    apiRequest('/api/subscription/razorpay/order', { method: 'POST', body: JSON.stringify(payload) }),
  verifyRazorpayPayment: (payload) =>
    apiRequest('/api/subscription/razorpay/verify', { method: 'POST', body: JSON.stringify(payload) }),
  createCheckout: (payload) =>
    apiRequest('/api/subscription/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  purchaseSubscription: (plan) =>
    apiRequest('/api/subscription/purchase', { method: 'POST', body: JSON.stringify({ plan }) })
};
