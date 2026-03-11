import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { encryptString, decryptString } from '../lib/crypto.js';
import { ensureSubscriptionForUser, isPremiumActive } from '../lib/subscription.js';

const router = Router();
const ENCRYPTED_SETTING_KEYS = new Set(['privacy_pin']);
const TARGET_KEYS = new Set(['target_date', 'target_net_worth']);
const TARGET_PREFIX = 'yearly_target_';
const DEFAULT_COUNTRY = 'India';
const DEFAULT_CURRENCY = 'INR';

router.get('/', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.userId);
  const premiumActive = isPremiumActive(subscription);
  const rows = db
    .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key ASC')
    .all(req.userId);
  const hasCountry = rows.some((row) => row.key === 'country' && String(row.value || '').trim());
  const hasCurrency = rows.some(
    (row) => row.key === 'preferred_currency' && String(row.value || '').trim()
  );
  if (!hasCountry || !hasCurrency) {
    const upsert = db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value=excluded.value,
        updated_at=excluded.updated_at
    `);
    const now = nowIso();
    if (!hasCountry) {
      upsert.run(req.userId, 'country', DEFAULT_COUNTRY, now);
    }
    if (!hasCurrency) {
      upsert.run(req.userId, 'preferred_currency', DEFAULT_CURRENCY, now);
    }
  }
  const refreshedRows = !hasCountry || !hasCurrency
    ? db
        .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key ASC')
        .all(req.userId)
    : rows;
  const map = refreshedRows.reduce((acc, row) => {
    if (!premiumActive && (TARGET_KEYS.has(row.key) || row.key.startsWith(TARGET_PREFIX))) {
      return acc;
    }
    acc[row.key] = ENCRYPTED_SETTING_KEYS.has(row.key) ? decryptString(row.value) : row.value;
    return acc;
  }, {});
  res.json(map);
});

router.put('/', (req, res) => {
  const payload = req.body || {};
  const subscription = ensureSubscriptionForUser(req.userId);
  const premiumActive = isPremiumActive(subscription);

  if (!premiumActive) {
    const hasTargetKey = Object.keys(payload).some(
      (key) => TARGET_KEYS.has(key) || key.startsWith(TARGET_PREFIX)
    );
    if (hasTargetKey) {
      return res
        .status(403)
        .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'targets' });
    }
  }
  const stmt = db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `);

  const tx = db.transaction((obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      const plain = String(value ?? '');
      const stored = ENCRYPTED_SETTING_KEYS.has(key) ? encryptString(plain) : plain;
      stmt.run(req.userId, key, stored, nowIso());
    });
  });

  tx(payload);
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ? ORDER BY key ASC')
    .all(req.userId);
  const map = rows.reduce((acc, row) => {
    acc[row.key] = ENCRYPTED_SETTING_KEYS.has(row.key) ? decryptString(row.value) : row.value;
    return acc;
  }, {});
  res.json(map);
});

export default router;
