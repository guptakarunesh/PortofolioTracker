import { Router } from 'express';
import { db } from '../lib/db.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import requireActiveSubscription from '../middleware/requireActiveSubscription.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC')
    .all(req.accountUserId)
    .map((row) => ({
      ...row,
      asset_name: decryptString(row.asset_name),
      account_ref: decryptString(row.account_ref),
      remarks: decryptString(row.remarks)
    }));
  res.json(rows);
});

router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireActiveSubscription(req, res, (err) => {
    if (err) return next(err);
    return requireAccountWrite(req, res, next);
  });
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
      req.accountUserId,
      tx_date,
      category,
      sub_category,
      tx_type,
      encryptString(asset_name),
      Number(amount),
      units == null || units === '' ? null : Number(units),
      price == null || price === '' ? null : Number(price),
      encryptString(account_ref),
      encryptString(remarks)
    );

  const row = db
    .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, req.accountUserId);
  res.status(201).json({
    ...row,
    asset_name: decryptString(row.asset_name),
    account_ref: decryptString(row.account_ref),
    remarks: decryptString(row.remarks)
  });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.accountUserId);
  res.status(204).send();
});

export default router;
