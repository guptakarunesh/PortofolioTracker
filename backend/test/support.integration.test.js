import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('support can expire a user trial with a past period end for expiry-flow testing', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'TO',
      mobile: '6666666601',
      email: 'trial-owner@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666601',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  const userId = register.body.user?.id;
  assert.ok(userId);

  const supportLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/support/auth/login',
    body: { username: 'Admin1', password: 'Pass1' }
  });
  assert.equal(supportLogin.status, 200);
  const supportToken = supportLogin.body.token;
  assert.ok(supportToken);

  const expire = await appRequest(app, {
    method: 'POST',
    path: `/api/support/users/${userId}/actions`,
    token: supportToken,
    body: {
      action: 'set_subscription',
      payload: {
        plan: 'trial_premium',
        status: 'expired'
      }
    }
  });
  assert.equal(expire.status, 200);
  assert.equal(expire.body.plan, 'trial_premium');
  assert.equal(expire.body.status, 'expired');
  assert.ok(new Date(expire.body.current_period_end).getTime() < Date.now());

  const status = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token: register.body.token
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.plan, 'trial_premium');
  assert.equal(status.body.status, 'expired');
  assert.ok(new Date(status.body.current_period_end).getTime() < Date.now());
});

test('support can search users by exact 10-digit mobile number', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'SM',
      mobile: '6666666602',
      email: 'search-mobile@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666602',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);

  const supportLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/support/auth/login',
    body: { username: 'Admin1', password: 'Pass1' }
  });
  assert.equal(supportLogin.status, 200);

  const search = await appRequest(app, {
    method: 'GET',
    path: '/api/support/users?query=6666666602&include_sensitive=1',
    token: supportLogin.body.token
  });
  assert.equal(search.status, 200);
  assert.ok(Array.isArray(search.body.users));
  assert.equal(search.body.users[0]?.mobile, '6666666602');
});

test('support can force-expire a pending family invite before its natural expiry', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { db, nowIso } = await import('../src/lib/db.js');
  const { encryptString, hashLookup } = await import('../src/lib/crypto.js');

  const owner = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'FO',
      mobile: '6666666608',
      email: 'family-owner@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666608',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'family-owner-device' }
    }
  });
  assert.equal(owner.status, 201);
  const ownerId = owner.body.user?.id;
  assert.ok(ownerId);

  const inviteMobile = '6666666609';
  const inviteMobileHash = hashLookup(inviteMobile);
  const createdAt = nowIso();
  const expiresAt = '2099-01-01T00:00:00.000Z';
  const inserted = db.prepare(`
    INSERT INTO family_invites (owner_user_id, mobile_hash, mobile_encrypted, role, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'read', 'pending', ?, ?, ?)
  `).run(ownerId, inviteMobileHash, encryptString(inviteMobile), expiresAt, createdAt, createdAt);
  const inviteId = Number(inserted.lastInsertRowid || 0);
  assert.ok(inviteId);

  const supportLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/support/auth/login',
    body: { username: 'Admin1', password: 'Pass1' }
  });
  assert.equal(supportLogin.status, 200);

  const expireInvite = await appRequest(app, {
    method: 'POST',
    path: `/api/support/users/${ownerId}/actions`,
    token: supportLogin.body.token,
    body: {
      action: 'expire_family_invite',
      payload: {
        invite_id: inviteId
      }
    }
  });
  assert.equal(expireInvite.status, 200);
  assert.equal(expireInvite.body.expired_invite_id, inviteId);

  const inviteRow = db.prepare('SELECT status, expires_at FROM family_invites WHERE id = ?').get(inviteId);
  assert.equal(inviteRow?.status, 'expired');
  assert.ok(new Date(inviteRow?.expires_at || '').getTime() <= Date.now());
});

test('support can disable an account with a reason and block session + otp access', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'DA',
      mobile: '6666666603',
      email: 'disabled-account@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666603',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  const userId = register.body.user?.id;
  assert.ok(userId);

  const supportLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/support/auth/login',
    body: { username: 'Admin1', password: 'Pass1' }
  });
  assert.equal(supportLogin.status, 200);

  const disable = await appRequest(app, {
    method: 'POST',
    path: `/api/support/users/${userId}/actions`,
    token: supportLogin.body.token,
    body: {
      action: 'disable_account',
      payload: {
        reason: 'Fraud review test'
      }
    }
  });
  assert.equal(disable.status, 200);
  assert.equal(disable.body.status, 'disabled');
  assert.equal(disable.body.reason, 'Fraud review test');

  const overview = await appRequest(app, {
    method: 'GET',
    path: `/api/support/users/${userId}/overview?include_sensitive=1`,
    token: supportLogin.body.token
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.account_access?.status, 'disabled');
  assert.equal(overview.body.account_access?.reason, 'Fraud review test');

  const me = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: register.body.token
  });
  assert.equal(me.status, 401);

  const otpSend = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/send',
    body: { mobile: '6666666603' }
  });
  assert.equal(otpSend.status, 403);
  assert.equal(otpSend.body.error, 'account_disabled');
});

test('support can delete an account and clear linked references with a reason note', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { db, nowIso } = await import('../src/lib/db.js');
  const { encryptString, hashLookup } = await import('../src/lib/crypto.js');

  const owner = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'OW',
      mobile: '6666666604',
      email: 'owner-delete@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666604',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'owner-device' }
    }
  });
  assert.equal(owner.status, 201);

  const target = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'TD',
      mobile: '6666666605',
      email: 'target-delete@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666605',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'target-device' }
    }
  });
  assert.equal(target.status, 201);
  const targetId = target.body.user?.id;
  assert.ok(targetId);

  const targetMobileHash = hashLookup('6666666605');
  db.prepare(`
    INSERT INTO family_invites (owner_user_id, mobile_hash, mobile_encrypted, role, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'read', 'pending', ?, ?, ?)
  `).run(owner.body.user.id, targetMobileHash, encryptString('6666666605'), '2099-01-01T00:00:00.000Z', nowIso(), nowIso());
  db.prepare(`
    INSERT INTO assets (user_id, category, name, current_value, updated_at)
    VALUES (?, 'Cash & Bank Accounts', ?, 12345, ?)
  `).run(targetId, encryptString('Delete Test Asset'), nowIso());
  db.prepare(`
    INSERT INTO auth_login_log (user_id, mobile_hash, event_type, auth_method, status, created_at)
    VALUES (?, ?, 'login_success', 'otp', 'ok', ?)
  `).run(targetId, targetMobileHash, nowIso());

  const supportLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/support/auth/login',
    body: { username: 'Admin1', password: 'Pass1' }
  });
  assert.equal(supportLogin.status, 200);

  const deleted = await appRequest(app, {
    method: 'POST',
    path: `/api/support/users/${targetId}/actions`,
    token: supportLogin.body.token,
    body: {
      action: 'delete_account',
      payload: {
        reason: 'Reset account for family test cycle'
      }
    }
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.reason, 'Reset account for family test cycle');

  const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  assert.equal(userRow, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM assets WHERE user_id = ?').get(targetId)?.c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(targetId)?.c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_invites WHERE mobile_hash = ?').get(targetMobileHash)?.c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM auth_login_log WHERE mobile_hash = ?').get(targetMobileHash)?.c, 0);

  const deleteLog = db
    .prepare('SELECT reason FROM account_deletion_log WHERE mobile_hash = ? ORDER BY id DESC LIMIT 1')
    .get(targetMobileHash);
  assert.match(String(deleteLog?.reason || ''), /Reset account for family test cycle/);

  const me = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: target.body.token
  });
  assert.equal(me.status, 401);

  const otpSend = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/send',
    body: { mobile: '6666666605' }
  });
  assert.equal(otpSend.status, 404);

  const historyAfterDelete = await appRequest(app, {
    method: 'GET',
    path: `/api/support/users/${targetId}/history`,
    token: supportLogin.body.token
  });
  assert.equal(historyAfterDelete.status, 404);
  assert.equal(historyAfterDelete.body.error, 'user_not_found');
});
