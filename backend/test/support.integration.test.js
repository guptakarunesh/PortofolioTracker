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
