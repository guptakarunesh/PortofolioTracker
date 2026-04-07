import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

async function registerTestUser(app, suffix) {
  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'AI',
      mobile: `77777779${suffix}`,
      email: `ai${suffix}@example.com`,
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

test('financial health score endpoint returns a deterministic score snapshot', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';
  process.env.OPENAI_API_KEY = '';

  const app = await loadApp();
  const token = await registerTestUser(app, '31');

  const assetPayloads = [
    { category: 'Cash & Bank Accounts', name: 'Emergency Fund', current_value: 250000, invested_amount: 250000 },
    { category: 'Market Stocks & RSUs', name: 'Index Fund', current_value: 450000, invested_amount: 400000 },
    { category: 'Real Estate', name: 'Apartment', current_value: 1800000, invested_amount: 1500000 }
  ];
  for (const body of assetPayloads) {
    const response = await appRequest(app, { method: 'POST', path: '/api/assets', token, body });
    assert.equal(response.status, 201);
  }

  const liabilityPayloads = [
    { loan_type: 'Home Loan', lender: 'Sample Bank', outstanding_amount: 900000, tenure_remaining: '180' },
    { loan_type: 'Credit Card', lender: 'Card Issuer', outstanding_amount: 30000, tenure_remaining: '1' }
  ];
  for (const body of liabilityPayloads) {
    const response = await appRequest(app, { method: 'POST', path: '/api/liabilities', token, body });
    assert.equal(response.status, 201);
  }

  const score = await appRequest(app, {
    method: 'GET',
    path: '/api/ai/health-score',
    token
  });

  assert.equal(score.status, 200);
  assert.equal(typeof score.body.score, 'number');
  assert.ok(score.body.score > 0);
  assert.equal(score.body.label.length > 0, true);
  assert.equal(Array.isArray(score.body.drivers), true);
  assert.equal(score.body.drivers.length, 3);
  assert.equal(Array.isArray(score.body.next_steps), true);
  assert.ok(score.body.next_steps.length >= 1);
  assert.equal(score.body.explain_available, true);
  assert.equal(Number(score.body.totals.total_assets), 2500000);
  assert.equal(Number(score.body.totals.total_liabilities), 930000);
});

test('financial health explanation falls back safely when OpenAI is unavailable', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';
  process.env.OPENAI_API_KEY = '';

  const app = await loadApp();
  const token = await registerTestUser(app, '32');

  const createAsset = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Cash & Bank Accounts',
      name: 'Savings',
      current_value: 100000,
      invested_amount: 100000
    }
  });
  assert.equal(createAsset.status, 201);

  const explain = await appRequest(app, {
    method: 'POST',
    path: '/api/ai/health-score/explain',
    token,
    body: {}
  });

  assert.equal(explain.status, 200);
  assert.equal(typeof explain.body.score, 'number');
  assert.equal(explain.body.explanation?.source, 'rule_based');
  assert.equal(typeof explain.body.explanation?.headline, 'string');
  assert.equal(typeof explain.body.explanation?.body, 'string');
  assert.ok(explain.body.explanation.headline.length > 0);
  assert.ok(explain.body.explanation.body.length > 0);
});
