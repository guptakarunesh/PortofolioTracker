import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

test('internal shared-news refresh returns immediately and completes in background', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
  process.env.SHARED_CURATED_NEWS_COUNTRY = 'IN';
  process.env.SHARED_CURATED_NEWS_REFRESH_HOURS = '12';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_NEWS_MODEL = 'gpt-5-nano';

  const originalFetch = global.fetch;
  global.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output_text: JSON.stringify({
            items: [
              {
                source_key: 'moneycontrol',
                source_name: 'Moneycontrol',
                category: 'stocks',
                title: 'Markets react to bond yield moves',
                summary: 'Equity sentiment shifted after recent yield changes.',
                url: 'https://www.moneycontrol.com/news/business/markets/render-refresh-test.html',
                published_at: new Date().toISOString()
              }
            ]
          })
        })
    };
  };

  try {
    const app = await loadApp();

    const startedAtMs = Date.now();
    const refresh = await appRequest(app, {
      method: 'POST',
      path: '/internal/cron/shared-news/refresh',
      headers: { 'x-internal-cron-secret': 'test-secret' }
    });
    const elapsedMs = Date.now() - startedAtMs;

    assert.equal(refresh.status, 202);
    assert.equal(refresh.body.action, 'force_refresh_started');
    assert.ok(elapsedMs < 100, `expected async refresh response under 100ms, got ${elapsedMs}ms`);

    let ping = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      ping = await appRequest(app, {
        method: 'GET',
        path: '/internal/cron/ping',
        headers: { 'x-internal-cron-secret': 'test-secret' }
      });
      if (!ping.body?.refresh_job?.running && ping.body?.refresh_job?.last_result) break;
    }

    assert.equal(ping?.status, 200);
    assert.equal(ping.body.refresh_job.running, false);
    assert.equal(ping.body.refresh_job.trigger, 'force_refresh');
    assert.equal(ping.body.refresh_job.last_result.ingest_ok, true);
    assert.equal(ping.body.shared_curated_news.stale, false);
    assert.ok(Number(ping.body.shared_curated_news.meaningful_count || 0) >= 1);
  } finally {
    global.fetch = originalFetch;
  }
});
