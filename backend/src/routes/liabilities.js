import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import requireActiveSubscription from '../middleware/requireActiveSubscription.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM liabilities WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.accountUserId)
    .map((row) => ({
      ...row,
      lender: decryptString(row.lender),
      account_ref: decryptString(row.account_ref)
      ,
      notes: decryptString(row.notes)
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
    loan_type,
    lender,
    account_ref = '',
    original_amount = 0,
    outstanding_amount = 0,
    interest_rate = 0,
    emi_amount = 0,
    emi_day = '',
    tenure_remaining = '',
    end_date = '',
    notes = ''
  } = req.body;

  if (!loan_type || !lender) {
    return res.status(400).json({ error: 'loan_type and lender are required' });
  }

  const result = db
    .prepare(`
    INSERT INTO liabilities (
      user_id, loan_type, lender, account_ref, original_amount, outstanding_amount,
      interest_rate, emi_amount, emi_day, tenure_remaining, end_date, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      req.accountUserId,
      loan_type,
      encryptString(lender),
      encryptString(account_ref),
      Number(original_amount || 0),
      Number(outstanding_amount || 0),
      Number(interest_rate || 0),
      Number(emi_amount || 0),
      emi_day,
      tenure_remaining,
      end_date,
      encryptString(notes),
      nowIso()
    );

  const created = db
    .prepare('SELECT * FROM liabilities WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, req.accountUserId);
  res.status(201).json({
    ...created,
    lender: decryptString(created.lender),
    account_ref: decryptString(created.account_ref)
    ,
    notes: decryptString(created.notes)
  });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM liabilities WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!existing) return res.status(404).json({ error: 'liability not found' });

  const payload = {
    ...existing,
    ...req.body,
    lender: req.body?.lender != null ? encryptString(req.body.lender) : existing.lender,
    account_ref: req.body?.account_ref != null ? encryptString(req.body.account_ref) : existing.account_ref,
    notes: req.body?.notes != null ? encryptString(req.body.notes) : existing.notes,
    updated_at: nowIso(),
    id,
    user_id: req.accountUserId
  };
  db.prepare(`
    UPDATE liabilities SET
      loan_type=@loan_type,
      lender=@lender,
      account_ref=@account_ref,
      original_amount=@original_amount,
      outstanding_amount=@outstanding_amount,
      interest_rate=@interest_rate,
      emi_amount=@emi_amount,
      emi_day=@emi_day,
      tenure_remaining=@tenure_remaining,
      end_date=@end_date,
      notes=@notes,
      updated_at=@updated_at
    WHERE id=@id AND user_id=@user_id
  `).run({
    ...payload,
    original_amount: Number(payload.original_amount || 0),
    outstanding_amount: Number(payload.outstanding_amount || 0),
    interest_rate: Number(payload.interest_rate || 0),
    emi_amount: Number(payload.emi_amount || 0)
  });

  const row = db.prepare('SELECT * FROM liabilities WHERE id = ? AND user_id = ?').get(id, req.accountUserId);
  res.json({
    ...row,
    lender: decryptString(row.lender),
    account_ref: decryptString(row.account_ref)
    ,
    notes: decryptString(row.notes)
  });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM liabilities WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.accountUserId);
  res.status(204).send();
});

export default router;
