import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('ai insights include metals coverage when portfolio has precious metals exposure', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';
  process.env.OPENAI_API_KEY = '';

  const app = await loadApp();

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'AI',
      mobile: '7777777781',
      email: 'ai@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777781',
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

  const createAsset = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Precious Metals',
      name: 'Gold Coins',
      current_value: 180000,
      invested_amount: 150000,
      account_ref: 'GOLD-1'
    }
  });
  assert.equal(createAsset.status, 201);

  const insights = await appRequest(app, {
    method: 'GET',
    path: '/api/ai/insights',
    token
  });
  assert.equal(insights.status, 200);
  assert.ok(Array.isArray(insights.body.news_bullets));
  assert.equal(insights.body.news_bullets.length, 5);
  assert.ok(
    insights.body.news_bullets.some((bullet) => /gold|silver|metals/i.test(String(bullet || '')))
  );
  assert.ok(
    insights.body.news_bullets.some((bullet) => /ibja\.co|mcxindia\.com/i.test(String(bullet || '')))
  );
});
