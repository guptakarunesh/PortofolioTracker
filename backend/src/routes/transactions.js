import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC')
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const {
    tx_date,
    category,
    sub_category = '',
    tx_type,
    asset_name = '',
    amount,
    units = null,
    price = null,
    account_ref = '',
    remarks = ''
  } = req.body;

  if (!tx_date || !category || !tx_type || amount == null) {
    return res.status(400).json({ error: 'tx_date, category, tx_type and amount are required' });
  }

  const result = db
    .prepare(`
    INSERT INTO transactions (
      user_id, tx_date, category, sub_category, tx_type, asset_name,
      amount, units, price, account_ref, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      req.userId,
      tx_date,
      category,
      sub_category,
      tx_type,
      asset_name,
      Number(amount),
      units == null || units === '' ? null : Number(units),
      price == null || price === '' ? null : Number(price),
      account_ref,
      remarks
    );

  res.status(201).json(
    db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.userId)
  );
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  res.status(204).send();
});

export default router;
