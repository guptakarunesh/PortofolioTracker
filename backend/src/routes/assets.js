import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const userId = req.userId;
  const category = req.query.category;
  const rows = category
    ? db
        .prepare('SELECT * FROM assets WHERE user_id = ? AND category = ? ORDER BY updated_at DESC')
        .all(userId, category)
    : db.prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const userId = req.userId;
  const {
    category,
    sub_category = '',
    name,
    institution = '',
    account_ref = '',
    quantity = 0,
    invested_amount = 0,
    current_value = 0,
    notes = '',
    metadata = '{}'
  } = req.body;

  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  const result = db
    .prepare(`
    INSERT INTO assets (
      user_id, category, sub_category, name, institution, account_ref,
      quantity, invested_amount, current_value, notes, metadata, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      userId,
      category,
      sub_category,
      name,
      institution,
      account_ref,
      Number(quantity || 0),
      Number(invested_amount || 0),
      Number(current_value || 0),
      notes,
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      nowIso()
    );

  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, userId);
  return res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const userId = req.userId;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'asset not found' });

  const payload = { ...existing, ...req.body, updated_at: nowIso() };
  db.prepare(`
    UPDATE assets SET
      category=@category,
      sub_category=@sub_category,
      name=@name,
      institution=@institution,
      account_ref=@account_ref,
      quantity=@quantity,
      invested_amount=@invested_amount,
      current_value=@current_value,
      notes=@notes,
      metadata=@metadata,
      updated_at=@updated_at
    WHERE id=@id AND user_id=@user_id
  `).run({
    ...payload,
    id,
    user_id: userId,
    quantity: Number(payload.quantity || 0),
    invested_amount: Number(payload.invested_amount || 0),
    current_value: Number(payload.current_value || 0),
    metadata: typeof payload.metadata === 'string' ? payload.metadata : JSON.stringify(payload.metadata || {})
  });

  res.json(db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId));
});

router.delete('/:id', (req, res) => {
  const userId = req.userId;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(id, userId);
  res.status(204).send();
});

export default router;
