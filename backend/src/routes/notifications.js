import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const unreadOnly = String(req.query.unread || '1') !== '0';
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  const rows = unreadOnly
    ? db
        .prepare(
          `
          SELECT id, type, title, body, payload, read_at, created_at
          FROM app_notifications
          WHERE user_id = ? AND read_at IS NULL
          ORDER BY created_at DESC
          LIMIT ?
        `
        )
        .all(req.userId, limit)
    : db
        .prepare(
          `
          SELECT id, type, title, body, payload, read_at, created_at
          FROM app_notifications
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `
        )
        .all(req.userId, limit);
  res.json({ items: rows });
});

router.patch('/:id/read', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE app_notifications SET read_at = ? WHERE id = ? AND user_id = ?')
    .run(nowIso(), id, req.userId);
  res.json({ ok: true });
});

router.patch('/read-all', (req, res) => {
  db.prepare('UPDATE app_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(nowIso(), req.userId);
  res.json({ ok: true });
});

router.post('/push-token', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'token_required', message: 'Push token is required.' });
  }

  const platform = String(req.body?.platform || 'unknown').trim().slice(0, 24);
  const now = nowIso();
  db.prepare(`
    INSERT INTO device_push_tokens (user_id, token, platform, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      user_id=excluded.user_id,
      platform=excluded.platform,
      last_seen_at=excluded.last_seen_at
  `).run(req.userId, token, platform, now, now);

  return res.json({ ok: true });
});

router.delete('/push-token', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (token) {
    db.prepare('DELETE FROM device_push_tokens WHERE token = ? AND user_id = ?').run(token, req.userId);
    return res.json({ ok: true });
  }

  db.prepare('DELETE FROM device_push_tokens WHERE user_id = ?').run(req.userId);
  return res.json({ ok: true });
});

export default router;
