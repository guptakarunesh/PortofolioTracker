import { db } from '../lib/db.js';
import { hashToken } from '../lib/auth.js';

export default function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const tokenHash = hashToken(token);
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, u.full_name, u.mobile, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!session) {
    return res.status(401).json({ error: 'Session not found' });
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.userId = session.user_id;
  req.user = {
    id: session.user_id,
    full_name: session.full_name,
    mobile: session.mobile,
    email: session.email || ''
  };
  req.sessionTokenHash = tokenHash;

  return next();
}
