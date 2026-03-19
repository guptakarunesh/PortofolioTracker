import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

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
const PUBLIC_API_BASE_URL = 'https://portofoliotracker-preprod.onrender.com';
const LOCAL_API_BASE_URL = inferredHost
  ? `${isProd ? 'https' : 'http'}://${inferredHost}:4000`
  : Platform.OS === 'android'
    ? `${isProd ? 'https' : 'http'}://10.0.2.2:4000`
    : `${isProd ? 'https' : 'http'}://localhost:4000`;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || PUBLIC_API_BASE_URL;
const PUBLIC_LEGAL_BASE_URL = PUBLIC_API_BASE_URL;
const FIREBASE_RECAPTCHA_TOKEN = String(process.env.EXPO_PUBLIC_FIREBASE_RECAPTCHA_TOKEN || '').trim();

let authToken = null;
let deviceContextPromise = null;
const DEVICE_ID_KEY = 'client_device_id_v1';

function createDeviceId() {
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

async function getOrCreateDeviceId() {
  const saved = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (saved && typeof saved === 'string') return saved;
  const id = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id).catch(() => {});
  return id;
}

async function getDeviceContext() {
  if (!deviceContextPromise) {
    deviceContextPromise = (async () => {
      const tz = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || '';
      const locale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale || '';
      const appVersion = String(Constants?.expoConfig?.version || Constants?.manifest?.version || '1.0.0');
      return {
        device_id: await getOrCreateDeviceId(),
        platform: Platform.OS,
        os_version: String(Platform.Version || ''),
        app_version: appVersion,
        app_build: String(
          Constants?.expoConfig?.ios?.buildNumber ||
            Constants?.expoConfig?.android?.versionCode ||
            ''
        ),
        device_name: String(Constants?.deviceName || ''),
        device_model: String(Constants?.platform?.ios?.model || Constants?.platform?.android?.model || ''),
        timezone: String(tz || ''),
        locale: String(locale || '')
      };
    })();
  }
  return deviceContextPromise;
}

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
}

export const buildApiUrl = (path) => `${API_BASE_URL}${path}`;
export const buildLegalUrl = (path) => {
  const base =
    /:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL) ||
    /:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(API_BASE_URL)
      ? PUBLIC_LEGAL_BASE_URL
      : API_BASE_URL;
  return `${base}${path}`;
};

async function extractErrorPayload(response) {
  const fallback = `Request failed (${response.status})`;
  const text = await response.text().catch(() => '');
  if (!text) return { message: fallback, details: null };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
      return { message: parsed.message, details: parsed };
    }
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      return { message: parsed.error, details: parsed };
    }
    return { message: fallback, details: parsed };
  } catch (_e) {
    // Non-JSON response body; use raw text below.
  }

  return { message: text, details: null };
}

export async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const deviceContext = await getDeviceContext().catch(() => null);
  if (deviceContext?.device_id) headers['X-Device-Id'] = String(deviceContext.device_id);
  if (deviceContext?.timezone) headers['X-Client-Timezone'] = String(deviceContext.timezone);
  if (deviceContext?.locale) headers['X-Client-Locale'] = String(deviceContext.locale);
  if (deviceContext?.platform) headers['X-Client-Platform'] = String(deviceContext.platform);
  if (deviceContext?.app_version) headers['X-App-Version'] = String(deviceContext.app_version);
  if (deviceContext?.os_version) headers['X-Os-Version'] = String(deviceContext.os_version);
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await extractErrorPayload(response);
    const err = new Error(payload.message);
    err.status = response.status;
    if (payload.details && typeof payload.details === 'object') {
      Object.assign(err, payload.details);
    }
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function apiRequestRaw(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const deviceContext = await getDeviceContext().catch(() => null);
  if (deviceContext?.device_id) headers['X-Device-Id'] = String(deviceContext.device_id);
  if (deviceContext?.timezone) headers['X-Client-Timezone'] = String(deviceContext.timezone);
  if (deviceContext?.locale) headers['X-Client-Locale'] = String(deviceContext.locale);
  if (deviceContext?.platform) headers['X-Client-Platform'] = String(deviceContext.platform);
  if (deviceContext?.app_version) headers['X-App-Version'] = String(deviceContext.app_version);
  if (deviceContext?.os_version) headers['X-Os-Version'] = String(deviceContext.os_version);
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await extractErrorPayload(response);
    const err = new Error(payload.message);
    err.status = response.status;
    if (payload.details && typeof payload.details === 'object') {
      Object.assign(err, payload.details);
    }
    throw err;
  }

  return response;
}

export const api = {
  getLegalVersions: () => apiRequest('/legal/versions'),
  register: async (payload) =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...(payload || {}), device_context: await getDeviceContext().catch(() => null) })
    }),
  login: async (payload) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...(payload || {}), device_context: await getDeviceContext().catch(() => null) })
    }),
  sendLoginOtp: (payload) =>
    apiRequest('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({
        ...(payload || {}),
        ...(FIREBASE_RECAPTCHA_TOKEN && !payload?.firebase_recaptcha_token
          ? { firebase_recaptcha_token: FIREBASE_RECAPTCHA_TOKEN }
          : {})
      })
    }),
  verifyLoginOtp: async (payload) =>
    apiRequest('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ ...(payload || {}), device_context: await getDeviceContext().catch(() => null) })
    }),
  requestMpinResetOtp: (payload) =>
    apiRequest('/api/auth/mpin/reset/request', {
      method: 'POST',
      body: JSON.stringify({
        ...(payload || {}),
        ...(FIREBASE_RECAPTCHA_TOKEN && !payload?.firebase_recaptcha_token
          ? { firebase_recaptcha_token: FIREBASE_RECAPTCHA_TOKEN }
          : {})
      })
    }),
  confirmMpinReset: (payload) => apiRequest('/api/auth/mpin/reset/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  requestSecurityPinResetOtp: (payload = {}) =>
    apiRequest('/api/auth/security-pin/reset/request', {
      method: 'POST',
      body: JSON.stringify({
        ...(payload || {}),
        ...(FIREBASE_RECAPTCHA_TOKEN && !payload?.firebase_recaptcha_token
          ? { firebase_recaptcha_token: FIREBASE_RECAPTCHA_TOKEN }
          : {})
      })
    }),
  confirmSecurityPinReset: (payload) =>
    apiRequest('/api/auth/security-pin/reset/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => apiRequest('/api/auth/me'),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  postSecurityContext: async () =>
    apiRequest('/api/auth/security/context', {
      method: 'POST',
      body: JSON.stringify({ device_context: await getDeviceContext().catch(() => null) })
    }),
  getSecurityDevices: () => apiRequest('/api/auth/security/devices'),
  revokeSecurityDevice: (id) => apiRequest(`/api/auth/security/devices/${id}`, { method: 'DELETE' }),
  getSecurityLoginEvents: (limit = 100) =>
    apiRequest(`/api/auth/security/login-events?limit=${encodeURIComponent(Math.max(1, Number(limit || 100)))}`),
  getSecurityIncidentReport: (limit = 300) =>
    apiRequest(`/api/auth/security/incident-report?limit=${encodeURIComponent(Math.max(20, Number(limit || 300)))}`),
  exportUserData: () => apiRequest('/api/user/export'),
  deleteAccount: (reason = 'user_requested') =>
    apiRequest('/api/user/account', { method: 'DELETE', body: JSON.stringify({ reason }) }),

  getSummary: () => apiRequest('/api/dashboard/summary'),
  getLiveMarketRates: () => apiRequest('/api/market-rates/live'),
  getLiveFxRates: ({ base = 'INR', symbols = [] } = {}) => {
    const symbolsParam = Array.isArray(symbols) && symbols.length ? `&symbols=${encodeURIComponent(symbols.join(','))}` : '';
    return apiRequest(`/api/fx/live?base=${encodeURIComponent(base)}${symbolsParam}`);
  },

  getAssets: () => apiRequest('/api/assets'),
  revealAssetSensitive: (id, pin) =>
    apiRequest(`/api/assets/${id}/reveal`, { method: 'POST', body: JSON.stringify({ pin }) }),
  createAsset: (payload) => apiRequest('/api/assets', { method: 'POST', body: JSON.stringify(payload) }),
  updateAsset: (id, payload) => apiRequest(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAsset: (id) => apiRequest(`/api/assets/${id}`, { method: 'DELETE' }),

  getLiabilities: () => apiRequest('/api/liabilities'),
  revealLiabilitySensitive: (id, pin) =>
    apiRequest(`/api/liabilities/${id}/reveal`, { method: 'POST', body: JSON.stringify({ pin }) }),
  createLiability: (payload) => apiRequest('/api/liabilities', { method: 'POST', body: JSON.stringify(payload) }),
  updateLiability: (id, payload) =>
    apiRequest(`/api/liabilities/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLiability: (id) => apiRequest(`/api/liabilities/${id}`, { method: 'DELETE' }),

  getNotifications: (params = {}) => {
    const unread = params.unread === false ? '0' : '1';
    const limit = Number(params.limit || 30);
    return apiRequest(`/api/notifications?unread=${encodeURIComponent(unread)}&limit=${encodeURIComponent(limit)}`);
  },
  registerPushToken: (payload) =>
    apiRequest('/api/notifications/push-token', { method: 'POST', body: JSON.stringify(payload) }),
  unregisterPushToken: (payload = {}) =>
    apiRequest('/api/notifications/push-token', { method: 'DELETE', body: JSON.stringify(payload) }),
  markNotificationRead: (id) => apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiRequest('/api/notifications/read-all', { method: 'PATCH' }),

  getTransactions: () => apiRequest('/api/transactions'),
  createTransaction: (payload) => apiRequest('/api/transactions', { method: 'POST', body: JSON.stringify(payload) }),

  getReminders: () => apiRequest('/api/reminders'),
  createReminder: (payload) => apiRequest('/api/reminders', { method: 'POST', body: JSON.stringify(payload) }),
  updateReminderStatus: (id, status) =>
    apiRequest(`/api/reminders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  snoozeReminder: (id, days = 1) =>
    apiRequest(`/api/reminders/${id}/snooze`, { method: 'PATCH', body: JSON.stringify({ days }) }),

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
  getSubscriptionReceipt: (id) => apiRequest(`/api/subscription/history/${encodeURIComponent(id)}/receipt`),
  createCashfreeOrder: (payload) =>
    apiRequest('/api/subscription/cashfree/order', { method: 'POST', body: JSON.stringify(payload) }),
  verifyCashfreePayment: (payload) =>
    apiRequest('/api/subscription/cashfree/verify', { method: 'POST', body: JSON.stringify(payload) }),
  createRazorpayOrder: (payload) =>
    apiRequest('/api/subscription/razorpay/order', { method: 'POST', body: JSON.stringify(payload) }),
  verifyRazorpayPayment: (payload) =>
    apiRequest('/api/subscription/razorpay/verify', { method: 'POST', body: JSON.stringify(payload) }),
  createCheckout: (payload) =>
    apiRequest('/api/subscription/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  purchaseSubscription: (plan) =>
    apiRequest('/api/subscription/purchase', { method: 'POST', body: JSON.stringify({ plan }) }),
  chatSupportAgent: (payload) =>
    apiRequest('/api/auth/support-chat', { method: 'POST', body: JSON.stringify(payload || {}) }),
  getSupportChatHistory: (limit = 500) =>
    apiRequest(`/api/auth/support-chat/history?limit=${encodeURIComponent(Math.max(1, Number(limit || 500)))}`),

  getAiInsights: () => apiRequest('/api/ai/insights')
};
