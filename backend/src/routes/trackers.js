import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';

const router = Router();
const toTrackerResponse = (row) => ({
  id: row.id,
  user_id: row.user_id,
  asset_name: decryptString(row.asset_name),
  website_url: row.website_url,
  login_id: decryptString(row.login_id),
  notes: decryptString(row.notes),
  updated_at: row.updated_at
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM asset_trackers WHERE user_id = ? ORDER BY updated_at DESC, id DESC')
    .all(req.accountUserId)
    .map((row) => toTrackerResponse(row));
  res.json(rows);
});

router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return requireAccountWrite(req, res, next);
});

router.post('/', (req, res) => {
  const {
    asset_name,
    website_url,
    login_id,
    login_password = '',
    notes = ''
  } = req.body || {};

  if (!asset_name || !website_url || !login_id) {
    return res.status(400).json({
      error: 'asset_name, website_url and login_id are required'
    });
  }

  const result = db
    .prepare(`
      INSERT INTO asset_trackers (
        user_id, asset_name, website_url, login_id, login_password, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      req.accountUserId,
      encryptString(asset_name),
      website_url,
      encryptString(login_id),
      encryptString(login_password),
      encryptString(notes),
      nowIso()
    );

  const row = db
    .prepare('SELECT * FROM asset_trackers WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, req.accountUserId);
  return res.status(201).json(toTrackerResponse(row));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM asset_trackers WHERE id = ? AND user_id = ?')
    .get(id, req.accountUserId);
  if (!existing) return res.status(404).json({ error: 'tracker not found' });

  const payload = {
    ...existing,
    ...req.body,
    asset_name: req.body?.asset_name != null ? encryptString(req.body.asset_name) : existing.asset_name,
    login_id: req.body?.login_id != null ? encryptString(req.body.login_id) : existing.login_id,
    login_password: req.body?.login_password != null ? encryptString(req.body.login_password) : existing.login_password,
    notes: req.body?.notes != null ? encryptString(req.body.notes) : existing.notes,
    updated_at: nowIso()
  };

  if (!payload.asset_name || !payload.website_url || !payload.login_id) {
    return res.status(400).json({
      error: 'asset_name, website_url and login_id are required'
    });
  }

  db.prepare(`
    UPDATE asset_trackers SET
      asset_name=@asset_name,
      website_url=@website_url,
      login_id=@login_id,
      login_password=@login_password,
      notes=@notes,
      updated_at=@updated_at
    WHERE id=@id AND user_id=@user_id
  `).run({
    ...payload,
    id,
    user_id: req.accountUserId
  });

  const row = db.prepare('SELECT * FROM asset_trackers WHERE id = ? AND user_id = ?').get(id, req.accountUserId);
  return res.json(toTrackerResponse(row));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM asset_trackers WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.accountUserId);
  res.status(204).send();
});

export default router;
