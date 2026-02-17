import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_date ASC, id ASC')
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
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
      req.userId,
      due_date,
      category,
      description,
      Number(amount || 0),
      status,
      Number(alert_days_before || 7)
    );

  res.status(201).json(
    db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId)
  );
});

router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  db.prepare('UPDATE reminders SET status = ? WHERE id = ? AND user_id = ?').run(status, id, req.userId);
  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!row) return res.status(404).json({ error: 'reminder not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  res.status(204).send();
});

export default router;
