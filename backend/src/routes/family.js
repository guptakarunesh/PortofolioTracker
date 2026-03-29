import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { decryptString, encryptString, hashLookup } from '../lib/crypto.js';
import { normalizeMobile, isValidIndianMobile } from '../lib/auth.js';
import {
  ensureStandaloneSubscriptionAfterFamilyLeave,
  ensureSubscriptionForUser,
  isPremiumActive
} from '../lib/subscription.js';
import { requireAccountAdmin } from '../middleware/accountAccess.js';

const router = Router();
const VALID_ROLES = new Set(['read', 'write', 'admin']);
const INVITE_TTL_DAYS = 7;

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

function requireFamilyPremium(req, res, next) {
  const subscription = ensureSubscriptionForUser(req.accountOwnerId || req.accountUserId || req.userId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'family' });
  }
  return next();
}

function memberRow(row) {
  return {
    id: row.id,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member: {
      id: row.member_id,
      full_name: initialsFromName(decryptString(row.full_name)),
      mobile: decryptString(row.mobile),
      email: decryptString(row.email || '')
    }
  };
}

function adminInitialsForOwner(ownerId) {
  const owner = db.prepare('SELECT full_name FROM users WHERE id = ?').get(ownerId);
  const names = [decryptString(owner?.full_name || '')];
  const adminMembers = db
    .prepare(`
      SELECT u.full_name
      FROM family_members fm
      JOIN users u ON u.id = fm.member_user_id
      WHERE fm.owner_user_id = ? AND fm.role = 'admin'
      ORDER BY fm.created_at ASC
    `)
    .all(ownerId);
  adminMembers.forEach((row) => names.push(decryptString(row?.full_name || '')));
  return [...new Set(names.map((value) => initialsFromName(value)).filter(Boolean))];
}

function inviteRow(row) {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    mobile: decryptString(row.mobile_encrypted)
  };
}

function normalizeActorInitials(value = '') {
  const text = String(value || '').trim().toUpperCase();
  return text || 'NA';
}

function formatRecentFamilyAction(action = '') {
  switch (String(action || '').trim()) {
    case 'invite_created':
      return 'family_invite_created';
    case 'invite_accepted':
      return 'family_invite_accepted';
    case 'invite_canceled':
      return 'family_invite_canceled';
    case 'invite_resent':
      return 'family_invite_resent';
    case 'member_added':
      return 'family_member_added';
    case 'member_removed':
      return 'family_member_removed';
    case 'member_role_updated':
      return 'family_role_updated';
    case 'member_left':
      return 'family_member_left';
    default:
      return 'family_updated';
  }
}

function logFamilyAudit(ownerUserId, actorUserId, action, meta = {}) {
  db.prepare(`
    INSERT INTO family_audit (owner_user_id, actor_user_id, action, meta, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ownerUserId, actorUserId || null, action, JSON.stringify(meta || {}), nowIso());
}

function expireInvites(ownerId) {
  const now = nowIso();
  db.prepare(`
    UPDATE family_invites
    SET status = 'expired', updated_at = ?
    WHERE owner_user_id = ? AND status = 'pending' AND expires_at <= ?
  `).run(now, ownerId, now);
}

router.get('/', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const ownerId = req.accountUserId;
  expireInvites(ownerId);
  const owner = db.prepare('SELECT id, full_name, mobile, email FROM users WHERE id = ?').get(ownerId);
  const members = db
    .prepare(`
      SELECT fm.id, fm.role, fm.created_at, fm.updated_at,
             u.id as member_id, u.full_name, u.mobile, u.email
      FROM family_members fm
      JOIN users u ON u.id = fm.member_user_id
      WHERE fm.owner_user_id = ?
      ORDER BY fm.created_at ASC
    `)
    .all(ownerId)
    .map(memberRow);
  const invites = db
    .prepare(
      `
      SELECT id, role, status, expires_at, created_at, updated_at, mobile_encrypted
      FROM family_invites
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(ownerId)
    .map(inviteRow);

  return res.json({
    owner: owner
      ? {
          id: owner.id,
          full_name: initialsFromName(decryptString(owner.full_name)),
          mobile: decryptString(owner.mobile),
          email: decryptString(owner.email || '')
        }
      : null,
    members,
    invites
  });
});

router.get('/access', (req, res) => {
  const ownerId = req.accountUserId;
  const owner = db.prepare('SELECT id, full_name, mobile, email FROM users WHERE id = ?').get(ownerId);
  return res.json({
    role: req.accessRole,
    is_owner: req.isAccountOwner,
    can_manage_subscription: Boolean(req.isAccountOwner || req.isAccountAdmin),
    admin_initials: adminInitialsForOwner(ownerId),
    owner: owner
      ? {
          id: owner.id,
          full_name: initialsFromName(decryptString(owner.full_name)),
          mobile: decryptString(owner.mobile),
          email: decryptString(owner.email || '')
        }
      : null
  });
});

router.post('/leave', (req, res) => {
  if (req.isAccountOwner) {
    return res.status(400).json({ error: 'owner_cannot_leave_family', message: 'Account owner cannot leave family access.' });
  }

  const membership = db
    .prepare(`
      SELECT id, owner_user_id, role
      FROM family_members
      WHERE owner_user_id = ? AND member_user_id = ?
      LIMIT 1
    `)
    .get(req.accountOwnerId || req.accountUserId, req.userId);

  if (!membership) {
    return res.status(404).json({ error: 'family_membership_not_found', message: 'Family membership not found.' });
  }

  db.prepare('DELETE FROM family_members WHERE id = ?').run(membership.id);
  logFamilyAudit(membership.owner_user_id, req.userId, 'member_left', {
    member_user_id: req.userId,
    role: membership.role
  });

  const subscription = ensureStandaloneSubscriptionAfterFamilyLeave(req.userId, nowIso());
  return res.json({
    ok: true,
    subscription: subscription
      ? {
          plan: subscription.plan || 'none',
          status: subscription.status || 'expired',
          started_at: subscription.started_at || null,
          current_period_end: subscription.current_period_end || null,
          provider: subscription.provider || null
        }
      : null
  });
});

router.post('/', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const { mobile, role = 'read' } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }
  if (!VALID_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const ownerId = req.accountUserId;
  expireInvites(ownerId);
  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT id FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    const existingInvite = db
      .prepare(
        `SELECT id FROM family_invites WHERE owner_user_id = ? AND mobile_hash = ? AND status = 'pending'`
      )
      .get(ownerId, mobileHash);
    if (existingInvite) {
      return res.status(409).json({ error: 'Invite already sent to this mobile number' });
    }

    const otherInvite = db
      .prepare(
        `SELECT id FROM family_invites WHERE mobile_hash = ? AND status = 'pending' LIMIT 1`
      )
      .get(mobileHash);
    if (otherInvite) {
      return res.status(409).json({ error: 'This user already has a pending family invite' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
    const now = nowIso();
    const result = db
      .prepare(
        `
        INSERT INTO family_invites (
          owner_user_id, mobile_hash, mobile_encrypted, role, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      `
      )
      .run(ownerId, mobileHash, encryptString(cleanMobile), role, expiresAt.toISOString(), now, now);

    logFamilyAudit(ownerId, req.userId, 'invite_created', { mobile: cleanMobile, role });
    const invite = db
      .prepare(
        `SELECT id, role, status, expires_at, created_at, updated_at, mobile_encrypted FROM family_invites WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    return res.status(201).json({ invite: inviteRow(invite) });
  }
  if (user.id === ownerId) {
    return res.status(400).json({ error: 'Owner cannot be added as a family member' });
  }

  const existingMember = db
    .prepare('SELECT owner_user_id FROM family_members WHERE member_user_id = ?')
    .get(user.id);
  if (existingMember) {
    return res.status(409).json({ error: 'This user is already part of another family' });
  }

  const now = nowIso();
  const result = db
    .prepare(`
      INSERT INTO family_members (owner_user_id, member_user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(ownerId, user.id, role, now, now);

  logFamilyAudit(ownerId, req.userId, 'member_added', { member_user_id: user.id, role });

  const row = db
    .prepare(`
      SELECT fm.id, fm.role, fm.created_at, fm.updated_at,
             u.id as member_id, u.full_name, u.mobile, u.email
      FROM family_members fm
      JOIN users u ON u.id = fm.member_user_id
      WHERE fm.id = ?
    `)
    .get(result.lastInsertRowid);

  return res.status(201).json(memberRow(row));
});

router.put('/:id', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!VALID_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const ownerId = req.accountUserId;
  const existing = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND owner_user_id = ?')
    .get(id, ownerId);
  if (!existing) {
    return res.status(404).json({ error: 'Family member not found' });
  }

  db.prepare('UPDATE family_members SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), id);
  logFamilyAudit(ownerId, req.userId, 'member_role_updated', { member_id: id, role });

  const row = db
    .prepare(`
      SELECT fm.id, fm.role, fm.created_at, fm.updated_at,
             u.id as member_id, u.full_name, u.mobile, u.email
      FROM family_members fm
      JOIN users u ON u.id = fm.member_user_id
      WHERE fm.id = ?
    `)
    .get(id);

  return res.json(memberRow(row));
});

router.delete('/invites/:id', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ownerId = req.accountUserId;
  const existing = db
    .prepare('SELECT id, mobile_encrypted, role FROM family_invites WHERE id = ? AND owner_user_id = ?')
    .get(id, ownerId);
  if (!existing) {
    return res.status(404).json({ error: 'Invite not found' });
  }
  db.prepare('UPDATE family_invites SET status = ?, updated_at = ? WHERE id = ?').run('canceled', nowIso(), id);
  logFamilyAudit(ownerId, req.userId, 'invite_canceled', {
    mobile: decryptString(existing.mobile_encrypted),
    role: existing.role
  });
  res.status(204).send();
});

router.post('/invites/:id/resend', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ownerId = req.accountUserId;
  const existing = db
    .prepare(
      'SELECT id, mobile_encrypted, role, status, expires_at FROM family_invites WHERE id = ? AND owner_user_id = ?'
    )
    .get(id, ownerId);
  if (!existing) {
    return res.status(404).json({ error: 'Invite not found' });
  }
  if (existing.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending invites can be resent' });
  }
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  db.prepare('UPDATE family_invites SET expires_at = ?, updated_at = ? WHERE id = ?').run(
    expiresAt.toISOString(),
    nowIso(),
    id
  );
  logFamilyAudit(ownerId, req.userId, 'invite_resent', {
    mobile: decryptString(existing.mobile_encrypted),
    role: existing.role
  });
  return res.json({ ok: true, expires_at: expiresAt.toISOString() });
});

router.get('/audit', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const ownerId = req.accountUserId;
  const rows = db
    .prepare(
      `
      SELECT a.id, a.action, a.meta, a.created_at,
             u.id as actor_id, u.full_name, u.mobile, u.email
      FROM family_audit a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.owner_user_id = ?
      ORDER BY a.created_at DESC
      LIMIT 200
    `
    )
    .all(ownerId)
    .map((row) => ({
      id: row.id,
      action: row.action,
      meta: row.meta ? JSON.parse(row.meta) : {},
      created_at: row.created_at,
      actor: row.actor_id
        ? {
            id: row.actor_id,
            full_name: initialsFromName(decryptString(row.full_name)),
            mobile: decryptString(row.mobile),
            email: decryptString(row.email || '')
          }
        : null
    }));
  res.json({ audit: rows });
});

router.get('/recent-activity', (req, res) => {
  const ownerId = req.accountUserId;

  const assetRows = db
    .prepare(`
      SELECT id, name, category, updated_by_initials, updated_at
      FROM assets
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 10
    `)
    .all(ownerId)
    .map((row) => ({
      id: `asset-${row.id}`,
      kind: 'asset_updated',
      actor_initials: normalizeActorInitials(row.updated_by_initials),
      created_at: row.updated_at,
      label: decryptString(row.name) || String(row.category || 'Asset').trim() || 'Asset'
    }));

  const liabilityRows = db
    .prepare(`
      SELECT id, lender, loan_type, updated_by_initials, updated_at
      FROM liabilities
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 10
    `)
    .all(ownerId)
    .map((row) => ({
      id: `liability-${row.id}`,
      kind: 'liability_updated',
      actor_initials: normalizeActorInitials(row.updated_by_initials),
      created_at: row.updated_at,
      label: decryptString(row.lender) || String(row.loan_type || 'Liability').trim() || 'Liability'
    }));

  const familyRows = db
    .prepare(
      `
      SELECT a.id, a.action, a.created_at, u.full_name
      FROM family_audit a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.owner_user_id = ?
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 10
    `
    )
    .all(ownerId)
    .map((row) => ({
      id: `family-${row.id}`,
      kind: formatRecentFamilyAction(row.action),
      actor_initials: initialsFromName(decryptString(row.full_name || '')),
      created_at: row.created_at,
      label: ''
    }));

  const items = [...assetRows, ...liabilityRows, ...familyRows]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 5);

  return res.json({ items });
});

router.delete('/:id', requireFamilyPremium, requireAccountAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ownerId = req.accountUserId;
  const existing = db
    .prepare('SELECT * FROM family_members WHERE id = ? AND owner_user_id = ?')
    .get(id, ownerId);
  if (!existing) {
    return res.status(404).json({ error: 'Family member not found' });
  }
  db.prepare('DELETE FROM family_members WHERE id = ?').run(id);
  logFamilyAudit(ownerId, req.userId, 'member_removed', { member_id: id, member_user_id: existing.member_user_id });
  res.status(204).send();
});

export default router;
