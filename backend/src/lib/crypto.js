import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:v1';
const LOOKUP_PREFIX = 'lookup:v1';

function resolveKey() {
  const raw = process.env.APP_ENCRYPTION_KEY || 'dev-only-encryption-key-change-me';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

const KEY = resolveKey();

function resolveLookupKey() {
  const raw = process.env.APP_LOOKUP_KEY || process.env.APP_ENCRYPTION_KEY || 'dev-only-lookup-key-change-me';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

const LOOKUP_KEY = resolveLookupKey();

export function encryptString(value) {
  if (value == null || value === '') return '';
  const plain = String(value);
  if (plain.startsWith(`${PREFIX}:`)) return plain;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptString(value) {
  if (value == null || value === '') return '';
  const text = String(value);
  if (!text.startsWith(`${PREFIX}:`)) return text;

  const parts = text.split(':');
  if (parts.length !== 5) return text;

  try {
    const iv = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');
    const tag = Buffer.from(parts[4], 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return text;

    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return text;
  }
}

export function hashLookup(value) {
  const plain = String(value || '').trim();
  if (!plain) return '';
  return `${LOOKUP_PREFIX}:${crypto.createHmac('sha256', LOOKUP_KEY).update(plain).digest('hex')}`;
}
