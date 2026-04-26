import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { fetchSubscription, isBasicActive } from '../lib/subscription.js';
import { decryptString, encryptString } from '../lib/crypto.js';
import requireActiveSubscription from '../middleware/requireActiveSubscription.js';
import { requireAccountWrite } from '../middleware/accountAccess.js';
import {
  logSensitiveAccess,
  maskContactLast4,
  maskIdentifier,
  notifySensitiveInfoViewed,
  sanitizeTrackingUrl,
  verifyOwnerSecurityPin
} from '../lib/sensitiveAccess.js';

const router = Router();

function parseNonNegativeNumber(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { ok: false, missing: true };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, missing: false };
  return { ok: true, missing: false };
}

function validateAssetPayload({ category, name, reach_via, current_value }) {
  if (!String(category || '').trim()) {
    return { error: 'category_required', message: 'Category is required.' };
  }
  if (!String(name || '').trim()) {
    return { error: 'name_required', message: 'Institution name is required.' };
  }
  if (!String(reach_via || '').trim()) {
    return { error: 'reach_via_required', message: 'Reach via is required.' };
  }
  const currentValueCheck = parseNonNegativeNumber(current_value);
  if (currentValueCheck.missing) {
    return { error: 'current_value_required', message: 'Current value is required.' };
  }
  if (!currentValueCheck.ok) {
    return { error: 'current_value_invalid', message: 'Current value must be a valid non-negative number.' };
  }
  return null;
}

function initialsFromName(name = '') {
  const compact = String(name || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,2}$/.test(compact)) return compact;
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function actorInitials(userId) {
  if (!userId) return 'NA';
  const row = db.prepare('SELECT full_name FROM users WHERE id = ?').get(userId);
  const fullName = decryptString(row?.full_name || '');
  return initialsFromName(fullName);
}

function resolveUpdatedByInitials(primaryUserId, fallbackUserId = null) {
  const primary = actorInitials(primaryUserId);
  if (primary && primary !== 'NA') return primary;
  if (fallbackUserId) {
    const fallback = actorInitials(fallbackUserId);
    if (fallback && fallback !== 'NA') return fallback;
  }
  return 'NA';
}

function toPublicAssetRow(row, fallbackUserId = null) {
  return {
    ...row,
    updated_by_initials:
      String(row.updated_by_initials || '').trim() && String(row.updated_by_initials || '').toUpperCase() !== 'NA'
        ? row.updated_by_initials
        : resolveUpdatedByInitials(row.user_id, fallbackUserId),
    name: decryptString(row.name),
    institution: decryptString(row.institution),
    account_ref: maskIdentifier(decryptString(row.account_ref)),
    relationship_mobile: maskContactLast4(decryptString(row.relationship_mobile)),
    notes: row.notes ? 'Locked. Enter PIN to view details.' : '',
    sensitive_locked: true
  };
}

router.get('/', (req, res) => {
  const userId = req.accountUserId;
  const fallbackInitials = resolveUpdatedByInitials(userId);
  if (fallbackInitials !== 'NA') {
    db.prepare(`
      UPDATE assets
      SET updated_by_initials = ?
      WHERE user_id = ?
        AND (updated_by_initials IS NULL OR TRIM(updated_by_initials) = '' OR UPPER(updated_by_initials) = 'NA')
    `).run(fallbackInitials, userId);
  }
  const category = req.query.category;
  const rows = category
    ? db
        .prepare('SELECT * FROM assets WHERE user_id = ? AND category = ? ORDER BY updated_at DESC')
        .all(userId, category)
    : db.prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  res.json(rows.map((row) => toPublicAssetRow(row, userId)));
});

router.post('/:id/reveal', (req, res) => {
  const userId = req.accountUserId;
  const id = Number(req.params.id);
  const pin = String(req.body?.pin || '');
  const check = verifyOwnerSecurityPin(userId, pin);
  if (!check.ok) {
    logSensitiveAccess({
      ownerUserId: userId,
      actorUserId: req.userId,
      entityType: 'asset',
      entityId: id || 0,
      action: check.code,
      ipAddress: String(req.ip || '')
    });
    return res.status(check.code === 'pin_not_set' ? 428 : 401).json({
      error: check.code,
      message: check.message
    });
  }

  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return res.status(404).json({ error: 'asset_not_found', message: 'Asset not found.' });

  logSensitiveAccess({
    ownerUserId: userId,
    actorUserId: req.userId,
    entityType: 'asset',
    entityId: id,
    action: 'revealed',
    ipAddress: String(req.ip || '')
  });
  notifySensitiveInfoViewed({
    ownerUserId: userId,
    actorUserId: req.userId,
    entityType: 'asset',
    entityId: id
  });

  return res.json({
    id: row.id,
    account_ref: decryptString(row.account_ref),
    relationship_mobile: decryptString(row.relationship_mobile),
    notes: decryptString(row.notes),
    tracking_url: row.tracking_url || ''
  });
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
    holder_type = 'Self',
    reach_via = 'Branch',
    relationship_mobile = '',
    account_ref = '',
    quantity = 0,
    invested_amount = 0,
    current_value = 0,
    notes = '',
    notes_for_family = '',
    metadata = '{}',
    tracking_url = ''
  } = req.body;

  const validationError = validateAssetPayload({
    category: req.body?.category,
    name: req.body?.name,
    reach_via: req.body?.reach_via,
    current_value: req.body?.current_value
  });
  if (validationError) {
    return res.status(400).json(validationError);
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

  const effectiveNotes = String(notes_for_family || notes || '');
  const updatedByInitials = resolveUpdatedByInitials(req.userId, req.accountUserId);

  const result = db
    .prepare(`
    INSERT INTO assets (
      user_id, category, sub_category, name, institution, holder_type, reach_via, relationship_mobile, account_ref,
      quantity, invested_amount, current_value, notes, metadata, tracking_url, updated_by_initials, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      userId,
      category,
      sub_category,
      encryptString(name),
      encryptString(institution),
      holder_type,
      reach_via,
      encryptString(relationship_mobile),
      encryptString(account_ref),
      Number(quantity || 0),
      Number(invested_amount || 0),
      Number(current_value || 0),
      encryptString(effectiveNotes),
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      sanitizeTrackingUrl(tracking_url),
      updatedByInitials,
      nowIso()
    );

  const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, userId);
  return res.status(201).json(toPublicAssetRow(row, userId));
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
    relationship_mobile:
      req.body?.relationship_mobile != null ? encryptString(req.body.relationship_mobile) : existing.relationship_mobile,
    notes:
      req.body?.notes_for_family != null
        ? encryptString(req.body.notes_for_family)
        : req.body?.notes != null
          ? encryptString(req.body.notes)
          : existing.notes,
    holder_type: req.body?.holder_type != null ? req.body.holder_type : existing.holder_type,
    reach_via: req.body?.reach_via != null ? req.body.reach_via : existing.reach_via,
    updated_by_initials: resolveUpdatedByInitials(req.userId, req.accountUserId),
    tracking_url: req.body?.tracking_url != null ? sanitizeTrackingUrl(req.body.tracking_url) : existing.tracking_url,
    updated_at: nowIso()
  };
  const validationError = validateAssetPayload({
    category: req.body?.category != null ? req.body.category : existing.category,
    name: req.body?.name != null ? req.body.name : decryptString(existing.name),
    reach_via: req.body?.reach_via != null ? req.body.reach_via : existing.reach_via,
    current_value: req.body?.current_value != null ? req.body.current_value : existing.current_value
  });
  if (validationError) {
    return res.status(400).json(validationError);
  }
  db.prepare(`
    UPDATE assets SET
      category=@category,
      sub_category=@sub_category,
      name=@name,
      institution=@institution,
      holder_type=@holder_type,
      reach_via=@reach_via,
      relationship_mobile=@relationship_mobile,
      account_ref=@account_ref,
      quantity=@quantity,
      invested_amount=@invested_amount,
      current_value=@current_value,
      notes=@notes,
      metadata=@metadata,
      tracking_url=@tracking_url,
      updated_by_initials=@updated_by_initials,
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
  res.json(toPublicAssetRow(row, userId));
});

router.delete('/:id', (req, res) => {
  const userId = req.accountUserId;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(id, userId);
  res.status(204).send();
});

export default router;
