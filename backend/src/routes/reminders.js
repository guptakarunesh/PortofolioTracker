import { Router } from 'express';
import { db } from '../lib/db.js';
import { ensureSubscriptionForUser, isPremiumActive } from '../lib/subscription.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();
const REPEAT_TYPES = new Set(['one_time', 'daily', 'weekly', 'every_x_days', 'monthly', 'yearly']);

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

function addMonthsClamped(dateValue, monthsToAdd) {
  const raw = String(dateValue || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const totalMonths = (year * 12) + (month - 1) + Number(monthsToAdd || 0);
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonthIndex = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(Date.UTC(nextYear, nextMonthIndex, safeDay)).toISOString().slice(0, 10);
}

function nextRecurringDate(dateValue, repeatType, repeatEveryDays) {
  const type = String(repeatType || 'one_time').trim().toLowerCase();
  if (type === 'daily') return shiftDate(dateValue, 1);
  if (type === 'weekly') return shiftDate(dateValue, 7);
  if (type === 'every_x_days') return shiftDate(dateValue, Number(repeatEveryDays || 0));
  if (type === 'monthly') return addMonthsClamped(dateValue, 1);
  if (type === 'yearly') return addMonthsClamped(dateValue, 12);
  return null;
}

function todayLocalYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nextRecurringFutureDate(dateValue, repeatType, repeatEveryDays) {
  let nextDate = nextRecurringDate(dateValue, repeatType, repeatEveryDays);
  const today = todayLocalYmd();
  let guard = 0;
  while (nextDate && nextDate <= today && guard < 400) {
    nextDate = nextRecurringDate(nextDate, repeatType, repeatEveryDays);
    guard += 1;
  }
  return nextDate;
}

router.get('/', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }
  const rows = db
    .prepare("SELECT * FROM reminders WHERE user_id = ? AND status <> 'Completed' ORDER BY due_date ASC, id ASC")
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
    alert_days_before = 7,
    repeat_type = 'one_time',
    repeat_every_days = null
  } = req.body;

  const normalizedRepeatType = String(repeat_type || 'one_time').trim().toLowerCase();
  const normalizedRepeatEveryDays =
    normalizedRepeatType === 'every_x_days' ? Number(repeat_every_days || 0) : null;

  if (!due_date || !category || !description) {
    return res.status(400).json({ error: 'due_date, category and description are required' });
  }
  if (!REPEAT_TYPES.has(normalizedRepeatType)) {
    return res.status(400).json({ error: 'invalid repeat_type' });
  }
  if (
    normalizedRepeatType === 'every_x_days' &&
    (!Number.isInteger(normalizedRepeatEveryDays) || normalizedRepeatEveryDays < 2 || normalizedRepeatEveryDays > 365)
  ) {
    return res.status(400).json({ error: 'repeat_every_days must be an integer between 2 and 365' });
  }

  const result = db
    .prepare(`
    INSERT INTO reminders (user_id, due_date, category, description, amount, status, alert_days_before, repeat_type, repeat_every_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      req.accountUserId,
      due_date,
      category,
      encryptString(description),
      Number(amount || 0),
      status,
      Number(alert_days_before || 7),
      normalizedRepeatType,
      normalizedRepeatEveryDays
    );

  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, req.accountUserId);
  res.status(201).json({
    ...row,
    description: decryptString(row.description)
  });
});

router.put('/:id', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'reminders' });
  }

  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!existing) return res.status(404).json({ error: 'reminder not found' });

  const {
    due_date,
    category,
    description,
    amount = 0,
    alert_days_before = 7,
    repeat_type = 'one_time',
    repeat_every_days = null
  } = req.body;

  const normalizedRepeatType = String(repeat_type || 'one_time').trim().toLowerCase();
  const normalizedRepeatEveryDays =
    normalizedRepeatType === 'every_x_days' ? Number(repeat_every_days || 0) : null;

  if (!due_date || !category || !description) {
    return res.status(400).json({ error: 'due_date, category and description are required' });
  }
  if (!REPEAT_TYPES.has(normalizedRepeatType)) {
    return res.status(400).json({ error: 'invalid repeat_type' });
  }
  if (
    normalizedRepeatType === 'every_x_days' &&
    (!Number.isInteger(normalizedRepeatEveryDays) || normalizedRepeatEveryDays < 2 || normalizedRepeatEveryDays > 365)
  ) {
    return res.status(400).json({ error: 'repeat_every_days must be an integer between 2 and 365' });
  }

  db.prepare(`
    UPDATE reminders
    SET due_date = ?, category = ?, description = ?, amount = ?, alert_days_before = ?, repeat_type = ?, repeat_every_days = ?
    WHERE id = ? AND user_id = ?
  `).run(
    due_date,
    category,
    encryptString(description),
    Number(amount || 0),
    Number(alert_days_before || 7),
    normalizedRepeatType,
    normalizedRepeatEveryDays,
    id,
    req.accountUserId
  );

  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, req.accountUserId);
  res.json({
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

  const existing = db
    .prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!existing) return res.status(404).json({ error: 'reminder not found' });

  const isRecurring = String(existing.repeat_type || 'one_time') !== 'one_time';
  if (String(status) === 'Completed' && isRecurring) {
    const nextDate = nextRecurringFutureDate(existing.due_date, existing.repeat_type, existing.repeat_every_days);
    if (!nextDate) return res.status(400).json({ error: 'invalid recurrence configuration on reminder' });
    db.prepare('UPDATE reminders SET due_date = ?, status = ? WHERE id = ? AND user_id = ?').run(
      nextDate,
      'Pending',
      id,
      req.accountUserId
    );
  } else {
    db.prepare('UPDATE reminders SET status = ? WHERE id = ? AND user_id = ?').run(status, id, req.accountUserId);
  }
  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, req.accountUserId);
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
