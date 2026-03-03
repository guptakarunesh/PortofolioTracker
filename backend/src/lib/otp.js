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

export const OTP_CONFIG = {
  provider: PROVIDER,
  expiryMinutes: Number.parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  resendCooldownSeconds: Number.parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10),
  maxAttempts: Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  length: Number.parseInt(process.env.OTP_LENGTH || '6', 10),
  countryCode: String(process.env.OTP_COUNTRY_CODE || '91')
};

export function normalizeProvider(input = PROVIDER) {
  const value = String(input || '').toLowerCase();
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

export function getOtpProvider(providerOverride) {
  const providerKey = normalizeProvider(providerOverride);
  return { key: providerKey, handler: PROVIDERS[providerKey] || PROVIDERS.mock };
}

export async function sendOtp(mobile, providerOverride) {
  const { key, handler } = getOtpProvider(providerOverride);
  const payload = await handler.send(mobile);
  return { provider: key, ...payload };
}

export async function verifyOtp(mobile, otp, providerRef, providerOverride) {
  const { handler } = getOtpProvider(providerOverride);
  return handler.verify(mobile, otp, providerRef);
}
