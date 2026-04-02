import { createHash } from 'node:crypto';
import { db, nowIso } from './db.js';
import { decryptString, hashLookup } from './crypto.js';

const ACCOUNT_ACCESS_STATE_KEY = 'account_access_state';
const ACCOUNT_ACCESS_REASON_KEY = 'account_access_reason';
const ACCOUNT_ACCESS_UPDATED_AT_KEY = 'account_access_updated_at';
const ACCOUNT_ACCESS_UPDATED_BY_KEY = 'account_access_updated_by';

function settingMapForUser(userId, keys) {
  const rows = db
    .prepare(
      `
      SELECT key, value
      FROM user_settings
      WHERE user_id = ? AND key IN (${keys.map(() => '?').join(',')})
    `
    )
    .all(userId, ...keys);
  return Object.fromEntries(rows.map((row) => [String(row.key || ''), String(row.value || '')]));
}

function upsertSetting(userId, key, value, updatedAt = nowIso()) {
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(userId, key, String(value ?? ''), updatedAt);
}

function getUserIdentityRow(userId) {
  return db.prepare('SELECT id, mobile, mobile_hash FROM users WHERE id = ? LIMIT 1').get(userId);
}

export function getAccountAccessState(userId) {
  const values = settingMapForUser(userId, [
    ACCOUNT_ACCESS_STATE_KEY,
    ACCOUNT_ACCESS_REASON_KEY,
    ACCOUNT_ACCESS_UPDATED_AT_KEY,
    ACCOUNT_ACCESS_UPDATED_BY_KEY
  ]);
  const status = String(values[ACCOUNT_ACCESS_STATE_KEY] || 'active').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active';
  return {
    status,
    reason: String(values[ACCOUNT_ACCESS_REASON_KEY] || '').trim(),
    updated_at: String(values[ACCOUNT_ACCESS_UPDATED_AT_KEY] || '').trim() || null,
    updated_by: String(values[ACCOUNT_ACCESS_UPDATED_BY_KEY] || '').trim() || null
  };
}

export function disableAccount({ userId, reason = '', actor = 'support', disabledAt = nowIso() }) {
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const tx = db.transaction(() => {
    upsertSetting(userId, ACCOUNT_ACCESS_STATE_KEY, 'disabled', disabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_REASON_KEY, cleanReason, disabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_UPDATED_AT_KEY, disabledAt, disabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_UPDATED_BY_KEY, String(actor || 'support').slice(0, 120), disabledAt);

    const removedSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes || 0;
    const revokedDevices = db
      .prepare('UPDATE user_devices SET trusted = 0, revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(disabledAt, userId).changes || 0;

    return {
      ok: true,
      status: 'disabled',
      reason: cleanReason,
      removed_sessions: Number(removedSessions),
      revoked_devices: Number(revokedDevices)
    };
  });
  return tx();
}

export function enableAccount({ userId, reason = '', actor = 'support', enabledAt = nowIso() }) {
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const tx = db.transaction(() => {
    upsertSetting(userId, ACCOUNT_ACCESS_STATE_KEY, 'active', enabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_REASON_KEY, cleanReason, enabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_UPDATED_AT_KEY, enabledAt, enabledAt);
    upsertSetting(userId, ACCOUNT_ACCESS_UPDATED_BY_KEY, String(actor || 'support').slice(0, 120), enabledAt);
    return {
      ok: true,
      status: 'active',
      reason: cleanReason
    };
  });
  return tx();
}

export function isAccountDisabled(userId) {
  return getAccountAccessState(userId).status === 'disabled';
}

export function deleteAccountCompletely({ userId, reason = '', actor = 'support' }) {
  const user = getUserIdentityRow(userId);
  if (!user) {
    return null;
  }

  const cleanReason = `${String(reason || '').trim().slice(0, 420)}${reason ? '' : 'account_deleted'}`
    .trim()
    .slice(0, 500);
  const deletedAt = nowIso();
  const mobileHash =
    user.mobile_hash ||
    hashLookup(decryptString(user.mobile || '')) ||
    createHash('sha256').update(String(user.mobile || '')).digest('hex');

  const tx = db.transaction(() => {
    const counts = {};
    const deleteRun = (key, sql, ...params) => {
      counts[key] = Number(db.prepare(sql).run(...params).changes || 0);
    };

    db.prepare('INSERT INTO account_deletion_log (user_id, mobile_hash, deleted_at, reason) VALUES (?, ?, ?, ?)')
      .run(user.id, mobileHash, deletedAt, `[${String(actor || 'support').slice(0, 120)}] ${cleanReason}`.slice(0, 500));

    deleteRun('family_invites_by_mobile', 'DELETE FROM family_invites WHERE mobile_hash = ?', mobileHash);
    deleteRun('family_invites_by_owner', 'DELETE FROM family_invites WHERE owner_user_id = ?', user.id);
    deleteRun('family_invites_by_accept', 'DELETE FROM family_invites WHERE accepted_user_id = ?', user.id);
    deleteRun('family_members_owner', 'DELETE FROM family_members WHERE owner_user_id = ?', user.id);
    deleteRun('family_members_member', 'DELETE FROM family_members WHERE member_user_id = ?', user.id);
    deleteRun('family_audit_owner', 'DELETE FROM family_audit WHERE owner_user_id = ?', user.id);
    deleteRun('family_audit_actor', 'DELETE FROM family_audit WHERE actor_user_id = ?', user.id);
    deleteRun('support_actions_target', 'DELETE FROM support_action_log WHERE target_user_id = ?', user.id);
    deleteRun('support_chat', 'DELETE FROM support_chat_messages WHERE user_id = ?', user.id);
    deleteRun('otp_requests', 'DELETE FROM otp_requests WHERE mobile_hash = ?', mobileHash);
    deleteRun('auth_login_log_user', 'DELETE FROM auth_login_log WHERE user_id = ?', user.id);
    deleteRun('auth_login_log_mobile', 'DELETE FROM auth_login_log WHERE mobile_hash = ?', mobileHash);
    deleteRun('security_event_user', 'DELETE FROM security_event_log WHERE user_id = ?', user.id);
    deleteRun('security_event_actor', 'DELETE FROM security_event_log WHERE actor_user_id = ?', user.id);
    deleteRun('security_event_mobile', 'DELETE FROM security_event_log WHERE mobile_hash = ?', mobileHash);
    deleteRun('sensitive_access_owner', 'DELETE FROM sensitive_access_log WHERE owner_user_id = ?', user.id);
    deleteRun('sensitive_access_actor', 'DELETE FROM sensitive_access_log WHERE actor_user_id = ?', user.id);
    deleteRun('device_push_tokens', 'DELETE FROM device_push_tokens WHERE user_id = ?', user.id);
    deleteRun('user_devices', 'DELETE FROM user_devices WHERE user_id = ?', user.id);
    deleteRun('sessions', 'DELETE FROM sessions WHERE user_id = ?', user.id);
    deleteRun('payment_checkout_sessions', 'DELETE FROM payment_checkout_sessions WHERE user_id = ?', user.id);
    deleteRun('payment_history', 'DELETE FROM payment_history WHERE user_id = ?', user.id);
    deleteRun('store_receipts', 'DELETE FROM store_subscription_receipts WHERE user_id = ?', user.id);
    deleteRun('subscriptions', 'DELETE FROM subscriptions WHERE user_id = ?', user.id);
    deleteRun('reminder_notification_log', 'DELETE FROM reminder_notification_log WHERE recipient_user_id = ?', user.id);
    deleteRun('app_notifications', 'DELETE FROM app_notifications WHERE user_id = ?', user.id);
    deleteRun('consent_log', 'DELETE FROM consent_log WHERE user_id = ?', user.id);
    deleteRun('asset_trackers', 'DELETE FROM asset_trackers WHERE user_id = ?', user.id);
    deleteRun('performance_snapshots', 'DELETE FROM performance_snapshots WHERE user_id = ?', user.id);
    deleteRun('reminders', 'DELETE FROM reminders WHERE user_id = ?', user.id);
    deleteRun('transactions', 'DELETE FROM transactions WHERE user_id = ?', user.id);
    deleteRun('liabilities', 'DELETE FROM liabilities WHERE user_id = ?', user.id);
    deleteRun('assets', 'DELETE FROM assets WHERE user_id = ?', user.id);
    deleteRun('user_settings', 'DELETE FROM user_settings WHERE user_id = ?', user.id);
    deleteRun('user', 'DELETE FROM users WHERE id = ?', user.id);

    return {
      ok: true,
      deleted_at: deletedAt,
      mobile_hash: mobileHash,
      reason: cleanReason,
      counts
    };
  });

  return tx();
}
