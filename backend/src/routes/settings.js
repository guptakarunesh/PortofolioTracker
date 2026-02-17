import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key ASC')
    .all(req.userId);
  const map = rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  res.json(map);
});

router.put('/', (req, res) => {
  const payload = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `);

  const tx = db.transaction((obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      stmt.run(req.userId, key, String(value), nowIso());
    });
  });

  tx(payload);
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ? ORDER BY key ASC')
    .all(req.userId);
  const map = rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  res.json(map);
});

export default router;
