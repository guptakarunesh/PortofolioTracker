import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { fetchSubscription, isBasicActive } from '../lib/subscription.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import requireActiveSubscription from '../middleware/requireActiveSubscription.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();

router.get('/', (req, res) => {
  const userId = req.accountUserId;
  const category = req.query.category;
  const rows = category
    ? db
        .prepare('SELECT * FROM assets WHERE user_id = ? AND category = ? ORDER BY updated_at DESC')
        .all(userId, category)
    : db.prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  res.json(
    rows.map((row) => ({
      ...row,
      name: decryptString(row.name),
      institution: decryptString(row.institution),
      account_ref: decryptString(row.account_ref)
      ,
      notes: decryptString(row.notes)
    }))
  );
});

router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireActiveSubscription(req, res, (err) => {
    if (err) return next(err);
    return requireAccountWrite(req, res, next);
  });
});

router.post('/', (req, res) => {
  const userId = req.accountUserId;
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
    metadata = '{}',
    tracking_url = ''
  } = req.body;

  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  const subscription = fetchSubscription(userId);
  if (isBasicActive(subscription)) {
    const count = db.prepare('SELECT COUNT(*) as c FROM assets WHERE user_id = ?').get(userId).c;
    if (Number(count) >= 10) {
      return res.status(403).json({
        error: 'basic_limit_reached',
        message: 'Basic plan allows up to 10 assets. Upgrade to Premium for unlimited assets.',
        limit: 10
      });
    }
  }

  const result = db
    .prepare(`
    INSERT INTO assets (
      user_id, category, sub_category, name, institution, account_ref,
      quantity, invested_amount, current_value, notes, metadata, tracking_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      userId,
      category,
      sub_category,
      encryptString(name),
      encryptString(institution),
      encryptString(account_ref),
      Number(quantity || 0),
      Number(invested_amount || 0),
      Number(current_value || 0),
      encryptString(notes),
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      tracking_url,
      nowIso()
    );

  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, userId);
  return res.status(201).json({
    ...row,
    name: decryptString(row.name),
    institution: decryptString(row.institution),
    account_ref: decryptString(row.account_ref)
    ,
    notes: decryptString(row.notes)
  });
});

router.put('/:id', (req, res) => {
  const userId = req.accountUserId;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return res.status(404).json({ error: 'asset not found' });

  const payload = {
    ...existing,
    ...req.body,
    name: req.body?.name != null ? encryptString(req.body.name) : existing.name,
    institution: req.body?.institution != null ? encryptString(req.body.institution) : existing.institution,
    account_ref: req.body?.account_ref != null ? encryptString(req.body.account_ref) : existing.account_ref,
    notes: req.body?.notes != null ? encryptString(req.body.notes) : existing.notes,
    updated_at: nowIso()
  };
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
      tracking_url=@tracking_url,
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

  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  res.json({
    ...row,
    name: decryptString(row.name),
    institution: decryptString(row.institution),
    account_ref: decryptString(row.account_ref)
    ,
    notes: decryptString(row.notes)
  });
});

router.delete('/:id', (req, res) => {
  const userId = req.accountUserId;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(id, userId);
  res.status(204).send();
});

export default router;
