import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { decryptString, hashLookup } from '../lib/crypto.js';
import { createSessionToken, hashPin, hashToken, verifyPin } from '../lib/auth.js';
import { ingestCuratedNews } from '../lib/newsPipeline.js';
import { deleteAccountCompletely, disableAccount, enableAccount, getAccountAccessState } from '../lib/accountLifecycle.js';
import requireSupportAuth from '../middleware/requireSupportAuth.js';

const apiRouter = Router();
const consoleRouter = Router();

const SUPPORT_FAMILY_ROLES = new Set(['read', 'write', 'admin']);
const INVITE_TTL_DAYS = 7;
const SUPPORT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const SUPPORT_RESET_TTL_MINUTES = 10;
const SUPPORT_RESET_MAX_ATTEMPTS = 5;
const PLAN_CONFIG = {
  basic_monthly: { amount: 99, periodDays: 30, period: 'monthly' },
  basic_yearly: { amount: 999, periodDays: 365, period: 'yearly' },
  premium_monthly: { amount: 189, periodDays: 30, period: 'monthly' },
  premium_yearly: { amount: 1999, periodDays: 365, period: 'yearly' }
};

function toInitials(value = '') {
  const compact = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,2}$/.test(compact)) return compact;
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function maskMobile(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return `${'*'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskEmail(value = '') {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '-';
  const [localRaw, domainRaw] = email.split('@');
  const local = String(localRaw || '');
  const domain = String(domainRaw || '');
  const localMasked =
    local.length <= 2 ? `${local.charAt(0)}*` : `${local.charAt(0)}${'*'.repeat(local.length - 2)}${local.slice(-1)}`;
  return `${localMasked}@${domain}`;
}

function addDaysIso(baseIso, days) {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function subtractDaysIso(baseIso, days) {
  const d = new Date(baseIso);
  d.setDate(d.getDate() - Number(days || 0));
  return d.toISOString();
}

function safeJsonParse(raw, fallback = {}) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (_e) {
    return fallback;
  }
}

function getUserAccountContext(userId) {
  const owned = db.prepare('SELECT owner_user_id FROM family_members WHERE member_user_id = ? LIMIT 1').get(userId);
  if (owned?.owner_user_id) {
    return { ownerUserId: Number(owned.owner_user_id), role: 'member' };
  }
  return { ownerUserId: Number(userId), role: 'owner' };
}

function buildUserCard(row, includeSensitive = false) {
  const fullName = decryptString(row.full_name || '');
  const mobile = decryptString(row.mobile || '');
  const email = decryptString(row.email || '');
  return {
    id: row.id,
    initials: toInitials(fullName),
    mobile: includeSensitive ? mobile : maskMobile(mobile),
    email: includeSensitive ? email : maskEmail(email),
    created_at: row.created_at,
    last_login_at: row.last_login_at
  };
}

function logSupportAction({ actor, action, targetUserId = null, status = 'ok', reason = '', meta = {} }) {
  db.prepare(`
    INSERT INTO support_action_log (actor, action, target_user_id, status, reason, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(actor || 'support'),
    String(action || 'unknown'),
    targetUserId ? Number(targetUserId) : null,
    String(status || 'ok'),
    String(reason || ''),
    JSON.stringify(meta || {}),
    nowIso()
  );
}

function fetchFamilyData(ownerUserId, includeSensitive = false) {
  const members = db
    .prepare(
      `
      SELECT fm.id, fm.role, fm.created_at, fm.updated_at,
             u.id AS user_id, u.full_name, u.mobile, u.email
      FROM family_members fm
      JOIN users u ON u.id = fm.member_user_id
      WHERE fm.owner_user_id = ?
      ORDER BY fm.created_at ASC
    `
    )
    .all(ownerUserId)
    .map((row) => {
      const fullName = decryptString(row.full_name || '');
      const mobile = decryptString(row.mobile || '');
      const email = decryptString(row.email || '');
      return {
        id: row.id,
        role: row.role,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user: {
          id: row.user_id,
          initials: toInitials(fullName),
          mobile: includeSensitive ? mobile : maskMobile(mobile),
          email: includeSensitive ? email : maskEmail(email)
        }
      };
    });

  const invites = db
    .prepare(
      `
      SELECT id, role, status, expires_at, created_at, updated_at, mobile_encrypted
      FROM family_invites
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(ownerUserId)
    .map((row) => {
      const mobile = decryptString(row.mobile_encrypted || '');
      return {
        id: row.id,
        role: row.role,
        status: row.status,
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        mobile: includeSensitive ? mobile : maskMobile(mobile)
      };
    });

  return { members, invites };
}

function findSupportUser(username = '') {
  return db
    .prepare('SELECT id, username, password_hash, must_reset_password FROM support_users WHERE LOWER(username) = LOWER(?) LIMIT 1')
    .get(String(username || '').trim());
}

function cleanSupportSessions() {
  db.prepare('DELETE FROM support_sessions WHERE expires_at <= ?').run(nowIso());
}

function cleanSupportResets() {
  db.prepare('DELETE FROM support_password_resets WHERE expires_at <= ? OR consumed_at IS NOT NULL').run(nowIso());
}

function createSupportSession(supportUserId) {
  cleanSupportSessions();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS).toISOString();
  db.prepare(
    `
    INSERT INTO support_sessions (support_user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(supportUserId, hashToken(token), expiresAt, nowIso(), nowIso());
  return { token, expires_at: expiresAt };
}

function createResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

apiRouter.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'username_and_password_required' });
  }

  const user = findSupportUser(username);
  if (!user || !verifyPin(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const session = createSupportSession(user.id);
  return res.json({
    token: session.token,
    expires_at: session.expires_at,
    user: {
      id: user.id,
      username: user.username,
      must_reset_password: Boolean(Number(user.must_reset_password || 0))
    }
  });
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'username_required' });
  }

  const user = findSupportUser(username);
  if (!user) {
    return res.status(404).json({ error: 'support_user_not_found' });
  }

  cleanSupportResets();
  const code = createResetCode();
  const expiresAt = new Date(Date.now() + SUPPORT_RESET_TTL_MINUTES * 60 * 1000).toISOString();
  const createdAt = nowIso();
  const row = db
    .prepare(
      `
      INSERT INTO support_password_resets (support_user_id, code_hash, expires_at, attempts, consumed_at, created_at)
      VALUES (?, ?, ?, 0, NULL, ?)
    `
    )
    .run(user.id, hashPin(code), expiresAt, createdAt);

  return res.json({
    ok: true,
    username: user.username,
    reset_request_id: row.lastInsertRowid,
    expires_at: expiresAt,
    // TODO: replace inline code return with secure delivery (email/SSO)
    reset_code: code
  });
});

apiRouter.post('/auth/reset-password', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const resetCode = String(req.body?.reset_code || '').trim();
  const newPassword = String(req.body?.new_password || '');
  if (!username || !resetCode || !newPassword) {
    return res.status(400).json({ error: 'username_reset_code_new_password_required' });
  }
  if (newPassword.length < 5) {
    return res.status(400).json({ error: 'new_password_too_short' });
  }

  const user = findSupportUser(username);
  if (!user) return res.status(404).json({ error: 'support_user_not_found' });
  cleanSupportResets();

  const reset = db
    .prepare(
      `
      SELECT id, code_hash, attempts, expires_at, consumed_at
      FROM support_password_resets
      WHERE support_user_id = ? AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .get(user.id);
  if (!reset) {
    return res.status(400).json({ error: 'no_active_reset_request' });
  }
  if (Number(reset.attempts || 0) >= SUPPORT_RESET_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_reset_attempts' });
  }
  if (!verifyPin(resetCode, reset.code_hash)) {
    db.prepare('UPDATE support_password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
    return res.status(401).json({ error: 'invalid_reset_code' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE support_users SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = ?').run(
      hashPin(newPassword),
      nowIso(),
      user.id
    );
    db.prepare('UPDATE support_password_resets SET consumed_at = ? WHERE id = ?').run(nowIso(), reset.id);
    db.prepare('DELETE FROM support_sessions WHERE support_user_id = ?').run(user.id);
  });
  tx();
  return res.json({ ok: true, message: 'Password reset successful. Please login again.' });
});

apiRouter.use(requireSupportAuth);

apiRouter.post('/auth/logout', (req, res) => {
  db.prepare('DELETE FROM support_sessions WHERE id = ?').run(req.supportSessionId);
  return res.status(204).send();
});

apiRouter.get('/health', (req, res) => {
  return res.json({
    ok: true,
    actor: req.supportActor,
    server_time: nowIso()
  });
});

apiRouter.get('/users', (req, res) => {
  const query = String(req.query.query || '').trim();
  const includeSensitive = String(req.query.include_sensitive || '') === '1';
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));
  let rows = [];

  if (!query) {
    rows = db
      .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users ORDER BY id DESC LIMIT ?')
      .all(limit);
  } else {
    const qDigits = query.replace(/\D/g, '');
    const byId = /^\d+$/.test(query) && qDigits.length > 0 && qDigits.length < 10
      ? db.prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users WHERE id = ?').get(Number(query))
      : null;
    const byMobile = qDigits.length === 10
      ? db
          .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users WHERE mobile_hash = ?')
          .get(hashLookup(qDigits))
      : null;

    if (byId) rows.push(byId);
    if (byMobile && (!byId || byMobile.id !== byId.id)) rows.push(byMobile);

    if (!rows.length) {
      const candidateRows = db
        .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users ORDER BY id DESC LIMIT 400')
        .all();
      const lowered = query.toLowerCase();
      rows = candidateRows.filter((row) => {
        const initials = toInitials(decryptString(row.full_name || '')).toLowerCase();
        const mobile = decryptString(row.mobile || '');
        const email = decryptString(row.email || '').toLowerCase();
        return (
          String(row.id).includes(lowered) ||
          initials.includes(lowered) ||
          mobile.includes(qDigits || lowered) ||
          email.includes(lowered)
        );
      });
    }
  }

  const users = rows.slice(0, limit).map((row) => buildUserCard(row, includeSensitive));
  logSupportAction({
    actor: req.supportActor,
    action: 'search_users',
    status: 'ok',
    meta: { query, count: users.length }
  });
  return res.json({ users });
});

apiRouter.get('/users/:id/overview', (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'invalid_user_id' });
  const includeSensitive = String(req.query.include_sensitive || '') === '1';
  const user = db
    .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users WHERE id = ?')
    .get(userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const ctx = getUserAccountContext(userId);
  const ownerId = ctx.ownerUserId;
  const owner = db
    .prepare('SELECT id, full_name, mobile, email, created_at, last_login_at FROM users WHERE id = ?')
    .get(ownerId);
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(ownerId);
  const settingsRows = db
    .prepare(
      `SELECT key, value, updated_at
       FROM user_settings
       WHERE user_id = ? AND key IN ('country','preferred_currency','privacy_pin_enabled','ui_theme','language')`
    )
    .all(ownerId);

  const assetStats = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(current_value), 0) AS total_current
       FROM assets WHERE user_id = ?`
    )
    .get(ownerId);
  const liabilityStats = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(outstanding_amount), 0) AS total_outstanding
       FROM liabilities WHERE user_id = ?`
    )
    .get(ownerId);
  const reminderStats = db
    .prepare(
      `SELECT COUNT(*) AS count,
              SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM reminders
       WHERE user_id = ?`
    )
    .get(ownerId);

  const family = fetchFamilyData(ownerId, includeSensitive);
  const devices = db
    .prepare(
      `
      SELECT id, device_id, platform, app_version, device_model, trusted, revoked_at, first_seen_at, last_seen_at
      FROM user_devices
      WHERE user_id = ?
      ORDER BY trusted DESC, last_seen_at DESC
      LIMIT 20
    `
    )
    .all(ownerId);
  const authEvents = db
    .prepare(
      `
      SELECT id, event_type, auth_method, status, reason, created_at, device_id, platform, app_version, ip_address
      FROM auth_login_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `
    )
    .all(ownerId);
  const supportActions = db
    .prepare(
      `
      SELECT id, actor, action, status, reason, meta, created_at
      FROM support_action_log
      WHERE target_user_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `
    )
    .all(ownerId)
    .map((row) => ({ ...row, meta: safeJsonParse(row.meta, {}) }));
  const paymentHistory = db
    .prepare(
      `
      SELECT id, plan, amount_inr, period, provider, provider_txn_id, purchased_at, valid_until, status
      FROM payment_history
      WHERE user_id = ?
      ORDER BY purchased_at DESC
      LIMIT 20
    `
    )
    .all(ownerId);
  const accountAccess = getAccountAccessState(userId);

  logSupportAction({
    actor: req.supportActor,
    action: 'view_user_overview',
    targetUserId: ownerId,
    status: 'ok',
    meta: { requested_user_id: userId }
  });

  return res.json({
    requested_user: buildUserCard(user, includeSensitive),
    account_owner: owner ? buildUserCard(owner, includeSensitive) : null,
    account_context: ctx,
    account_access: accountAccess,
    subscription: subscription || null,
    settings: settingsRows,
    stats: {
      assets: assetStats,
      liabilities: liabilityStats,
      reminders: {
        count: Number(reminderStats?.count || 0),
        completed: Number(reminderStats?.completed || 0),
        pending: Math.max(0, Number(reminderStats?.count || 0) - Number(reminderStats?.completed || 0))
      }
    },
    family,
    devices,
    auth_events: authEvents,
    support_actions: supportActions,
    payment_history: paymentHistory
  });
});

apiRouter.get('/users/:id/history', (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'invalid_user_id' });
  const limit = Math.max(10, Math.min(500, Number(req.query.limit || 100)));
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    logSupportAction({
      actor: req.supportActor,
      action: 'view_user_history',
      targetUserId: null,
      status: 'error',
      reason: 'user_not_found',
      meta: { limit, requested_user_id: userId }
    });
    return res.status(404).json({ error: 'user_not_found' });
  }

  const authEvents = db
    .prepare(
      `
      SELECT id, event_type, auth_method, status, reason, device_id, platform, app_version, ip_address, created_at
      FROM auth_login_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(userId, limit);
  const securityEvents = db
    .prepare(
      `
      SELECT id, event_type, status, ip_address, meta, created_at
      FROM security_event_log
      WHERE user_id = ? OR actor_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(userId, userId, limit)
    .map((row) => ({ ...row, meta: safeJsonParse(row.meta, {}) }));
  const supportActions = db
    .prepare(
      `
      SELECT id, actor, action, status, reason, meta, created_at
      FROM support_action_log
      WHERE target_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(userId, limit)
    .map((row) => ({ ...row, meta: safeJsonParse(row.meta, {}) }));

  logSupportAction({
    actor: req.supportActor,
    action: 'view_user_history',
    targetUserId: userId,
    status: 'ok',
    meta: { limit }
  });
  return res.json({ auth_events: authEvents, security_events: securityEvents, support_actions: supportActions });
});

apiRouter.post('/users/:id/actions', async (req, res) => {
  const targetUserId = Number(req.params.id);
  if (!targetUserId) return res.status(400).json({ error: 'invalid_user_id' });

  const action = String(req.body?.action || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  const actor = req.supportActor;

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!targetUser) {
    logSupportAction({ actor, action, targetUserId, status: 'error', reason: 'user_not_found' });
    return res.status(404).json({ error: 'user_not_found' });
  }

  try {
    let result = { ok: true };
    let logTargetUserId = targetUserId;
    if (action === 'force_logout_all') {
      const deleted = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
      result = { ok: true, removed_sessions: deleted.changes };
    } else if (action === 'disable_account') {
      const reason = String(payload.reason || payload.note || '').trim();
      if (!reason) return res.status(400).json({ error: 'reason_required' });
      result = disableAccount({
        userId: targetUserId,
        reason,
        actor
      });
    } else if (action === 'enable_account') {
      const reason = String(payload.reason || payload.note || '').trim();
      result = enableAccount({
        userId: targetUserId,
        reason,
        actor
      });
    } else if (action === 'delete_account') {
      const reason = String(payload.reason || payload.note || '').trim();
      if (!reason) return res.status(400).json({ error: 'reason_required' });
      const deleted = deleteAccountCompletely({
        userId: targetUserId,
        reason,
        actor
      });
      if (!deleted) return res.status(404).json({ error: 'user_not_found' });
      result = deleted;
      logTargetUserId = null;
    } else if (action === 'trust_device') {
      const deviceId = String(payload.device_id || '').trim();
      if (!deviceId) return res.status(400).json({ error: 'device_id_required' });
      const updated = db
        .prepare('UPDATE user_devices SET trusted = 1, revoked_at = NULL, last_seen_at = ? WHERE user_id = ? AND device_id = ?')
        .run(nowIso(), targetUserId, deviceId);
      if (!updated.changes) return res.status(404).json({ error: 'device_not_found' });
      result = { ok: true, trusted_device_id: deviceId };
    } else if (action === 'revoke_device') {
      const deviceId = String(payload.device_id || '').trim();
      if (!deviceId) return res.status(400).json({ error: 'device_id_required' });
      const updated = db
        .prepare('UPDATE user_devices SET trusted = 0, revoked_at = ? WHERE user_id = ? AND device_id = ?')
        .run(nowIso(), targetUserId, deviceId);
      if (!updated.changes) return res.status(404).json({ error: 'device_not_found' });
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND device_id = ?').run(targetUserId, deviceId);
      result = { ok: true, revoked_device_id: deviceId };
    } else if (action === 'set_subscription') {
      const plan = String(payload.plan || '').trim();
      const status = String(payload.status || 'active').trim() || 'active';
      if (!plan) return res.status(400).json({ error: 'plan_required' });
      const config = PLAN_CONFIG[plan];
      const periodDays = Number(payload.period_days || config?.periodDays || 30);
      const now = nowIso();
      const explicitEnd = String(payload.current_period_end || '').trim();
      let end = explicitEnd || null;
      if (!end && plan !== 'none') {
        end = status === 'active' ? addDaysIso(now, periodDays) : subtractDaysIso(now, 1);
      }
      db.prepare(`
        INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, provider, updated_at)
        VALUES (?, ?, ?, ?, ?, 'support_console', ?)
        ON CONFLICT(user_id) DO UPDATE SET
          plan=excluded.plan,
          status=excluded.status,
          started_at=excluded.started_at,
          current_period_end=excluded.current_period_end,
          provider=excluded.provider,
          updated_at=excluded.updated_at
      `).run(targetUserId, plan, status, now, end, now);
      if (status === 'active' && end) {
        const amount = Number(payload.amount_inr ?? config?.amount ?? 0);
        const period = String(payload.period || config?.period || 'manual');
        db.prepare(`
          INSERT INTO payment_history (
            user_id, plan, amount_inr, period, provider, provider_txn_id,
            purchased_at, valid_until, status
          ) VALUES (?, ?, ?, ?, 'support_console', ?, ?, ?, 'succeeded')
        `).run(targetUserId, plan, amount, period, String(payload.provider_txn_id || null), now, end);
      }
      result = { ok: true, plan, status, current_period_end: end };
    } else if (action === 'remove_family_member') {
      const memberId = Number(payload.member_id || 0);
      if (!memberId) return res.status(400).json({ error: 'member_id_required' });
      const removed = db.prepare('DELETE FROM family_members WHERE id = ? AND owner_user_id = ?').run(memberId, targetUserId);
      if (!removed.changes) return res.status(404).json({ error: 'family_member_not_found' });
      result = { ok: true, removed_member_id: memberId };
    } else if (action === 'set_family_role') {
      const memberId = Number(payload.member_id || 0);
      const role = String(payload.role || '').trim();
      if (!memberId) return res.status(400).json({ error: 'member_id_required' });
      if (!SUPPORT_FAMILY_ROLES.has(role)) return res.status(400).json({ error: 'invalid_role' });
      const updated = db
        .prepare('UPDATE family_members SET role = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?')
        .run(role, nowIso(), memberId, targetUserId);
      if (!updated.changes) return res.status(404).json({ error: 'family_member_not_found' });
      result = { ok: true, member_id: memberId, role };
    } else if (action === 'cancel_family_invite') {
      const inviteId = Number(payload.invite_id || 0);
      if (!inviteId) return res.status(400).json({ error: 'invite_id_required' });
      const updated = db
        .prepare(`UPDATE family_invites SET status = 'canceled', updated_at = ? WHERE id = ? AND owner_user_id = ?`)
        .run(nowIso(), inviteId, targetUserId);
      if (!updated.changes) return res.status(404).json({ error: 'invite_not_found' });
      result = { ok: true, canceled_invite_id: inviteId };
    } else if (action === 'resend_family_invite') {
      const inviteId = Number(payload.invite_id || 0);
      if (!inviteId) return res.status(400).json({ error: 'invite_id_required' });
      const invite = db
        .prepare(`SELECT id, status FROM family_invites WHERE id = ? AND owner_user_id = ?`)
        .get(inviteId, targetUserId);
      if (!invite) return res.status(404).json({ error: 'invite_not_found' });
      if (invite.status !== 'pending') return res.status(400).json({ error: 'invite_not_pending' });
      const expiresAt = addDaysIso(nowIso(), INVITE_TTL_DAYS);
      db.prepare(`UPDATE family_invites SET expires_at = ?, updated_at = ? WHERE id = ?`).run(expiresAt, nowIso(), inviteId);
      result = { ok: true, invite_id: inviteId, expires_at: expiresAt };
    } else if (action === 'seed_performance_snapshots') {
      const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
      if (!snapshots.length) return res.status(400).json({ error: 'snapshots_required' });
      if (snapshots.length > 12) return res.status(400).json({ error: 'too_many_snapshots' });

      const upsertSnapshot = db.prepare(`
        INSERT INTO performance_snapshots (
          user_id, quarter_start, total_assets, total_liabilities, net_worth, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, quarter_start) DO UPDATE SET
          total_assets = excluded.total_assets,
          total_liabilities = excluded.total_liabilities,
          net_worth = excluded.net_worth,
          captured_at = excluded.captured_at
      `);

      const normalized = snapshots.map((row) => {
        const quarterStart = String(row?.quarter_start || row?.quarterStart || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(quarterStart)) {
          throw new Error('invalid_quarter_start');
        }
        const totalAssets = Number(row?.total_assets ?? row?.totalAssets ?? 0);
        const totalLiabilities = Number(row?.total_liabilities ?? row?.totalLiabilities ?? 0);
        const hasNetWorth = row?.net_worth != null || row?.netWorth != null;
        const netWorth = hasNetWorth ? Number(row?.net_worth ?? row?.netWorth ?? 0) : totalAssets - totalLiabilities;
        if (![totalAssets, totalLiabilities, netWorth].every(Number.isFinite)) {
          throw new Error('invalid_snapshot_amounts');
        }
        return {
          quarterStart,
          totalAssets,
          totalLiabilities,
          netWorth,
          capturedAt: String(row?.captured_at || row?.capturedAt || nowIso())
        };
      });

      db.transaction(() => {
        normalized.forEach((row) => {
          upsertSnapshot.run(
            targetUserId,
            row.quarterStart,
            row.totalAssets,
            row.totalLiabilities,
            row.netWorth,
            row.capturedAt
          );
        });
      })();

      result = {
        ok: true,
        snapshots_upserted: normalized.length,
        quarter_starts: normalized.map((row) => row.quarterStart)
      };
    } else if (action === 'clear_ai_insights_cache') {
      const cleared = db.prepare("DELETE FROM user_settings WHERE user_id = ? AND key = 'ai_insights_cache'").run(targetUserId);
      result = { ok: true, cleared_entries: Number(cleared.changes || 0) };
    } else if (action === 'refresh_curated_news') {
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      const out = await ingestCuratedNews({
        apiKey,
        country: String(payload.country || 'IN').trim() || 'IN',
        forceRefresh: true
      });
      db.prepare("DELETE FROM user_settings WHERE key = 'ai_insights_cache'").run();
      result = {
        ok: true,
        inserted: Number(out.inserted || 0),
        total_fresh_items: Number(out.total_fresh_items || 0),
        cleared_ai_caches: true
      };
    } else {
      return res.status(400).json({ error: 'unsupported_action' });
    }

    logSupportAction({
      actor,
      action,
      targetUserId: logTargetUserId,
      status: 'ok',
      meta: { payload, result, deleted_target_user_id: action === 'delete_account' ? targetUserId : null }
    });
    return res.json(result);
  } catch (e) {
    logSupportAction({
      actor,
      action,
      targetUserId,
      status: 'error',
      reason: String(e?.message || e),
      meta: { payload }
    });
    return res.status(500).json({ error: 'support_action_failed', message: String(e?.message || e) });
  }
});

apiRouter.get('/users/:id/agent-context', (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'invalid_user_id' });
  const user = db.prepare('SELECT id, full_name, mobile, email FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const account = getUserAccountContext(userId);
  const ownerId = account.ownerUserId;
  const subscription = db.prepare('SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ?').get(ownerId);
  const familyCounts = db
    .prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM family_members WHERE owner_user_id = ?) AS members_count,
        (SELECT COUNT(*) FROM family_invites WHERE owner_user_id = ? AND status = 'pending') AS pending_invites
    `
    )
    .get(ownerId, ownerId);
  const stats = {
    assets: db.prepare('SELECT COUNT(*) AS c FROM assets WHERE user_id = ?').get(ownerId)?.c || 0,
    liabilities: db.prepare('SELECT COUNT(*) AS c FROM liabilities WHERE user_id = ?').get(ownerId)?.c || 0,
    reminders: db.prepare('SELECT COUNT(*) AS c FROM reminders WHERE user_id = ?').get(ownerId)?.c || 0
  };
  const recentPayments = db
    .prepare(
      `
      SELECT plan, amount_inr, provider, purchased_at, status
      FROM payment_history
      WHERE user_id = ?
      ORDER BY purchased_at DESC
      LIMIT 5
    `
    )
    .all(ownerId);

  const recentFailures = db
    .prepare(
      `
      SELECT event_type, reason, created_at
      FROM auth_login_log
      WHERE user_id = ? AND status IN ('failed','blocked')
      ORDER BY created_at DESC
      LIMIT 5
    `
    )
    .all(ownerId);
  const accountAccess = getAccountAccessState(userId);

  logSupportAction({
    actor: req.supportActor,
    action: 'view_agent_context',
    targetUserId: ownerId,
    status: 'ok',
    meta: { requested_user_id: userId }
  });
  return res.json({
    user: buildUserCard(user, false),
    account_context: account,
    account_access: accountAccess,
    subscription: subscription || { plan: 'none', status: 'expired', current_period_end: null },
    family: {
      members_count: Number(familyCounts?.members_count || 0),
      pending_invites: Number(familyCounts?.pending_invites || 0)
    },
    stats,
    recent_login_failures: recentFailures,
    recent_payments: recentPayments
  });
});

consoleRouter.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Worthio Support Console</title>
  <style>
    :root { color-scheme: dark; --bg:#0a1220; --card:#121f35; --card2:#0f1a2d; --line:#264465; --text:#e6edf8; --muted:#9ab0c9; --accent:#38bdf8; --ok:#86efac; --bad:#fca5a5; }
    * { box-sizing: border-box; }
    body { margin:0; background:linear-gradient(160deg,#061024,#0a1220 30%,#0d1b31); color:var(--text); font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto; }
    .wrap { max-width:1200px; margin:0 auto; padding:20px; display:grid; gap:14px; }
    .card { background:rgba(18,31,53,.93); border:1px solid var(--line); border-radius:14px; padding:14px; }
    .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    .grow { flex:1; min-width:180px; }
    input, select, button, textarea { border-radius:10px; border:1px solid #2e4d72; background:#0b1628; color:var(--text); padding:8px 10px; font:inherit; }
    textarea { min-height:70px; width:100%; }
    button { background:#0e2038; cursor:pointer; }
    button:hover { border-color:#4c7baa; }
    .title { font-size:22px; font-weight:800; margin:0; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    pre { margin:0; white-space:pre-wrap; background:var(--card2); border:1px solid #1f3552; border-radius:10px; padding:10px; max-height:360px; overflow:auto; }
    .sectionTitle { font-size:15px; font-weight:800; margin:0 0 8px; }
    .step { display:inline-flex; align-items:center; gap:6px; border:1px solid #355579; border-radius:999px; padding:4px 10px; font-size:12px; color:#d6e8ff; background:#0f223c; }
    .tableWrap { border:1px solid #1f3552; border-radius:10px; overflow:auto; background:var(--card2); }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { border-bottom:1px solid #1f3552; padding:8px 10px; text-align:left; }
    th { color:#b9d4f1; position:sticky; top:0; background:#0f1d33; }
    tr:hover td { background:#12253f; }
    .pill { border:1px solid #2f5077; border-radius:999px; padding:6px 10px; font-size:12px; background:#10243f; cursor:pointer; }
    .pill:hover { border-color:#4c7baa; }
    .field { display:grid; gap:4px; min-width:220px; flex:1; }
    .fieldLabel { font-size:12px; color:#bdd2ec; font-weight:700; }
    .mutedSmall { color:var(--muted); font-size:12px; }
    .ok { color:var(--ok); } .bad { color:var(--bad); }
    @media (max-width: 900px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1 class="title">Support Console</h1>
      <div class="muted">Search users, view account/family state, and run support actions.</div>
      <div class="row" style="margin-top:10px;">
        <span class="step">1. Login</span>
        <span class="step">2. Search User</span>
        <span class="step">3. Load Overview</span>
        <span class="step">4. Run Action</span>
      </div>
      <div class="row" style="margin-top:10px;">
        <input id="username" class="grow" placeholder="Support User ID (Admin1/Admin2/Admin3)" />
        <input id="password" type="password" placeholder="Password" />
        <button id="loginBtn">Login</button>
        <button id="logoutBtn">Logout</button>
      </div>
      <div class="row">
        <input id="forgotUsername" class="grow" placeholder="Forgot password: username" />
        <button id="forgotBtn">Forgot Password</button>
        <input id="resetCode" placeholder="Reset code" />
        <input id="newPassword" type="password" placeholder="New password" />
        <button id="resetBtn">Reset Password</button>
      </div>
      <span id="connectStatus" class="muted"></span>
      <pre id="authOut" class="mono" style="margin-top:8px;">Not logged in.</pre>
    </div>

    <div class="card">
      <div class="sectionTitle">User Search</div>
      <div class="row">
        <input id="query" class="grow" placeholder="Search by user id / mobile / initials / email" />
        <button id="searchBtn">Search</button>
        <button id="searchRecentBtn">Recent</button>
      </div>
      <div class="mutedSmall">Tip: click any row below to auto-fill user id.</div>
      <div id="searchList" class="tableWrap" style="margin-top:8px;"></div>
      <pre id="searchOut" class="mono">No search yet.</pre>
    </div>

    <div class="grid">
      <div class="card">
        <div class="row">
          <input id="userId" class="grow" placeholder="Selected user id" />
          <button id="loadOverview">Load Overview</button>
          <button id="loadHistory">Load History</button>
          <button id="loadAgentCtx">Agent Context</button>
        </div>
        <pre id="overviewOut" class="mono">No overview loaded.</pre>
      </div>
      <div class="card">
        <div class="sectionTitle">Support Actions</div>
        <div class="row">
          <button class="pill" data-quick="force_logout_all">Quick: Force Logout</button>
          <button class="pill" data-quick="set_subscription">Quick: Set Premium Monthly</button>
          <button class="pill" data-quick="expire_trial_premium">Quick: Expire Trial Premium</button>
          <button class="pill" data-quick="cancel_family_invite">Quick: Cancel Invite</button>
          <button class="pill" data-quick="disable_account">Quick: Disable Account</button>
          <button class="pill" data-quick="delete_account">Quick: Delete Account</button>
        </div>
        <div class="row">
          <select id="actionType" class="grow">
            <option value="force_logout_all">Force Logout All Sessions</option>
            <option value="disable_account">Disable Account</option>
            <option value="enable_account">Enable Account</option>
            <option value="delete_account">Delete Account</option>
            <option value="trust_device">Mark Device As Trusted</option>
            <option value="revoke_device">Revoke Device Access</option>
            <option value="set_subscription">Set Subscription Plan</option>
            <option value="remove_family_member">Remove Family Member</option>
            <option value="set_family_role">Change Family Member Role</option>
            <option value="cancel_family_invite">Cancel Family Invite</option>
            <option value="resend_family_invite">Resend Family Invite</option>
          </select>
          <button id="runAction">Run Action</button>
        </div>
        <div id="actionHint" class="mutedSmall">Choose action and fill required fields.</div>
        <div id="actionFields" class="row" style="margin-top:8px;"></div>
        <details style="margin-top:8px;">
          <summary class="mutedSmall" style="cursor:pointer;">Advanced JSON override (optional)</summary>
          <textarea id="payload">{}</textarea>
        </details>
        <pre id="actionOut" class="mono">No action yet.</pre>
      </div>
    </div>
  </div>
  <script>
    const el = (id) => document.getElementById(id);
    const state = { token: '', username: '' };
    const ACTION_META = {
      force_logout_all: {
        hint: 'Logs out the user from all devices.',
        fields: []
      },
      disable_account: {
        hint: 'Disables account access, revokes sessions, and stores a support reason note.',
        fields: [{ key: 'reason', label: 'Reason / Notes', type: 'text', required: true }]
      },
      enable_account: {
        hint: 'Re-enables a disabled account. Optional note can explain the change.',
        fields: [{ key: 'reason', label: 'Reason / Notes (optional)', type: 'text' }]
      },
      delete_account: {
        hint: 'Permanently deletes the account and clears linked references while logging the support reason.',
        fields: [{ key: 'reason', label: 'Reason / Notes', type: 'text', required: true }]
      },
      trust_device: {
        hint: 'Mark a device as trusted. Use exact device_id from overview.',
        fields: [{ key: 'device_id', label: 'Device ID', type: 'text', required: true }]
      },
      revoke_device: {
        hint: 'Revokes one device and removes its current session.',
        fields: [{ key: 'device_id', label: 'Device ID', type: 'text', required: true }]
      },
      set_subscription: {
        hint: 'Change plan and status for account owner.',
        fields: [
          {
            key: 'plan',
            label: 'Plan',
            type: 'select',
            required: true,
            default: 'premium_monthly',
            options: [
              { value: 'basic_monthly', label: 'Basic Monthly' },
              { value: 'basic_yearly', label: 'Basic Yearly' },
              { value: 'premium_monthly', label: 'Premium Monthly' },
              { value: 'premium_yearly', label: 'Premium Yearly' },
              { value: 'trial_premium', label: 'Trial Premium' },
              { value: 'none', label: 'None' }
            ]
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            required: true,
            default: 'active',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' }
            ]
          },
          { key: 'period_days', label: 'Period Days (optional)', type: 'number' },
          { key: 'current_period_end', label: 'Current Period End ISO (optional)', type: 'text' }
        ]
      },
      remove_family_member: {
        hint: 'Remove family member by member_id.',
        fields: [{ key: 'member_id', label: 'Member ID', type: 'number', required: true }]
      },
      set_family_role: {
        hint: 'Change family member role.',
        fields: [
          { key: 'member_id', label: 'Member ID', type: 'number', required: true },
          {
            key: 'role',
            label: 'Role',
            type: 'select',
            required: true,
            default: 'read',
            options: [
              { value: 'read', label: 'Read' },
              { value: 'write', label: 'Write' },
              { value: 'admin', label: 'Admin' }
            ]
          }
        ]
      },
      cancel_family_invite: {
        hint: 'Cancel invite by invite_id.',
        fields: [{ key: 'invite_id', label: 'Invite ID', type: 'number', required: true }]
      },
      resend_family_invite: {
        hint: 'Resend invite by invite_id.',
        fields: [{ key: 'invite_id', label: 'Invite ID', type: 'number', required: true }]
      }
    };

    function setOutput(id, data, ok = true) {
      const node = el(id);
      node.className = 'mono ' + (ok ? 'ok' : 'bad');
      node.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    function fmtDate(value) {
      if (!value) return '-';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    }

    function formatOverviewHuman(out) {
      const lines = [];
      const req = out?.requested_user || {};
      const owner = out?.account_owner || {};
      const sub = out?.subscription || {};
      const stats = out?.stats || {};
      const assets = stats.assets || {};
      const liabs = stats.liabilities || {};
      const reminders = stats.reminders || {};
      const family = out?.family || {};
      const members = Array.isArray(family.members) ? family.members : [];
      const invites = Array.isArray(family.invites) ? family.invites : [];
      const devices = Array.isArray(out?.devices) ? out.devices : [];
      const authEvents = Array.isArray(out?.auth_events) ? out.auth_events : [];
      const payments = Array.isArray(out?.payment_history) ? out.payment_history : [];

      lines.push('User Overview');
      lines.push('------------');
      lines.push('Requested User: #' + (req.id ?? '-') + ' (' + (req.initials || '-') + ')');
      lines.push('Mobile: ' + (req.mobile || '-'));
      lines.push('Email: ' + (req.email || '-'));
      lines.push('Last Login: ' + fmtDate(req.last_login_at));
      lines.push('');
      lines.push('Account Context');
      lines.push('Owner User: #' + (owner.id ?? '-') + ' (' + (owner.initials || '-') + ')');
      lines.push('Role: ' + (out?.account_context?.role || '-'));
      lines.push('Access: ' + (out?.account_access?.status || 'active'));
      if (out?.account_access?.reason) {
        lines.push('Access Note: ' + out.account_access.reason);
      }
      lines.push('');
      lines.push('Subscription');
      lines.push('Plan: ' + (sub.plan || 'none'));
      lines.push('Status: ' + (sub.status || 'expired'));
      lines.push('Period End: ' + fmtDate(sub.current_period_end));
      lines.push('');
      lines.push('Portfolio Stats');
      lines.push('Assets: ' + (assets.count ?? 0) + ' | Current Total: ' + (assets.total_current ?? 0));
      lines.push('Liabilities: ' + (liabs.count ?? 0) + ' | Outstanding: ' + (liabs.total_outstanding ?? 0));
      lines.push('Reminders: ' + (reminders.count ?? 0) + ' (Pending: ' + (reminders.pending ?? 0) + ', Completed: ' + (reminders.completed ?? 0) + ')');
      lines.push('');
      lines.push('Family');
      lines.push('Members: ' + members.length + ' | Invites: ' + invites.length);
      if (members.length) {
        lines.push('Member Roles: ' + members.map((m) => '#' + (m?.user?.id ?? '-') + ' ' + (m?.user?.initials || '-') + ' (' + (m?.role || '-') + ')').join(', '));
      }
      if (invites.length) {
        lines.push('Pending Invites: ' + invites.filter((i) => i?.status === 'pending').length);
      }
      lines.push('');
      lines.push('Security');
      lines.push('Devices: ' + devices.length);
      lines.push('Recent Auth Events: ' + authEvents.length);
      if (authEvents.length) {
        const top = authEvents.slice(0, 3).map((e) => '[' + fmtDate(e.created_at) + '] ' + (e.event_type || '-') + ' (' + (e.status || '-') + ')');
        lines.push(top.join('\\n'));
      }
      lines.push('');
      lines.push('Recent Purchases');
      if (!payments.length) {
        lines.push('None');
      } else {
        payments.slice(0, 5).forEach((p) => {
          lines.push('- [' + fmtDate(p.purchased_at) + '] ' + (p.plan || '-') + ' | INR ' + (p.amount_inr ?? 0) + ' | ' + (p.status || '-') + ' | ' + (p.provider || '-'));
        });
      }
      return lines.join('\\n');
    }

    function formatAgentContextHuman(out) {
      const lines = [];
      const user = out?.user || {};
      const sub = out?.subscription || {};
      const fam = out?.family || {};
      const stats = out?.stats || {};
      const fails = Array.isArray(out?.recent_login_failures) ? out.recent_login_failures : [];
      const payments = Array.isArray(out?.recent_payments) ? out.recent_payments : [];

      lines.push('Agent Context');
      lines.push('-------------');
      lines.push('User: #' + (user.id ?? '-') + ' (' + (user.initials || '-') + ')');
      lines.push('Mobile: ' + (user.mobile || '-'));
      lines.push('Email: ' + (user.email || '-'));
      lines.push('Role in Account: ' + (out?.account_context?.role || '-'));
      lines.push('Access: ' + (out?.account_access?.status || 'active'));
      if (out?.account_access?.reason) {
        lines.push('Access Note: ' + out.account_access.reason);
      }
      lines.push('');
      lines.push('Subscription: ' + (sub.plan || 'none') + ' | ' + (sub.status || 'expired'));
      lines.push('Period End: ' + fmtDate(sub.current_period_end));
      lines.push('');
      lines.push('Counts');
      lines.push('Assets: ' + (stats.assets ?? 0));
      lines.push('Liabilities: ' + (stats.liabilities ?? 0));
      lines.push('Reminders: ' + (stats.reminders ?? 0));
      lines.push('Family Members: ' + (fam.members_count ?? 0));
      lines.push('Pending Invites: ' + (fam.pending_invites ?? 0));
      lines.push('');
      lines.push('Recent Purchases');
      if (!payments.length) {
        lines.push('None');
      } else {
        payments.slice(0, 5).forEach((p) => {
          lines.push('- [' + fmtDate(p.purchased_at) + '] ' + (p.plan || '-') + ' | INR ' + (p.amount_inr ?? 0) + ' | ' + (p.status || '-') + ' | ' + (p.provider || '-'));
        });
      }
      lines.push('');
      lines.push('Recent Login Failures');
      if (!fails.length) {
        lines.push('None');
      } else {
        fails.slice(0, 5).forEach((f) => {
          lines.push('- [' + fmtDate(f.created_at) + '] ' + (f.event_type || '-') + ' | ' + (f.reason || '-'));
        });
      }
      return lines.join('\\n');
    }

    function getActionDefaults(action) {
      const meta = ACTION_META[action] || { fields: [] };
      const payload = {};
      meta.fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(field, 'default')) {
          payload[field.key] = field.default;
        }
      });
      return payload;
    }

    function renderActionFields(action, preset = null) {
      const meta = ACTION_META[action] || { hint: '', fields: [] };
      const values = { ...getActionDefaults(action), ...(preset || {}) };
      el('actionHint').textContent = meta.hint || 'Choose action and fill required fields.';
      const html = (meta.fields || []).map((field) => {
        const id = 'actionField_' + field.key;
        const requiredMark = field.required ? ' *' : '';
        if (field.type === 'select') {
          const opts = (field.options || []).map((opt) => {
            const selected = String(values[field.key] ?? '') === String(opt.value) ? ' selected' : '';
            return '<option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
          }).join('');
          return '<label class="field"><span class="fieldLabel">' + field.label + requiredMark + '</span><select id="' + id + '">' + opts + '</select></label>';
        }
        const type = field.type === 'number' ? 'number' : 'text';
        const value = values[field.key] != null ? String(values[field.key]) : '';
        return '<label class="field"><span class="fieldLabel">' + field.label + requiredMark + '</span><input id="' + id + '" type="' + type + '" value="' + value + '" /></label>';
      }).join('');
      el('actionFields').innerHTML = html || '<div class="mutedSmall">No extra fields needed for this action.</div>';
    }

    function collectActionPayload(action) {
      const meta = ACTION_META[action] || { fields: [] };
      const payload = {};
      for (const field of meta.fields || []) {
        const node = el('actionField_' + field.key);
        const raw = node ? String(node.value || '').trim() : '';
        if (field.required && !raw) {
          throw new Error(field.label + ' is required');
        }
        if (!raw) continue;
        if (field.type === 'number') {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(field.label + ' must be a number');
          payload[field.key] = n;
        } else {
          payload[field.key] = raw;
        }
      }
      const advancedRaw = String(el('payload').value || '').trim();
      if (advancedRaw) {
        const advanced = JSON.parse(advancedRaw);
        if (advanced && typeof advanced === 'object') {
          Object.assign(payload, advanced);
        }
      }
      return payload;
    }

    function renderSearchList(items) {
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) {
        el('searchList').innerHTML = '<div class="mutedSmall" style="padding:10px;">No users found.</div>';
        return;
      }
      const htmlRows = rows.map((row) => (
        '<tr data-user-id="' + row.id + '">' +
          '<td>' + row.id + '</td>' +
          '<td>' + (row.initials || '-') + '</td>' +
          '<td>' + (row.mobile || '-') + '</td>' +
          '<td>' + (row.email || '-') + '</td>' +
          '<td>' + (row.last_login_at || '-') + '</td>' +
        '</tr>'
      )).join('');
      el('searchList').innerHTML =
        '<table><thead><tr><th>ID</th><th>Initials</th><th>Mobile</th><th>Email</th><th>Last Login</th></tr></thead><tbody>' +
        htmlRows +
        '</tbody></table>';

      el('searchList').querySelectorAll('tr[data-user-id]').forEach((tr) => {
        tr.addEventListener('click', () => {
          const id = String(tr.getAttribute('data-user-id') || '').trim();
          el('userId').value = id;
        });
      });
    }

    async function callPublic(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
      const txt = await res.text();
      let body = txt;
      try { body = txt ? JSON.parse(txt) : {}; } catch {}
      if (!res.ok) throw new Error(typeof body === 'string' ? body : (body.message || body.error || ('Request failed: ' + res.status)));
      return body;
    }

    async function callApi(path, opts = {}) {
      if (!state.token) throw new Error('Please login first.');
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.token };
      const res = await fetch('/api/support' + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
      const txt = await res.text();
      let body = txt;
      try { body = txt ? JSON.parse(txt) : {}; } catch {}
      if (!res.ok) throw new Error(typeof body === 'string' ? body : (body.message || body.error || ('Request failed: ' + res.status)));
      return body;
    }

    el('loginBtn').addEventListener('click', async () => {
      try {
        const username = String(el('username').value || '').trim();
        const password = String(el('password').value || '');
        const login = await callPublic('/api/support/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
        state.token = String(login.token || '');
        state.username = String(login?.user?.username || username);
        const out = await callApi('/health');
        el('connectStatus').textContent = 'Logged in as ' + state.username + ' at ' + out.server_time;
        setOutput('authOut', login, true);
      } catch (e) {
        el('connectStatus').textContent = 'Login failed: ' + e.message;
        setOutput('authOut', e.message, false);
      }
    });

    el('logoutBtn').addEventListener('click', async () => {
      try {
        if (state.token) {
          await callApi('/auth/logout', { method: 'POST' });
        }
      } catch (_e) {}
      state.token = '';
      state.username = '';
      el('connectStatus').textContent = 'Logged out.';
      setOutput('authOut', 'Not logged in.', true);
    });

    el('forgotBtn').addEventListener('click', async () => {
      try {
        const username = String(el('forgotUsername').value || el('username').value || '').trim();
        const out = await callPublic('/api/support/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ username })
        });
        el('forgotUsername').value = username;
        el('username').value = username;
        el('resetCode').value = String(out.reset_code || '');
        setOutput('authOut', out, true);
      } catch (e) {
        setOutput('authOut', e.message, false);
      }
    });

    el('resetBtn').addEventListener('click', async () => {
      try {
        const username = String(el('forgotUsername').value || el('username').value || '').trim();
        const reset_code = String(el('resetCode').value || '').trim();
        const new_password = String(el('newPassword').value || '');
        const out = await callPublic('/api/support/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ username, reset_code, new_password })
        });
        setOutput('authOut', out, true);
      } catch (e) {
        setOutput('authOut', e.message, false);
      }
    });

    el('searchBtn').addEventListener('click', async () => {
      try {
        const q = encodeURIComponent(String(el('query').value || '').trim());
        const out = await callApi('/users?query=' + q);
        renderSearchList(out.users || []);
        setOutput('searchOut', out, true);
      } catch (e) {
        renderSearchList([]);
        setOutput('searchOut', e.message, false);
      }
    });

    el('searchRecentBtn').addEventListener('click', async () => {
      try {
        const out = await callApi('/users?limit=20');
        renderSearchList(out.users || []);
        setOutput('searchOut', out, true);
      } catch (e) {
        renderSearchList([]);
        setOutput('searchOut', e.message, false);
      }
    });

    el('loadOverview').addEventListener('click', async () => {
      try {
        const id = String(el('userId').value || '').trim();
        const out = await callApi('/users/' + encodeURIComponent(id) + '/overview');
        setOutput('overviewOut', formatOverviewHuman(out), true);
      } catch (e) {
        setOutput('overviewOut', e.message, false);
      }
    });

    el('loadHistory').addEventListener('click', async () => {
      try {
        const id = String(el('userId').value || '').trim();
        const out = await callApi('/users/' + encodeURIComponent(id) + '/history');
        setOutput('overviewOut', out, true);
      } catch (e) {
        setOutput('overviewOut', e.message, false);
      }
    });

    el('loadAgentCtx').addEventListener('click', async () => {
      try {
        const id = String(el('userId').value || '').trim();
        const out = await callApi('/users/' + encodeURIComponent(id) + '/agent-context');
        setOutput('overviewOut', formatAgentContextHuman(out), true);
      } catch (e) {
        setOutput('overviewOut', e.message, false);
      }
    });

    el('runAction').addEventListener('click', async () => {
      try {
        const id = String(el('userId').value || '').trim();
        if (!id) throw new Error('Select user id first');
        const action = String(el('actionType').value || '').trim();
        const payload = collectActionPayload(action);
        const out = await callApi('/users/' + encodeURIComponent(id) + '/actions', {
          method: 'POST',
          body: JSON.stringify({ action, payload })
        });
        setOutput('actionOut', out, true);
      } catch (e) {
        setOutput('actionOut', e.message, false);
      }
    });

    el('actionType').addEventListener('change', () => {
      const action = String(el('actionType').value || '');
      renderActionFields(action);
    });

    document.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = String(btn.getAttribute('data-quick') || '');
        if (!action) return;
        el('actionType').value = action === 'expire_trial_premium' ? 'set_subscription' : action;
        if (action === 'set_subscription') {
          renderActionFields(action, { plan: 'premium_monthly', status: 'active' });
        } else if (action === 'expire_trial_premium') {
          renderActionFields('set_subscription', { plan: 'trial_premium', status: 'expired' });
        } else {
          renderActionFields(action);
        }
      });
    });

    el('password').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        el('loginBtn').click();
      }
    });
    el('query').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        el('searchBtn').click();
      }
    });
    renderActionFields(el('actionType').value);
    renderSearchList([]);
  </script>
</body>
</html>`);
});

export { apiRouter as supportApiRouter, consoleRouter as supportConsoleRouter };
