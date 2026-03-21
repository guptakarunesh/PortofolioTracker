import fs from 'node:fs';
import { google } from 'googleapis';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_PACKAGE_NAME = 'com.networthmanager.app';
const DEFAULT_PRODUCT_MAP = {
  basic_monthly: 'basic_monthly',
  basic_yearly: 'basic_yearly',
  premium_monthly: 'premium_monthly',
  premium_yearly: 'premium_yearly'
};

let cachedClient = null;
let cachedConfig = null;

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch {
    return fallback;
  }
}

function readServiceAccountCredentials() {
  const rawJson = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    const parsed = parseJson(rawJson);
    if (parsed) return parsed;
  }

  const base64 = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64 || '').trim();
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      const parsed = parseJson(decoded);
      if (parsed) return parsed;
    } catch {
      // fall through
    }
  }

  const filePath = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE || '').trim();
  if (filePath && fs.existsSync(filePath)) {
    const parsed = parseJson(fs.readFileSync(filePath, 'utf8'));
    if (parsed) return parsed;
  }

  return null;
}

function loadGooglePlayConfig() {
  if (cachedConfig) return cachedConfig;

  const credentials = readServiceAccountCredentials();
  const rawProductMap = parseJson(process.env.GOOGLE_PLAY_PRODUCT_MAP, null);
  const productMap = rawProductMap && typeof rawProductMap === 'object' ? rawProductMap : DEFAULT_PRODUCT_MAP;
  const packageName =
    String(process.env.GOOGLE_PLAY_PACKAGE_NAME || process.env.EXPO_ANDROID_PACKAGE || DEFAULT_PACKAGE_NAME).trim() ||
    DEFAULT_PACKAGE_NAME;
  const allowWebFallback =
    String(process.env.GOOGLE_PLAY_ALLOW_WEB_FALLBACK || '').trim() === '1' || process.env.NODE_ENV !== 'production';
  cachedConfig = {
    enabled: Boolean(credentials),
    credentials,
    packageName,
    productMap,
    allowWebFallback
  };
  return cachedConfig;
}

function buildAuthClient(credentials) {
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error('google_play_credentials_invalid');
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [ANDROID_PUBLISHER_SCOPE]
  });
}

async function getAndroidPublisherClient() {
  const config = loadGooglePlayConfig();
  if (!config.enabled) {
    const err = new Error('google_play_not_configured');
    err.code = 'google_play_not_configured';
    throw err;
  }
  if (!cachedClient) {
    const auth = buildAuthClient(config.credentials);
    cachedClient = google.androidpublisher({ version: 'v3', auth });
  }
  return { client: cachedClient, config };
}

function pickLineItem(purchase, productId) {
  const lineItems = Array.isArray(purchase?.lineItems) ? purchase.lineItems : [];
  if (!lineItems.length) return null;
  return lineItems.find((item) => String(item?.productId || '') === String(productId || '')) || lineItems[0] || null;
}

function parseIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deriveCancellationReason(canceledStateContext) {
  if (!canceledStateContext || typeof canceledStateContext !== 'object') return null;
  if (canceledStateContext.userInitiatedCancellation) return 'user';
  if (canceledStateContext.systemInitiatedCancellation) return 'system';
  if (canceledStateContext.developerInitiatedCancellation) return 'developer';
  if (canceledStateContext.replacementCancellation) return 'replacement';
  return 'other';
}

function mapSubscriptionStateToLocalStatus(subscriptionState, expiryTime) {
  const expiryDate = parseIso(expiryTime);
  const isFuture = expiryDate ? expiryDate.getTime() > Date.now() : false;
  switch (String(subscriptionState || '')) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'active';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return isFuture ? 'active' : 'expired';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'on_hold';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'pending';
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'expired';
    default:
      return isFuture ? 'active' : 'expired';
  }
}

function normalizePurchase({ purchase, productId, packageName }) {
  const lineItem = pickLineItem(purchase, productId);
  const expiryTime = String(lineItem?.expiryTime || '').trim() || null;
  const latestOrderId =
    String(lineItem?.latestSuccessfulOrderId || purchase?.latestOrderId || '').trim() || null;
  const autoRenewEnabled =
    lineItem?.autoRenewingPlan?.autoRenewEnabled === true
      ? true
      : lineItem?.autoRenewingPlan?.autoRenewEnabled === false
        ? false
        : null;
  const linkedPurchaseToken = String(purchase?.linkedPurchaseToken || '').trim() || null;
  const subscriptionState = String(purchase?.subscriptionState || '').trim() || 'SUBSCRIPTION_STATE_UNSPECIFIED';
  const acknowledgementState = String(purchase?.acknowledgementState || '').trim() || 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED';
  const obfuscatedExternalAccountId =
    String(purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId || '').trim() || null;
  const obfuscatedExternalProfileId =
    String(purchase?.externalAccountIdentifiers?.obfuscatedExternalProfileId || '').trim() || null;
  return {
    packageName,
    productId: String(lineItem?.productId || productId || '').trim(),
    purchaseToken: null,
    linkedPurchaseToken,
    latestOrderId,
    startTime: String(purchase?.startTime || '').trim() || null,
    expiryTime,
    subscriptionState,
    localStatus: mapSubscriptionStateToLocalStatus(subscriptionState, expiryTime),
    acknowledgementState,
    acknowledged: acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    autoRenewEnabled,
    isTestPurchase: Boolean(purchase?.testPurchase),
    cancellationReason: deriveCancellationReason(purchase?.canceledStateContext),
    cancelContext: purchase?.canceledStateContext || null,
    pausedStateContext: purchase?.pausedStateContext || null,
    lineItem: lineItem || null,
    obfuscatedExternalAccountId,
    obfuscatedExternalProfileId,
    raw: purchase
  };
}

export function getGooglePlayPublicConfig() {
  const config = loadGooglePlayConfig();
  return {
    enabled: config.enabled,
    packageName: config.packageName,
    productMap: config.productMap,
    allowWebFallback: config.allowWebFallback
  };
}

export function resolveGooglePlayProductIdForPlan(plan) {
  const config = loadGooglePlayConfig();
  return String(config.productMap?.[plan] || '').trim() || null;
}

export function resolvePlanForGooglePlayProduct(productId) {
  const config = loadGooglePlayConfig();
  return Object.entries(config.productMap || {}).find(([, mapped]) => String(mapped) === String(productId))?.[0] || null;
}

export function buildGooglePlayManageUrl(productId) {
  const { packageName } = getGooglePlayPublicConfig();
  const sku = encodeURIComponent(String(productId || ''));
  const pkg = encodeURIComponent(String(packageName || DEFAULT_PACKAGE_NAME));
  return `https://play.google.com/store/account/subscriptions?sku=${sku}&package=${pkg}`;
}

export async function verifyGooglePlaySubscription({ purchaseToken, productId, packageName: packageNameOverride }) {
  const token = String(purchaseToken || '').trim();
  const sku = String(productId || '').trim();
  if (!token || !sku) {
    const err = new Error('purchase_token and product_id are required.');
    err.code = 'google_play_missing_fields';
    throw err;
  }
  const { client, config } = await getAndroidPublisherClient();
  const packageName = String(packageNameOverride || config.packageName || DEFAULT_PACKAGE_NAME).trim();
  const response = await client.purchases.subscriptionsv2.get({
    packageName,
    token
  });
  const normalized = normalizePurchase({ purchase: response.data, productId: sku, packageName });
  normalized.purchaseToken = token;
  return normalized;
}

export async function acknowledgeGooglePlaySubscription({ purchaseToken, productId, packageName: packageNameOverride }) {
  const token = String(purchaseToken || '').trim();
  const sku = String(productId || '').trim();
  if (!token || !sku) return { acknowledged: false, skipped: true };
  const { client, config } = await getAndroidPublisherClient();
  const packageName = String(packageNameOverride || config.packageName || DEFAULT_PACKAGE_NAME).trim();
  await client.purchases.subscriptions.acknowledge({
    packageName,
    subscriptionId: sku,
    token,
    requestBody: {}
  });
  return { acknowledged: true };
}

export async function cancelGooglePlaySubscription({ purchaseToken, packageName: packageNameOverride }) {
  const token = String(purchaseToken || '').trim();
  if (!token) {
    const err = new Error('purchase_token is required.');
    err.code = 'google_play_missing_purchase_token';
    throw err;
  }
  const { client, config } = await getAndroidPublisherClient();
  const packageName = String(packageNameOverride || config.packageName || DEFAULT_PACKAGE_NAME).trim();
  await client.purchases.subscriptionsv2.cancel({
    packageName,
    token,
    requestBody: {}
  });
  return { ok: true };
}

export async function revokeGooglePlaySubscription({ purchaseToken, packageName: packageNameOverride }) {
  const token = String(purchaseToken || '').trim();
  if (!token) {
    const err = new Error('purchase_token is required.');
    err.code = 'google_play_missing_purchase_token';
    throw err;
  }
  const { client, config } = await getAndroidPublisherClient();
  const packageName = String(packageNameOverride || config.packageName || DEFAULT_PACKAGE_NAME).trim();
  await client.purchases.subscriptionsv2.revoke({
    packageName,
    token,
    requestBody: {}
  });
  return { ok: true };
}
