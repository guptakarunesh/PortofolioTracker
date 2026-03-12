import crypto from 'node:crypto';

const PROVIDER = String(process.env.OTP_PROVIDER || 'msg91_v5').toLowerCase();
const MSG91_BASE_URL = process.env.MSG91_BASE_URL || 'https://control.msg91.com';
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '';
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || '';
const GUPSHUP_BASE_URL = process.env.GUPSHUP_BASE_URL || 'https://api.gupshup.io';
const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY || '';
const GUPSHUP_USER_ID = process.env.GUPSHUP_USER_ID || '';
const GUPSHUP_TEMPLATE_ID = process.env.GUPSHUP_TEMPLATE_ID || '';
const GUPSHUP_SENDER_ID = process.env.GUPSHUP_SENDER_ID || '';
const FIREBASE_AUTH_BASE_URL = process.env.FIREBASE_AUTH_BASE_URL || 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || '';
const FIREBASE_TENANT_ID = process.env.FIREBASE_TENANT_ID || '';
const OTP_STRICT_PROVIDER = String(
  process.env.OTP_STRICT_PROVIDER || (process.env.NODE_ENV === 'production' ? '1' : '0')
) === '1';

export const OTP_CONFIG = {
  provider: PROVIDER,
  expiryMinutes: Number.parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  resendCooldownSeconds: Number.parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10),
  maxAttempts: Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  length: Number.parseInt(process.env.OTP_LENGTH || '6', 10),
  countryCode: String(process.env.OTP_COUNTRY_CODE || '91')
};

export class OtpServiceError extends Error {
  constructor(message, status = 500, code = 'otp_service_error') {
    super(message);
    this.name = 'OtpServiceError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeProvider(input = PROVIDER) {
  const value = String(input || '').toLowerCase();
  if (value === 'firebase' || value === 'firebase_auth') return 'firebase';
  if (value === 'msg91' || value === 'msg91_v5') return 'msg91_v5';
  if (value === 'msg91_legacy') return 'msg91_legacy';
  if (value === 'gupshup' || value === 'gupshup_template') return 'gupshup_template';
  return 'mock';
}

export function buildMobileE164(mobile) {
  const cc = OTP_CONFIG.countryCode.replace(/\D/g, '') || '91';
  return `${cc}${mobile}`;
}

export function generateOtp(length = OTP_CONFIG.length) {
  const digits = [];
  for (let i = 0; i < length; i += 1) {
    digits.push(crypto.randomInt(0, 10));
  }
  return digits.join('');
}

export function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function toFirebasePhoneNumber(mobile) {
  const e164WithoutPlus = buildMobileE164(mobile);
  return `+${String(e164WithoutPlus || '').replace(/[^\d]/g, '')}`;
}

function formatFirebaseError(payload, fallback = 'Firebase OTP request failed') {
  const rawCode = String(payload?.error?.message || '').trim() || 'UNKNOWN';
  const code = rawCode.toUpperCase();
  if (code === 'INVALID_VERIFICATION_CODE' || code === 'INVALID_CODE') {
    return { message: 'Invalid OTP', status: 401, code };
  }
  if (code === 'SESSION_EXPIRED' || code === 'CODE_EXPIRED') {
    return { message: 'OTP expired or not requested', status: 400, code };
  }
  if (
    code === 'MISSING_APP_CREDENTIAL' ||
    code === 'INVALID_APP_CREDENTIAL' ||
    code === 'MISSING_RECAPTCHA_TOKEN' ||
    code === 'INVALID_RECAPTCHA_TOKEN' ||
    code === 'CAPTCHA_CHECK_FAILED'
  ) {
    return {
      message: 'Firebase app verification failed. Pass firebase_recaptcha_token and retry.',
      status: 400,
      code
    };
  }
  if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER' || code === 'QUOTA_EXCEEDED') {
    return { message: 'Too many OTP attempts. Please try again later.', status: 429, code };
  }
  if (code === 'OPERATION_NOT_ALLOWED' || code === 'API_KEY_INVALID' || code === 'PROJECT_NOT_FOUND') {
    return { message: 'Firebase OTP provider is not configured correctly.', status: 500, code };
  }
  return { message: `${fallback}: ${rawCode}`, status: 502, code };
}

async function callFirebase(path, payload) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new OtpServiceError('Firebase API key is required for OTP provider.', 500, 'firebase_api_key_missing');
  }
  const url = `${FIREBASE_AUTH_BASE_URL}${path}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.message) {
    const info = formatFirebaseError(data);
    throw new OtpServiceError(info.message, info.status, info.code);
  }
  return data;
}

async function sendFirebaseOtp(mobile, options = {}) {
  const recaptchaToken = String(
    options?.firebase_recaptcha_token || options?.recaptcha_token || options?.recaptchaToken || ''
  ).trim();
  const iosReceipt = String(options?.firebase_ios_receipt || options?.iosReceipt || '').trim();
  const iosSecret = String(options?.firebase_ios_secret || options?.iosSecret || '').trim();

  if (!recaptchaToken && !(iosReceipt && iosSecret)) {
    throw new OtpServiceError(
      'Firebase OTP requires firebase_recaptcha_token (or ios receipt/secret).',
      400,
      'firebase_app_verification_missing'
    );
  }

  const payload = {
    phoneNumber: toFirebasePhoneNumber(mobile)
  };
  if (recaptchaToken) payload.recaptchaToken = recaptchaToken;
  if (iosReceipt && iosSecret) {
    payload.iosReceipt = iosReceipt;
    payload.iosSecret = iosSecret;
  }
  if (FIREBASE_TENANT_ID) payload.tenantId = FIREBASE_TENANT_ID;

  const data = await callFirebase('/accounts:sendVerificationCode', payload);
  if (!data?.sessionInfo) {
    throw new OtpServiceError('Firebase OTP send succeeded but sessionInfo is missing.', 502, 'firebase_session_missing');
  }
  return { providerRef: String(data.sessionInfo) };
}

async function verifyFirebaseOtp(_mobile, otp, providerRef) {
  if (!providerRef) {
    throw new OtpServiceError('OTP session is missing. Request OTP again.', 400, 'firebase_session_missing');
  }

  const payload = {
    sessionInfo: String(providerRef),
    code: String(otp)
  };
  if (FIREBASE_TENANT_ID) payload.tenantId = FIREBASE_TENANT_ID;

  try {
    await callFirebase('/accounts:signInWithPhoneNumber', payload);
    return true;
  } catch (error) {
    const code = String(error?.code || '').toUpperCase();
    if (code === 'INVALID_VERIFICATION_CODE' || code === 'INVALID_CODE') return false;
    if (code === 'SESSION_EXPIRED' || code === 'CODE_EXPIRED') return false;
    throw error;
  }
}

async function sendMsg91V5Otp(mobile) {
  if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
    throw new Error('MSG91 auth key and template id are required for OTP');
  }

  const params = new URLSearchParams({
    mobile: buildMobileE164(mobile),
    template_id: MSG91_TEMPLATE_ID
  });
  if (MSG91_AUTH_KEY) {
    params.set('authkey', MSG91_AUTH_KEY);
  }

  if (OTP_CONFIG.length) {
    params.set('otp_length', String(OTP_CONFIG.length));
  }
  if (OTP_CONFIG.expiryMinutes) {
    params.set('otp_expiry', String(OTP_CONFIG.expiryMinutes));
  }
  if (MSG91_SENDER_ID) {
    params.set('sender', MSG91_SENDER_ID);
  }

  const response = await fetch(`${MSG91_BASE_URL}/api/v5/otp?${params.toString()}`, {
    method: 'POST',
    headers: { authkey: MSG91_AUTH_KEY }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.type === 'error') {
    const message = payload?.message || 'Failed to send OTP via MSG91';
    throw new Error(message);
  }

  return { providerRef: payload?.request_id || payload?.requestId || null };
}

async function verifyMsg91V5Otp(mobile, otp) {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91 auth key is required for OTP verification');
  }

  const params = new URLSearchParams({
    mobile: buildMobileE164(mobile),
    otp: String(otp)
  });
  if (MSG91_AUTH_KEY) {
    params.set('authkey', MSG91_AUTH_KEY);
  }

  const response = await fetch(`${MSG91_BASE_URL}/api/v5/otp/verify?${params.toString()}`, {
    method: 'GET',
    headers: { authkey: MSG91_AUTH_KEY }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.type === 'error') {
    const message = payload?.message || 'OTP verification failed';
    throw new Error(message);
  }

  const status = String(payload?.message || '').toLowerCase();
  return status.includes('verified') || status.includes('success');
}

async function sendMsg91LegacyOtp(mobile) {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91 auth key is required for OTP');
  }

  const params = new URLSearchParams({
    authkey: MSG91_AUTH_KEY,
    mobile: buildMobileE164(mobile)
  });

  if (MSG91_TEMPLATE_ID) params.set('template_id', MSG91_TEMPLATE_ID);
  if (OTP_CONFIG.length) params.set('otp_length', String(OTP_CONFIG.length));
  if (OTP_CONFIG.expiryMinutes) params.set('otp_expiry', String(OTP_CONFIG.expiryMinutes));
  if (MSG91_SENDER_ID) params.set('sender', MSG91_SENDER_ID);

  const response = await fetch(`${MSG91_BASE_URL}/api/sendotp.php?${params.toString()}`, {
    method: 'GET'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.type === 'error') {
    const message = payload?.message || 'Failed to send OTP via MSG91';
    throw new Error(message);
  }

  return { providerRef: payload?.request_id || payload?.requestId || null };
}

async function verifyMsg91LegacyOtp(otp, providerRef) {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91 auth key is required for OTP verification');
  }

  const params = new URLSearchParams({
    authkey: MSG91_AUTH_KEY,
    otp: String(otp),
    ...(providerRef ? { request_id: String(providerRef) } : {})
  });

  const response = await fetch(`${MSG91_BASE_URL}/api/verifyRequestOTP.php?${params.toString()}`, {
    method: 'GET'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.type === 'error') {
    const message = payload?.message || 'OTP verification failed';
    throw new Error(message);
  }

  const status = String(payload?.message || '').toLowerCase();
  return status.includes('verified') || status.includes('success');
}

async function sendGupshupTemplateOtp(mobile, otp) {
  if (!GUPSHUP_API_KEY || !GUPSHUP_USER_ID || !GUPSHUP_TEMPLATE_ID) {
    throw new Error('Gupshup credentials and template id are required for OTP');
  }
  if (!GUPSHUP_SENDER_ID) {
    throw new Error('Gupshup sender id is required for OTP');
  }

  const message = JSON.stringify({
    type: 'template',
    template: {
      id: String(GUPSHUP_TEMPLATE_ID),
      params: [String(otp)]
    }
  });

  const params = new URLSearchParams({
    userid: GUPSHUP_USER_ID,
    password: GUPSHUP_API_KEY,
    send_to: buildMobileE164(mobile),
    msg: message,
    msg_type: 'text',
    sender: GUPSHUP_SENDER_ID,
    method: 'sendMessage'
  });

  const response = await fetch(`${GUPSHUP_BASE_URL}/sm/api/v1/msg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const payloadText = await response.text();
  if (!response.ok || !payloadText.toLowerCase().includes('success')) {
    throw new Error('Failed to send OTP via Gupshup');
  }

  return { providerRef: null, otp };
}

const PROVIDERS = {
  firebase: {
    send: sendFirebaseOtp,
    verify: verifyFirebaseOtp
  },
  msg91_v5: {
    send: sendMsg91V5Otp,
    verify: verifyMsg91V5Otp
  },
  msg91_legacy: {
    send: sendMsg91LegacyOtp,
    verify: async (_mobile, otp, providerRef) => verifyMsg91LegacyOtp(otp, providerRef)
  },
  gupshup_template: {
    send: async (mobile) => {
      const otp = generateOtp();
      await sendGupshupTemplateOtp(mobile, otp);
      return { otp, providerRef: null };
    },
    verify: async () => true
  },
  mock: {
    send: async () => ({ otp: generateOtp(), providerRef: null }),
    verify: async () => true
  }
};

function isProviderConfigured(providerKey) {
  if (providerKey === 'firebase') return Boolean(FIREBASE_WEB_API_KEY);
  if (providerKey === 'msg91_v5') return Boolean(MSG91_AUTH_KEY && MSG91_TEMPLATE_ID);
  if (providerKey === 'msg91_legacy') return Boolean(MSG91_AUTH_KEY);
  if (providerKey === 'gupshup_template') {
    return Boolean(GUPSHUP_API_KEY && GUPSHUP_USER_ID && GUPSHUP_TEMPLATE_ID && GUPSHUP_SENDER_ID);
  }
  return true;
}

export function getOtpProvider(providerOverride) {
  const requested = normalizeProvider(providerOverride);
  const providerKey = !OTP_STRICT_PROVIDER && !isProviderConfigured(requested) ? 'mock' : requested;
  return { key: providerKey, handler: PROVIDERS[providerKey] || PROVIDERS.mock };
}

export async function sendOtp(mobile, providerOverride, providerOptions = {}) {
  const { key, handler } = getOtpProvider(providerOverride);
  const payload = await handler.send(mobile, providerOptions);
  return { provider: key, ...payload };
}

export async function verifyOtp(mobile, otp, providerRef, providerOverride) {
  const { handler } = getOtpProvider(providerOverride);
  return handler.verify(mobile, otp, providerRef);
}
