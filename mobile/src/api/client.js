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

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (inferredHost
    ? `http://${inferredHost}:4000`
    : Platform.OS === 'android'
      ? 'http://10.0.2.2:4000'
      : 'http://localhost:4000');

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

export const api = {
  register: (payload) => apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => apiRequest('/api/auth/me'),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),

  getSummary: () => apiRequest('/api/dashboard/summary'),
  getLiveMarketRates: () => apiRequest('/api/market-rates/live'),

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

  getSettings: () => apiRequest('/api/settings'),
  upsertSettings: (payload) => apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(payload) })
};
