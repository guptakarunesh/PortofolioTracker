import { db, nowIso } from './db.js';
import { decryptString } from './crypto.js';

function normalizePin(pin) {
  return String(pin || '').trim();
}

export function verifyOwnerSecurityPin(ownerUserId, inputPin) {
  const row = db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'privacy_pin' LIMIT 1")
    .get(ownerUserId);
  const storedPin = normalizePin(decryptString(row?.value || ''));
  if (!storedPin) {
    return { ok: false, code: 'pin_not_set', message: 'Security PIN is not set for this account.' };
  }

  const attempted = normalizePin(inputPin);
  if (!attempted || attempted !== storedPin) {
    return { ok: false, code: 'invalid_pin', message: 'Invalid security PIN.' };
  }
  return { ok: true };
}

function initialsFromName(name = '') {
  const compact = String(name || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,2}$/.test(compact)) return compact;
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function maskIdentifier(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= 6) return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 6))}${raw.slice(-4)}`;
}

export function maskContactLast4(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return `${'*'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function sanitizeTrackingUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    return host || '';
  } catch {
    const fallback = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .trim();
    return fallback;
  }
}

export function logSensitiveAccess({
  ownerUserId,
  actorUserId,
  entityType,
  entityId,
  action = 'reveal',
  ipAddress = ''
}) {
  db.prepare(`
    INSERT INTO sensitive_access_log (
      owner_user_id, actor_user_id, entity_type, entity_id, action, ip_address, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ownerUserId, actorUserId, entityType, Number(entityId), action, String(ipAddress || ''), nowIso());
}

function getRecipientIds(ownerUserId) {
  const rows = db
    .prepare(
      `
      SELECT member_user_id AS user_id FROM family_members WHERE owner_user_id = ?
      UNION
      SELECT ? AS user_id
    `
    )
    .all(ownerUserId, ownerUserId);
  return [...new Set(rows.map((row) => Number(row.user_id)).filter((id) => id > 0))];
}

export function notifySensitiveInfoViewed({
  ownerUserId,
  actorUserId,
  entityType,
  entityId
}) {
  const actorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(actorUserId);
  const actorName = initialsFromName(decryptString(actorRow?.full_name || '')) || 'NA';
  const title = 'Sensitive details viewed';
  const body = `${actorName} viewed full ${entityType} details.`;
  const payload = JSON.stringify({
    owner_user_id: ownerUserId,
    actor_user_id: actorUserId,
    entity_type: entityType,
    entity_id: Number(entityId),
    at: nowIso()
  });

  const recipientIds = getRecipientIds(ownerUserId);
  const stmt = db.prepare(`
    INSERT INTO app_notifications (user_id, type, title, body, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = nowIso();
  const tx = db.transaction(() => {
    recipientIds.forEach((userId) => {
      stmt.run(userId, 'sensitive_view', title, body, payload, now);
    });
  });
  tx();
}
