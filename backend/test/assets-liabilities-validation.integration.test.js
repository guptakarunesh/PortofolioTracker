import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

async function registerTestUser(app, suffix) {
  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'VU',
      mobile: `77777779${suffix}`,
      email: `validation${suffix}@example.com`,
      country: 'India',
      firebase_id_token: `mock:77777779${suffix}`,
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  assert.ok(register.body.token);
  return register.body.token;
}

test('asset creation requires category, name, reach_via, and current_value', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const token = await registerTestUser(app, '41');

  const missingCurrentValue = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Cash & Bank Accounts',
      name: 'Savings',
      reach_via: 'Branch'
    }
  });
  assert.equal(missingCurrentValue.status, 400);
  assert.equal(missingCurrentValue.body.error, 'current_value_required');

  const missingReachVia = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Cash & Bank Accounts',
      name: 'Savings',
      current_value: 1000
    }
  });
  assert.equal(missingReachVia.status, 400);
  assert.equal(missingReachVia.body.error, 'reach_via_required');
});

test('liability creation requires loan_type, lender, holder_type, and outstanding_amount', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const token = await registerTestUser(app, '42');

  const missingOutstandingAmount = await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token,
    body: {
      loan_type: 'Home Loan',
      lender: 'Sample Bank',
      holder_type: 'Self'
    }
  });
  assert.equal(missingOutstandingAmount.status, 400);
  assert.equal(missingOutstandingAmount.body.error, 'outstanding_amount_required');

  const missingHolderType = await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token,
    body: {
      loan_type: 'Home Loan',
      lender: 'Sample Bank',
      outstanding_amount: 1000
    }
  });
  assert.equal(missingHolderType.status, 400);
  assert.equal(missingHolderType.body.error, 'holder_type_required');
});
