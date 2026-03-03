import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('auth + family sharing + access roles', async (t) => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const ownerPayload = {
    full_name: 'Owner User',
    mobile: '9999999999',
    email: 'owner@example.com',
    mpin: '1234',
    consent_privacy: true,
    consent_terms: true,
    privacy_policy_version: 'v1.0',
    terms_version: 'v1.0'
  };

  const ownerRegister = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: ownerPayload
  });
  assert.equal(ownerRegister.status, 201);
  const ownerToken = ownerRegister.body.token;
  assert.ok(ownerToken);

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
      full_name: 'Member User',
      mobile: '8888888888',
      email: 'member@example.com',
      mpin: '1111',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.0',
      terms_version: 'v1.0'
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
      full_name: 'Otp User',
      mobile: '7777777777',
      email: 'otp@example.com',
      mpin: '1234',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.0',
      terms_version: 'v1.0'
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
    body: { mobile: '7777777777', otp: send.body.otp }
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.body.token);
});
