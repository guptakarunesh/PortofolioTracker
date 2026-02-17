import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  createSessionToken,
  hashPin,
  hashToken,
  isValidIndianMobile,
  normalizeMobile,
  sessionExpiryIso,
  verifyPin
} from '../lib/auth.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

function publicUser(userRow) {
  return {
    id: userRow.id,
    full_name: userRow.full_name,
    mobile: userRow.mobile,
    email: userRow.email || ''
  };
}

router.post('/register', (req, res) => {
  const { full_name, mobile, email = '', mpin } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!full_name || String(full_name).trim().length < 2) {
    return res.status(400).json({ error: 'Valid full_name is required' });
  }
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }
  if (!mpin || !/^\d{4,6}$/.test(String(mpin))) {
    return res.status(400).json({ error: 'mpin must be 4 to 6 digits' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE mobile = ?').get(cleanMobile);
  if (exists) {
    return res.status(409).json({ error: 'An account with this mobile already exists' });
  }

  const result = db.prepare(`
    INSERT INTO users (full_name, mobile, email, mpin_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(full_name).trim(), cleanMobile, String(email || '').trim(), hashPin(String(mpin)), nowIso());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  const token = createSessionToken();
  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, hashToken(token), sessionExpiryIso(), nowIso());

  return res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { mobile, mpin } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!isValidIndianMobile(cleanMobile) || !mpin) {
    return res.status(400).json({ error: 'mobile and mpin are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(cleanMobile);
  if (!user || !verifyPin(String(mpin), user.mpin_hash)) {
    return res.status(401).json({ error: 'Invalid mobile or mpin' });
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  const token = createSessionToken();
  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, hashToken(token), sessionExpiryIso(), nowIso());

  return res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  res.status(204).send();
});

export default router;
