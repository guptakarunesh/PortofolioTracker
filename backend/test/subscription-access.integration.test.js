import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('new registration starts with a 30-day basic monthly plan', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'SU',
      mobile: '6666666661',
      email: 'starter@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666661',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  assert.ok(register.body.token);

  const status = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token: register.body.token
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.plan, 'basic_monthly');
  assert.equal(status.body.status, 'active');
  assert.equal(status.body.provider, 'trial');

  const startedAt = new Date(status.body.started_at);
  const periodEnd = new Date(status.body.current_period_end);
  const durationDays = Math.round((periodEnd.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000));
  assert.equal(durationDays, 30);
});

test('basic subscription exposes limits, blocks 6th liability, and allows net worth trend', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { upsertSubscriptionState } = await import('../src/lib/subscription.js');

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'BU',
      mobile: '6666666666',
      email: 'basic@example.com',
      country: 'India',
      firebase_id_token: 'mock:6666666666',
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  const token = register.body.token;
  assert.ok(token);
  const userId = register.body.user?.id;
  assert.ok(userId);

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  upsertSubscriptionState({
    userId,
    plan: 'basic_monthly',
    status: 'active',
    startedAt: now.toISOString(),
    currentPeriodEnd: end.toISOString(),
    provider: 'manual'
  });

  const status = await appRequest(app, {
    method: 'GET',
    path: '/api/subscription/status',
    token
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.plan, 'basic_monthly');
  assert.deepEqual(status.body.limits, { maxAssets: 10, maxLiabilities: 5 });

  for (let index = 0; index < 5; index += 1) {
    const create = await appRequest(app, {
      method: 'POST',
      path: '/api/liabilities',
      token,
      body: {
        loan_type: 'Personal Loan',
        lender: `Lender ${index + 1}`,
        outstanding_amount: 1000 + index
      }
    });
    assert.equal(create.status, 201);
  }

  const blocked = await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token,
    body: {
      loan_type: 'Personal Loan',
      lender: 'Lender 6',
      outstanding_amount: 2000
    }
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'basic_limit_reached');

  const performance = await appRequest(app, {
    method: 'GET',
    path: '/api/performance/last-six',
    token
  });
  assert.equal(performance.status, 200);
  assert.ok(Array.isArray(performance.body.snapshots));
});
