import { Router } from 'express';
import { db } from '../lib/db.js';
import { ensureSubscriptionForUser, isPremiumActive } from '../lib/subscription.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();

function shiftDate(dateValue, daysToAdd) {
  const raw = String(dateValue || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Number(daysToAdd || 0));
  return base.toISOString().slice(0, 10);
}

router.get('/', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }
  const rows = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_date ASC, id ASC')
    .all(req.accountUserId)
    .map((row) => ({
      ...row,
      description: decryptString(row.description)
    }));
  res.json(rows);
});

router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireAccountWrite(req, res, next);
});

router.post('/', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }
  const {
    due_date,
    category,
    description,
    amount = 0,
    status = 'Pending',
    alert_days_before = 7
  } = req.body;

  if (!due_date || !category || !description) {
    return res.status(400).json({ error: 'due_date, category and description are required' });
  }

  const result = db
    .prepare(`
    INSERT INTO reminders (user_id, due_date, category, description, amount, status, alert_days_before)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      req.accountUserId,
      due_date,
      category,
      encryptString(description),
      Number(amount || 0),
      status,
      Number(alert_days_before || 7)
    );

  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, req.accountUserId);
  res.status(201).json({
    ...row,
    description: decryptString(row.description)
  });
});

router.patch('/:id/status', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  db.prepare('UPDATE reminders SET status = ? WHERE id = ? AND user_id = ?').run(status, id, req.accountUserId);
  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!row) return res.status(404).json({ error: 'reminder not found' });
  res.json({
    ...row,
    description: decryptString(row.description)
  });
});

router.patch('/:id/snooze', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }

  const id = Number(req.params.id);
  const days = Number(req.body?.days || 1);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return res.status(400).json({ error: 'days must be an integer between 1 and 30' });
  }

  const existing = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!existing) return res.status(404).json({ error: 'reminder not found' });

  const nextDate = shiftDate(existing.due_date, days);
  if (!nextDate) return res.status(400).json({ error: 'invalid due_date on reminder' });

  db.prepare('UPDATE reminders SET due_date = ?, status = ? WHERE id = ? AND user_id = ?').run(
    nextDate,
    'Pending',
    id,
    req.accountUserId
  );

  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  res.json({
    ...row,
    description: decryptString(row.description)
  });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.accountUserId);
  res.status(204).send();
});

export default router;
