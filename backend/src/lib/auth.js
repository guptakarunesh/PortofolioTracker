import crypto from 'node:crypto';

const PIN_SALT_BYTES = 16;
const PIN_KEYLEN = 32;
const PIN_ITERATIONS = 120000;

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function normalizeMobile(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

export function isValidIndianMobile(mobile) {
  return /^[6-9]\d{9}$/.test(mobile);
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(PIN_SALT_BYTES).toString('hex');
  const hash = crypto
    .pbkdf2Sync(String(pin), salt, PIN_ITERATIONS, PIN_KEYLEN, 'sha256')
    .toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHash] = stored.split(':');
  const hash = crypto
    .pbkdf2Sync(String(pin), salt, PIN_ITERATIONS, PIN_KEYLEN, 'sha256')
    .toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sessionExpiryIso() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}
