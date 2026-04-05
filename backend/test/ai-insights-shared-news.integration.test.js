import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('ai insights use shared curated news cache without live ingest on user request', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';
  process.env.OPENAI_API_KEY = '';

  const app = await loadApp();
  const { db, nowIso } = await import('../src/lib/db.js');

  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: 'AI',
      mobile: '7777777782',
      email: 'ai2@example.com',
      country: 'India',
      firebase_id_token: 'mock:7777777782',
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

  const fetchedAt = nowIso();
  const publishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const insertNews = db.prepare(`
    INSERT INTO news_items (
      source_key, source_name, source_domain, category, investment_label, title, summary,
      canonical_url, published_at, fetched_at, trust_score, is_official, source_priority, content_hash, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertNews.run(
    'moneycontrol',
    'Moneycontrol',
    'moneycontrol.com',
    'bank_savings',
    'FDs / Savings / RDs',
    'Banks revise fixed deposit rates',
    'Deposit rates changed across select banks.',
    'https://www.moneycontrol.com/news/business/personal-finance/fd-rates-cache-1.html',
    publishedAt,
    fetchedAt,
    88,
    0,
    82,
    'bank_savings|moneycontrol|banks revise fixed deposit rates',
    JSON.stringify({ guidance: 'compare bank deposit rates, liquidity needs, and cash allocation before changing savings decisions' })
  );

  insertNews.run(
    'ibja',
    'IBJA',
    'ibja.co',
    'gold_metals',
    'Gold / Silver / Metals',
    'Gold prices remain active this week',
    'Bullion movements remain relevant for hedge allocation.',
    'https://www.ibja.co/cache-gold-1',
    publishedAt,
    fetchedAt,
    97,
    1,
    97,
    'gold_metals|ibja|gold prices remain active this week',
    JSON.stringify({ guidance: 'check whether gold or metals exposure still matches your hedging and diversification needs' })
  );

  const insights = await appRequest(app, {
    method: 'GET',
    path: '/api/ai/insights',
    token
  });

  assert.equal(insights.status, 200);
  assert.ok(Array.isArray(insights.body.news_bullets));
  assert.equal(insights.body.news_bullets.length, 5);
  assert.notEqual(insights.body.news_source, 'unavailable_no_api_key');
  assert.ok(
    insights.body.news_bullets.some((bullet) => /Gold \/ Silver \/ Metals|ibja/i.test(String(bullet || '')))
  );
});
