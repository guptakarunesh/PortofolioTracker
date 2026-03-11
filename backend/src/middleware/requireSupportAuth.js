import { db, nowIso } from '../lib/db.js';
import { hashToken } from '../lib/auth.js';

export default function requireSupportAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'support_auth_required', message: 'Support login required.' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'support_auth_required', message: 'Support login required.' });
  }

  const tokenHash = hashToken(token);
  const session = db
    .prepare(
      `
      SELECT s.id, s.support_user_id, s.expires_at, u.username
      FROM support_sessions s
      JOIN support_users u ON u.id = s.support_user_id
      WHERE s.token_hash = ?
      LIMIT 1
    `
    )
    .get(tokenHash);
  if (!session) {
    return res.status(401).json({ error: 'support_auth_failed', message: 'Invalid support session.' });
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM support_sessions WHERE id = ?').run(session.id);
    return res.status(401).json({ error: 'support_session_expired', message: 'Support session expired.' });
  }

  db.prepare('UPDATE support_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), session.id);
  req.supportUserId = Number(session.support_user_id);
  req.supportActor = String(session.username || 'support');
  req.supportSessionId = Number(session.id);
  return next();
}
