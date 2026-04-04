import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { decryptString } from '../lib/crypto.js';
import { deleteAccountCompletely } from '../lib/accountLifecycle.js';

const router = Router();

router.get('/export', (req, res) => {
  const user = db
    .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users WHERE id = ?')
    .get(req.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const assets = db
    .prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY id ASC')
    .all(req.userId)
    .map((row) => ({
      ...row,
      name: decryptString(row.name),
      institution: decryptString(row.institution),
      account_ref: decryptString(row.account_ref),
      notes: decryptString(row.notes)
    }));
  const liabilities = db
    .prepare('SELECT * FROM liabilities WHERE user_id = ? ORDER BY id ASC')
    .all(req.userId)
    .map((row) => ({
      ...row,
      lender: decryptString(row.lender),
      account_ref: decryptString(row.account_ref),
      notes: decryptString(row.notes)
    }));
  const reminders = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY id ASC')
    .all(req.userId)
    .map((row) => ({
      ...row,
      description: decryptString(row.description)
    }));
  const settings = db
    .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key ASC')
    .all(req.userId)
    .map((row) => ({
      ...row,
      value: row.key === 'privacy_pin' ? '***masked***' : row.value
    }));
  const consents = db
    .prepare(
      'SELECT privacy_policy_version, terms_version, consented_at, consent_source FROM consent_log WHERE user_id = ? ORDER BY consented_at ASC'
    )
    .all(req.userId);

  return res.json({
    exportedAt: nowIso(),
    user: {
      ...user,
      full_name: decryptString(user.full_name),
      mobile: decryptString(user.mobile),
      email: decryptString(user.email)
    },
    assets,
    liabilities,
    reminders,
    settings,
    consents
  });
});

router.delete('/account', (req, res) => {
  const reason = String(req.body?.reason || 'user_requested').slice(0, 240);
  const user = db.prepare('SELECT id, mobile, mobile_hash FROM users WHERE id = ?').get(req.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deleted = deleteAccountCompletely({
    userId: user.id,
    reason,
    actor: 'user_request'
  });
  if (!deleted) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(204).send();
});

export default router;
