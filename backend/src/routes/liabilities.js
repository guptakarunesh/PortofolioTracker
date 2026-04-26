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

function validateLiabilityPayload({ loan_type, lender, holder_type, outstanding_amount }) {
  if (!String(loan_type || '').trim()) {
    return { error: 'loan_type_required', message: 'Loan type is required.' };
  }
  if (!String(lender || '').trim()) {
    return { error: 'lender_required', message: 'Lender is required.' };
  }
  if (!String(holder_type || '').trim()) {
    return { error: 'holder_type_required', message: 'Holder type is required.' };
  }
  const outstandingAmountCheck = parseNonNegativeNumber(outstanding_amount);
  if (outstandingAmountCheck.missing) {
    return { error: 'outstanding_amount_required', message: 'Outstanding amount is required.' };
  }
  if (!outstandingAmountCheck.ok) {
    return { error: 'outstanding_amount_invalid', message: 'Outstanding amount must be a valid non-negative number.' };
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

function toPublicLiabilityRow(row, fallbackUserId = null) {
  return {
    ...row,
    updated_by_initials:
      String(row.updated_by_initials || '').trim() && String(row.updated_by_initials || '').toUpperCase() !== 'NA'
        ? row.updated_by_initials
        : resolveUpdatedByInitials(row.user_id, fallbackUserId),
    lender: decryptString(row.lender),
    account_ref: maskIdentifier(decryptString(row.account_ref)),
    relationship_mobile: maskContactLast4(decryptString(row.relationship_mobile)),
    notes: row.notes ? 'Locked. Enter PIN to view details.' : '',
    sensitive_locked: true
  };
}

router.get('/', (req, res) => {
  const fallbackInitials = resolveUpdatedByInitials(req.accountUserId);
  if (fallbackInitials !== 'NA') {
    db.prepare(`
      UPDATE liabilities
      SET updated_by_initials = ?
      WHERE user_id = ?
        AND (updated_by_initials IS NULL OR TRIM(updated_by_initials) = '' OR UPPER(updated_by_initials) = 'NA')
    `).run(fallbackInitials, req.accountUserId);
  }
  const rows = db
    .prepare('SELECT * FROM liabilities WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.accountUserId);
  const mapped = rows.map((row) => toPublicLiabilityRow(row, req.accountUserId));
  res.json(mapped);
});

router.post('/:id/reveal', (req, res) => {
  const ownerUserId = req.accountUserId;
  const id = Number(req.params.id);
  const pin = String(req.body?.pin || '');
  const check = verifyOwnerSecurityPin(ownerUserId, pin);
  if (!check.ok) {
    logSensitiveAccess({
      ownerUserId,
      actorUserId: req.userId,
      entityType: 'liability',
      entityId: id || 0,
      action: check.code,
      ipAddress: String(req.ip || '')
    });
    return res.status(check.code === 'pin_not_set' ? 428 : 401).json({
      error: check.code,
      message: check.message
    });
  }

  const row = db
    .prepare('SELECT * FROM liabilities WHERE id = ? AND user_id = ?')
    .get(id, ownerUserId);
  if (!row) return res.status(404).json({ error: 'liability_not_found', message: 'Liability not found.' });

  logSensitiveAccess({
    ownerUserId,
    actorUserId: req.userId,
    entityType: 'liability',
    entityId: id,
    action: 'revealed',
    ipAddress: String(req.ip || '')
  });
  notifySensitiveInfoViewed({
    ownerUserId,
    actorUserId: req.userId,
    entityType: 'liability',
    entityId: id
  });

  return res.json({
    id: row.id,
    account_ref: decryptString(row.account_ref),
    relationship_mobile: decryptString(row.relationship_mobile),
    notes: decryptString(row.notes)
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
    loan_type,
    lender,
    holder_type = 'Self',
    reach_via = 'Branch',
    relationship_mobile = '',
    account_ref = '',
    original_amount = 0,
    outstanding_amount = 0,
    interest_rate = 0,
    emi_amount = 0,
    emi_day = '',
    tenure_remaining = '',
    end_date = '',
    notes = '',
    notes_for_family = ''
  } = req.body;

  const validationError = validateLiabilityPayload({
    loan_type: req.body?.loan_type,
    lender: req.body?.lender,
    holder_type: req.body?.holder_type,
    outstanding_amount: req.body?.outstanding_amount
  });
  if (validationError) {
    return res.status(400).json(validationError);
  }

  const subscription = fetchSubscription(userId);
  if (isBasicActive(subscription)) {
    const count = db.prepare('SELECT COUNT(*) as c FROM liabilities WHERE user_id = ?').get(userId).c;
    if (Number(count) >= 5) {
      return res.status(403).json({
        error: 'basic_limit_reached',
        message: 'Basic plan allows up to 5 liabilities. Upgrade to Premium for unlimited liabilities.',
        limit: 5
      });
    }
  }

  const effectiveNotes = String(notes_for_family || notes || '');
  const updatedByInitials = resolveUpdatedByInitials(req.userId, req.accountUserId);

  const result = db
    .prepare(`
    INSERT INTO liabilities (
      user_id, loan_type, lender, holder_type, reach_via, relationship_mobile, account_ref, original_amount, outstanding_amount,
      interest_rate, emi_amount, emi_day, tenure_remaining, end_date, notes, updated_by_initials, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      userId,
      loan_type,
      encryptString(lender),
      holder_type,
      reach_via,
      encryptString(relationship_mobile),
      encryptString(account_ref),
      Number(original_amount || 0),
      Number(outstanding_amount || 0),
      Number(interest_rate || 0),
      Number(emi_amount || 0),
      emi_day,
      tenure_remaining,
      end_date,
      encryptString(effectiveNotes),
      updatedByInitials,
      nowIso()
    );

  const created = db
    .prepare('SELECT * FROM liabilities WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, userId);
  res.status(201).json(toPublicLiabilityRow(created, userId));
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
    holder_type: req.body?.holder_type != null ? req.body.holder_type : existing.holder_type,
    reach_via: req.body?.reach_via != null ? req.body.reach_via : existing.reach_via,
    relationship_mobile:
      req.body?.relationship_mobile != null ? encryptString(req.body.relationship_mobile) : existing.relationship_mobile,
    account_ref: req.body?.account_ref != null ? encryptString(req.body.account_ref) : existing.account_ref,
    notes:
      req.body?.notes_for_family != null
        ? encryptString(req.body.notes_for_family)
        : req.body?.notes != null
          ? encryptString(req.body.notes)
          : existing.notes,
    updated_by_initials: resolveUpdatedByInitials(req.userId, req.accountUserId),
    updated_at: nowIso(),
    id,
    user_id: req.accountUserId
  };
  const validationError = validateLiabilityPayload({
    loan_type: req.body?.loan_type != null ? req.body.loan_type : existing.loan_type,
    lender: req.body?.lender != null ? req.body.lender : decryptString(existing.lender),
    holder_type: req.body?.holder_type != null ? req.body.holder_type : existing.holder_type,
    outstanding_amount: req.body?.outstanding_amount != null ? req.body.outstanding_amount : existing.outstanding_amount
  });
  if (validationError) {
    return res.status(400).json(validationError);
  }
  db.prepare(`
    UPDATE liabilities SET
      loan_type=@loan_type,
      lender=@lender,
      holder_type=@holder_type,
      reach_via=@reach_via,
      relationship_mobile=@relationship_mobile,
      account_ref=@account_ref,
      original_amount=@original_amount,
      outstanding_amount=@outstanding_amount,
      interest_rate=@interest_rate,
      emi_amount=@emi_amount,
      emi_day=@emi_day,
      tenure_remaining=@tenure_remaining,
      end_date=@end_date,
      notes=@notes,
      updated_by_initials=@updated_by_initials,
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
  res.json(toPublicLiabilityRow(row, req.accountUserId));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM liabilities WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.accountUserId);
  res.status(204).send();
});

export default router;
