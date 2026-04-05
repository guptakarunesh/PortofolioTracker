import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('auth + family sharing + access roles', async (t) => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { upsertSubscriptionState } = await import('../src/lib/subscription.js');

  const ownerPayload = {
    full_name: 'OU',
    mobile: '9999999999',
    email: 'owner@example.com',
    country: 'India',
    firebase_id_token: 'mock:9999999999',
    consent_privacy: true,
    consent_terms: true,
    privacy_policy_version: 'v1.1',
    terms_version: 'v1.1',
    device_context: { device_id: 'test-device' }
  };

  const ownerRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: ownerPayload
  });
  assert.equal(ownerRegister.status, 201);
  const ownerToken = ownerRegister.body.token;
  assert.ok(ownerToken);
  const ownerUserId = ownerRegister.body.user?.id;
  assert.ok(ownerUserId);

  const premiumEnd = new Date();
  premiumEnd.setDate(premiumEnd.getDate() + 30);
  upsertSubscriptionState({
    userId: ownerUserId,
    plan: 'premium_monthly',
    status: 'active',
    startedAt: new Date().toISOString(),
    currentPeriodEnd: premiumEnd.toISOString(),
    provider: 'manual'
  });

  const assetCreate = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token: ownerToken,
    body: {
      category: 'Banking & Deposits',
      sub_category: 'Savings',
      name: 'Test Bank',
      institution: 'Unit Test',
      account_ref: 'XXXX1111',
      quantity: 1,
      invested_amount: 1000,
      current_value: 1000
    }
  });
  assert.equal(assetCreate.status, 201);

  const invite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerToken,
    body: { mobile: '8888888888', role: 'read' }
  });
  assert.equal(invite.status, 201);
  assert.ok(invite.body.invite);

  const auditAfterInvite = await appRequest(app, {
    method: 'GET',
    path: '/api/family/audit',
    token: ownerToken
  });
  assert.equal(auditAfterInvite.status, 200);
  assert.ok(auditAfterInvite.body.audit.some((row) => row.action === 'invite_created'));

  const memberRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'MU',
      mobile: '8888888888',
      email: 'member@example.com',
      country: 'India',
      firebase_id_token: 'mock:8888888888',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(memberRegister.status, 201);
  const memberToken = memberRegister.body.token;

  const accessInfo = await appRequest(app, {
    method: 'GET',
    path: '/api/family/access',
    token: memberToken
  });
  assert.equal(accessInfo.status, 200);
  assert.equal(accessInfo.body.role, 'read');

  const memberAssets = await appRequest(app, {
    method: 'GET',
    path: '/api/assets',
    token: memberToken
  });
  assert.equal(memberAssets.status, 200);
  assert.equal(memberAssets.body.length, 1);

  const memberAssetCreate = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token: memberToken,
    body: {
      category: 'Market Investments',
      name: 'Read Role Asset'
    }
  });
  assert.equal(memberAssetCreate.status, 403);

  const familyList = await appRequest(app, {
    method: 'GET',
    path: '/api/family',
    token: ownerToken
  });
  const memberRow = familyList.body.members[0];
  const roleUpdate = await appRequest(app, {
    method: 'PUT',
    path: `/api/family/${memberRow.id}`,
    token: ownerToken,
    body: { role: 'write' }
  });
  assert.equal(roleUpdate.status, 200);
  assert.equal(roleUpdate.body.role, 'write');

  const memberAssetCreate2 = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token: memberToken,
    body: {
      category: 'Market Investments',
      name: 'Write Role Asset'
    }
  });
  assert.equal(memberAssetCreate2.status, 201);
});

test('otp login flow (mock)', async (t) => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'OU',
      mobile: '7777777777',
      email: 'otp@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777777',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });

  const send = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/send',
    body: { mobile: '7777777777' }
  });
  assert.equal(send.status, 200);
  assert.ok(send.body.otp);

  const verify = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/verify',
    body: {
      mobile: '7777777777',
      otp: send.body.otp,
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.body.token);
});

test('biometric login can create a fresh session after logout on the same trusted device', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'BL',
      mobile: '7777777778',
      email: 'biometric@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777778',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  assert.ok(register.body.token);

  const enableBiometric = await appRequest(app, {
    method: 'PUT',
    path: '/api/settings',
    token: register.body.token,
    body: {
      biometric_login_enabled: '1'
    }
  });
  assert.equal(enableBiometric.status, 200);

  const logout = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/logout',
    token: register.body.token
  });
  assert.equal(logout.status, 204);

  const biometricLogin = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/biometric/login',
    body: {
      mobile: '7777777778',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(biometricLogin.status, 200);
  assert.ok(biometricLogin.body.token);

  const me = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: biometricLogin.body.token
  });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.mobile, '7777777778');
});

test('logout invalidates a recently cached auth session', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'LC',
      mobile: '7777777791',
      email: 'logout-cache@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777791',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'cache-test-device' }
    }
  });
  assert.equal(register.status, 201);

  const meBeforeLogout = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: register.body.token,
    headers: { 'x-device-id': 'cache-test-device' }
  });
  assert.equal(meBeforeLogout.status, 200);

  const logout = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/logout',
    token: register.body.token,
    headers: { 'x-device-id': 'cache-test-device' }
  });
  assert.equal(logout.status, 204);

  const meAfterLogout = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: register.body.token,
    headers: { 'x-device-id': 'cache-test-device' }
  });
  assert.equal(meAfterLogout.status, 401);
});

test('otp verify returns 503 instead of crashing on transient database timeout', async (t) => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'TV',
      mobile: '7777777792',
      email: 'timeout-verify@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777792',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'timeout-device' }
    }
  });

  const send = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/send',
    body: { mobile: '7777777792' }
  });
  assert.equal(send.status, 200);

  const { db } = await import('../src/lib/db.js');
  const originalPrepare = db.prepare.bind(db);
  t.after(() => {
    db.prepare = originalPrepare;
  });
  db.prepare = (sql) => {
    if (String(sql).includes('SELECT * FROM users WHERE mobile_hash = ?')) {
      throw new Error('database query failed: database query timed out after 32000ms');
    }
    return originalPrepare(sql);
  };

  const verify = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/otp/verify',
    body: {
      mobile: '7777777792',
      otp: send.body.otp,
      device_context: { device_id: 'timeout-device' }
    }
  });
  assert.equal(verify.status, 503);
  assert.equal(verify.body.error, 'service_temporarily_unavailable');
});

test('protected routes return 503 on transient session lookup timeout', async (t) => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'TS',
      mobile: '7777777793',
      email: 'timeout-session@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777793',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'timeout-session-device' }
    }
  });
  assert.equal(register.status, 201);

  const { hashToken } = await import('../src/lib/auth.js');
  const { invalidateAuthSessionCache } = await import('../src/middleware/requireAuth.js');
  invalidateAuthSessionCache(hashToken(register.body.token));

  const { db } = await import('../src/lib/db.js');
  const originalPrepare = db.prepare.bind(db);
  t.after(() => {
    db.prepare = originalPrepare;
  });
  db.prepare = (sql) => {
    if (String(sql).includes('FROM sessions s')) {
      throw new Error('database query failed: Connection terminated due to connection timeout');
    }
    return originalPrepare(sql);
  };

  const me = await appRequest(app, {
    method: 'GET',
    path: '/api/auth/me',
    token: register.body.token,
    headers: { 'x-device-id': 'timeout-session-device' }
  });
  assert.equal(me.status, 503);
  assert.equal(me.body.error, 'service_temporarily_unavailable');
});

test('expired family members can login, see admin renewal info, and leave into their own trial', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { upsertSubscriptionState } = await import('../src/lib/subscription.js');

  const ownerRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'OU',
      mobile: '7777777781',
      email: 'owner-expired@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777781',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(ownerRegister.status, 201);
  const ownerToken = ownerRegister.body.token;
  const ownerUserId = ownerRegister.body.user?.id;
  assert.ok(ownerUserId);

  const premiumEnd = new Date();
  premiumEnd.setDate(premiumEnd.getDate() + 10);
  upsertSubscriptionState({
    userId: ownerUserId,
    plan: 'premium_monthly',
    status: 'active',
    startedAt: new Date().toISOString(),
    currentPeriodEnd: premiumEnd.toISOString(),
    provider: 'manual'
  });

  const invite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerToken,
    body: { mobile: '7777777782', role: 'read' }
  });
  assert.equal(invite.status, 201);

  const memberRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'MU',
      mobile: '7777777782',
      email: 'member-expired@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777782',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(memberRegister.status, 201);
  const memberToken = memberRegister.body.token;

  upsertSubscriptionState({
    userId: ownerUserId,
    plan: 'premium_monthly',
    status: 'expired',
    startedAt: new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString(),
    currentPeriodEnd: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString(),
    provider: 'manual'
  });

  const accessWhileExpired = await appRequest(app, {
    method: 'GET',
    path: '/api/family/access',
    token: memberToken
  });
  assert.equal(accessWhileExpired.status, 200);
  assert.equal(accessWhileExpired.body.role, 'read');
  assert.equal(accessWhileExpired.body.can_manage_subscription, false);
  assert.ok(accessWhileExpired.body.admin_initials.includes('OU'));

  const statusWhileExpired = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token: memberToken
  });
  assert.equal(statusWhileExpired.status, 200);
  assert.equal(statusWhileExpired.body.plan, 'premium_monthly');
  assert.equal(statusWhileExpired.body.status, 'expired');

  const leave = await appRequest(app, {
    method: 'POST',
    path: '/api/family/leave',
    token: memberToken
  });
  assert.equal(leave.status, 200);
  assert.equal(leave.body.subscription.plan, 'trial_premium');
  assert.equal(leave.body.subscription.status, 'active');

  const ownAccess = await appRequest(app, {
    method: 'GET',
    path: '/api/family/access',
    token: memberToken
  });
  assert.equal(ownAccess.status, 200);
  assert.equal(ownAccess.body.is_owner, true);
  assert.equal(ownAccess.body.can_manage_subscription, true);

  const ownStatus = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token: memberToken
  });
  assert.equal(ownStatus.status, 200);
  assert.equal(ownStatus.body.plan, 'trial_premium');
  assert.equal(ownStatus.body.status, 'active');
});

test('family admins can renew the owner subscription', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { upsertSubscriptionState } = await import('../src/lib/subscription.js');

  const ownerRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'OU',
      mobile: '7777777783',
      email: 'owner-admin@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777783',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(ownerRegister.status, 201);
  const ownerToken = ownerRegister.body.token;
  const ownerUserId = ownerRegister.body.user?.id;
  assert.ok(ownerUserId);

  const invite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerToken,
    body: { mobile: '7777777784', role: 'admin' }
  });
  assert.equal(invite.status, 201);

  const adminRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'AM',
      mobile: '7777777784',
      email: 'admin-member@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777784',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(adminRegister.status, 201);
  const adminToken = adminRegister.body.token;

  upsertSubscriptionState({
    userId: ownerUserId,
    plan: 'trial_premium',
    status: 'expired',
    startedAt: new Date(Date.now() - (35 * 24 * 60 * 60 * 1000)).toISOString(),
    currentPeriodEnd: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString(),
    provider: 'trial'
  });

  const purchase = await appRequest(app, {
    method: 'POST',
    path: '/api/subscription/purchase',
    token: adminToken,
    body: { plan: 'premium_monthly' }
  });
  assert.equal(purchase.status, 200);
  assert.equal(purchase.body.plan, 'premium_monthly');

  const ownerStatus = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token: ownerToken
  });
  assert.equal(ownerStatus.status, 200);
  assert.equal(ownerStatus.body.plan, 'premium_monthly');
  assert.equal(ownerStatus.body.status, 'active');
});
