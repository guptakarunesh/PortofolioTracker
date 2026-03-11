import { db, nowIso } from './db.js';

export function logSecurityEvent({
  userId = null,
  actorUserId = null,
  mobileHash = '',
  eventType,
  status = 'ok',
  ipAddress = '',
  meta = {}
}) {
  if (!eventType) return;
  db.prepare(`
    INSERT INTO security_event_log (
      user_id, actor_user_id, mobile_hash, event_type, status, ip_address, meta, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId || null,
    actorUserId || null,
    String(mobileHash || ''),
    String(eventType),
    String(status || 'ok'),
    String(ipAddress || ''),
    JSON.stringify(meta || {}),
    nowIso()
  );
}

function recipientIds(ownerUserId) {
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

export function notifyOwnerAndFamily({ ownerUserId, type = 'security_event', title, body, payload = {} }) {
  if (!ownerUserId || !title || !body) return;
  const recipients = recipientIds(ownerUserId);
  if (!recipients.length) return;

  const stmt = db.prepare(`
    INSERT INTO app_notifications (user_id, type, title, body, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = nowIso();
  const rawPayload = JSON.stringify({ ...(payload || {}), at: now });
  const tx = db.transaction(() => {
    recipients.forEach((userId) => {
      stmt.run(userId, type, String(title), String(body), rawPayload, now);
    });
  });
  tx();
}
