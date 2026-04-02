import { db } from '../lib/db.js';
import { hashToken } from '../lib/auth.js';
import { decryptString } from '../lib/crypto.js';
import { getAccountAccessState } from '../lib/accountLifecycle.js';
import { extractDeviceContext, logAuthEvent, touchDeviceForUser, touchSession } from '../lib/deviceSecurity.js';

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
  const context = extractDeviceContext(req, null);
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, s.device_id, s.auth_method, u.full_name, u.mobile, u.email
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

  const access = getAccountAccessState(session.user_id);
  if (access.status === 'disabled') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(session.user_id);
    logAuthEvent({
      userId: session.user_id,
      mobileHash: '',
      eventType: 'session_rejected_disabled_account',
      authMethod: session.auth_method || 'session',
      status: 'blocked',
      reason: 'account_disabled',
      context,
      req
    });
    return res.status(403).json({
      error: 'account_disabled',
      message: 'This account is disabled. Contact support to regain access.'
    });
  }

  const sessionDeviceId = String(session.device_id || '').trim();
  const requestDeviceId = String(context.device_id || '').trim();

  if (sessionDeviceId && !requestDeviceId) {
    logAuthEvent({
      userId: session.user_id,
      mobileHash: '',
      eventType: 'session_rejected_missing_device',
      authMethod: session.auth_method || '',
      status: 'failed',
      reason: 'missing_device_id',
      context,
      req
    });
    return res.status(401).json({ error: 'device_id_required', message: 'Device identifier is required.' });
  }

  if (sessionDeviceId && requestDeviceId && sessionDeviceId !== requestDeviceId) {
    logAuthEvent({
      userId: session.user_id,
      mobileHash: '',
      eventType: 'session_rejected_device_mismatch',
      authMethod: session.auth_method || '',
      status: 'failed',
      reason: 'device_mismatch',
      context,
      req,
      meta: { expected_device_id: sessionDeviceId }
    });
    return res.status(401).json({ error: 'device_mismatch', message: 'Session is bound to another device.' });
  }

  req.userId = session.user_id;
  req.user = {
    id: session.user_id,
    full_name: decryptString(session.full_name),
    mobile: decryptString(session.mobile),
    email: decryptString(session.email || '')
  };
  req.sessionTokenHash = tokenHash;
  req.deviceContext = context;

  touchSession(tokenHash, req);
  if (requestDeviceId) {
    touchDeviceForUser(session.user_id, context, req);
  }

  return next();
}
