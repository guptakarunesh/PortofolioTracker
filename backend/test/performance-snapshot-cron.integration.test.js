import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

async function registerUser(app, suffix) {
  const mobile = `777777880${suffix}`;
  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: suffix === 1 ? 'SA' : 'SB',
      mobile,
      email: `snapshot-${suffix}@example.com`,
      country: 'India',
      firebase_id_token: `mock:${mobile}`,
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.2',
      terms_version: 'v1.1',
      device_context: { device_id: 'test-device' }
    }
  });
  assert.equal(register.status, 201);
  return {
    token: register.body.token,
    userId: register.body.user.id
  };
}

async function addPortfolioRows(app, token, suffix) {
  const asset = await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token,
    body: {
      category: 'Cash & Bank Accounts',
      name: `Snapshot Asset ${suffix}`,
      current_value: 100000 * suffix,
      invested_amount: 90000 * suffix,
      reach_via: 'Portal'
    }
  });
  assert.equal(asset.status, 201);

  const liability = await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token,
    body: {
      loan_type: 'Personal Loan',
      lender: `Snapshot Lender ${suffix}`,
      holder_type: 'Self',
      outstanding_amount: 25000 * suffix
    }
  });
  assert.equal(liability.status, 201);
}

test('monthly performance cron captures all active users once and trend returns max 12 months', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
  process.env.PERFORMANCE_SNAPSHOT_TIME_ZONE = 'Asia/Kolkata';

  const app = await loadApp();
  const first = await registerUser(app, 1);
  const second = await registerUser(app, 2);
  await addPortfolioRows(app, first.token, 1);
  await addPortfolioRows(app, second.token, 2);

  const skipped = await appRequest(app, {
    method: 'POST',
    path: '/internal/cron/performance/monthly-snapshot?now=2026-05-02T20:30:00.000Z',
    headers: { 'x-internal-cron-secret': 'test-secret' }
  });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.action, 'skipped_not_snapshot_day');
  assert.equal(skipped.body.captured, 0);

  const captured = await appRequest(app, {
    method: 'POST',
    path: '/internal/cron/performance/monthly-snapshot?now=2026-04-30T20:30:00.000Z',
    headers: { 'x-internal-cron-secret': 'test-secret' }
  });
  assert.equal(captured.status, 200);
  assert.equal(captured.body.action, 'monthly_snapshots_captured');
  assert.equal(captured.body.snapshot_month, '2026-05-01');
  assert.equal(captured.body.users_seen, 2);
  assert.equal(captured.body.captured, 2);

  const duplicate = await appRequest(app, {
    method: 'POST',
    path: '/internal/cron/performance/monthly-snapshot?now=2026-04-30T20:30:00.000Z',
    headers: { 'x-internal-cron-secret': 'test-secret' }
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.captured, 0);
  assert.equal(duplicate.body.skipped_existing, 2);

  const trend = await appRequest(app, {
    method: 'GET',
    path: '/api/performance/last-twelve',
    token: first.token
  });
  assert.equal(trend.status, 200);
  assert.equal(trend.body.maxMonths, 12);
  assert.equal(trend.body.snapshots.length, 1);
  assert.equal(trend.body.snapshots[0].snapshotMonth, '2026-05-01');
  assert.equal(trend.body.snapshots[0].totalAssets, 100000);
  assert.equal(trend.body.snapshots[0].totalLiabilities, 25000);
  assert.equal(trend.body.snapshots[0].netWorth, 75000);

  const { db } = await import('../src/lib/db.js');
  const insert = db.prepare(`
    INSERT INTO performance_snapshots (
      user_id, quarter_start, total_assets, total_liabilities, net_worth, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, quarter_start) DO UPDATE SET
      total_assets = excluded.total_assets,
      total_liabilities = excluded.total_liabilities,
      net_worth = excluded.net_worth,
      captured_at = excluded.captured_at
  `);
  for (let index = 0; index < 13; index += 1) {
    const date = new Date(Date.UTC(2025, index, 1, 0, 0, 0, 0));
    const snapshotMonth = date.toISOString().slice(0, 10);
    insert.run(first.userId, snapshotMonth, 1000 * (index + 1), 100 * (index + 1), 900 * (index + 1), date.toISOString());
  }

  const capped = await appRequest(app, {
    method: 'GET',
    path: '/api/performance/last-twelve',
    token: first.token
  });
  assert.equal(capped.status, 200);
  assert.equal(capped.body.snapshots.length, 12);
  assert.equal(capped.body.snapshots[0].snapshotMonth, '2025-03-01');
  assert.equal(capped.body.snapshots.at(-1).snapshotMonth, '2026-05-01');
});
