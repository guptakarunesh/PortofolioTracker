import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsightNewsBullets, resolveNewsIngestModel, resolveNewsInsightModel } from '../src/lib/newsPipeline.js';

function makeItem(overrides = {}) {
  return {
    source_key: 'moneycontrol',
    source_name: 'Moneycontrol',
    source_domain: 'moneycontrol.com',
    category: 'stocks',
    investment_label: 'Stocks / ETFs / Mutual Funds',
    title: 'Market update',
    summary: 'Recent market update.',
    canonical_url: 'https://example.com/base-item',
    published_at: '2026-04-05T06:00:00.000Z',
    fetched_at: '2026-04-05T06:05:00.000Z',
    trust_score: 90,
    is_official: 0,
    source_priority: 80,
    metadata: {
      guidance: 'Review allocation and risk.'
    },
    ...overrides
  };
}

test('buildInsightNewsBullets prefers meaningful items over catalog fallback placeholders', async () => {
  const placeholder = makeItem({
    category: 'gold_metals',
    investment_label: 'Gold / Silver / Metals',
    title: 'MCX India latest update feed',
    summary: 'Use MCX India for recent metals developments when live article extraction is unavailable.',
    canonical_url: 'https://www.mcxindia.com',
    source_key: 'mcx',
    source_name: 'MCX India',
    source_domain: 'mcxindia.com',
    is_official: 1,
    source_priority: 100
  });
  const meaningful = makeItem({
    category: 'gold_metals',
    investment_label: 'Gold / Silver / Metals',
    title: 'Gold demand improves on festive buying',
    summary: 'Retail demand and import dynamics shifted this week.',
    canonical_url: 'https://www.moneycontrol.com/news/business/markets/gold-demand-improves-1.html',
    source_key: 'moneycontrol',
    source_name: 'Moneycontrol',
    source_domain: 'moneycontrol.com',
    is_official: 0,
    source_priority: 20
  });

  const result = await buildInsightNewsBullets({
    apiKey: '',
    items: [placeholder, meaningful]
  });

  assert.equal(result.source, 'rule_based');
  assert.ok(Array.isArray(result.bullets));
  assert.ok(result.bullets.length >= 1);
  assert.match(result.bullets[0], /Gold demand improves on festive buying/);
  assert.doesNotMatch(result.bullets[0], /latest update feed/i);
});

test('buildInsightNewsBullets reports catalog-only fallback source when no meaningful items exist', async () => {
  const fallbackOne = makeItem({
    title: 'RBI latest update feed',
    category: 'bank_savings',
    investment_label: 'FDs / Savings / RDs',
    canonical_url: 'https://www.rbi.org.in'
  });
  const fallbackTwo = makeItem({
    title: 'EPFO latest update feed',
    category: 'retirement',
    investment_label: 'EPF / NPS / Retirement',
    canonical_url: 'https://www.epfindia.gov.in'
  });

  const result = await buildInsightNewsBullets({
    apiKey: '',
    items: [fallbackOne, fallbackTwo]
  });

  assert.equal(result.source, 'rule_based_catalog_only');
  assert.ok(Array.isArray(result.bullets));
  assert.ok(result.bullets.length >= 1);
  assert.match(result.bullets[0], /latest update feed/i);
});

test('buildInsightNewsBullets pads sparse non-AI coverage to five bullets', async () => {
  const onlySavings = makeItem({
    category: 'bank_savings',
    investment_label: 'FDs / Savings / RDs',
    title: 'Banks adjust deposit rates',
    summary: 'Deposit rates moved this week.',
    canonical_url: 'https://www.moneycontrol.com/news/business/personal-finance/deposit-rates-move-1.html'
  });

  const result = await buildInsightNewsBullets({
    apiKey: '',
    items: [onlySavings]
  });

  assert.equal(result.source, 'rule_based');
  assert.equal(result.bullets.length, 5);
  assert.ok(result.bullets.some((bullet) => /FDs \/ Savings \/ RDs/.test(bullet)));
  assert.ok(result.bullets.some((bullet) => /Gold \/ Silver \/ Metals/.test(bullet)));
  assert.ok(result.bullets.some((bullet) => /Stocks \/ ETFs \/ Mutual Funds/.test(bullet)));
});

test('buildInsightNewsBullets pads duplicate AI bullets to five bullets with fallback coverage', async () => {
  const originalFetch = global.fetch;
  const onlySavings = makeItem({
    category: 'bank_savings',
    investment_label: 'FDs / Savings / RDs',
    title: 'Banks adjust deposit rates',
    summary: 'Deposit rates moved this week.',
    canonical_url: 'https://www.moneycontrol.com/news/business/personal-finance/deposit-rates-move-2.html'
  });

  global.fetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        output_text: JSON.stringify({
          bullets: [
            '[FDs / Savings / RDs] What happened: Banks adjusted deposit rates. Why it matters: cash yields may change. What to consider: compare latest bank rates. Source: Moneycontrol - https://example.com/fd-1.',
            '[FDs / Savings / RDs] What happened: Banks adjusted deposit rates again. Why it matters: savings yields may change. What to consider: compare latest bank rates. Source: Moneycontrol - https://example.com/fd-2.'
          ]
        })
      })
  });

  try {
    const result = await buildInsightNewsBullets({
      apiKey: 'test-key',
      items: [onlySavings]
    });

    assert.equal(result.source, 'ai_from_curated_news_with_fallback');
    assert.equal(result.bullets.length, 5);
    assert.ok(result.bullets.some((bullet) => /FDs \/ Savings \/ RDs/.test(bullet)));
    assert.ok(result.bullets.some((bullet) => /Gold \/ Silver \/ Metals/.test(bullet)));
    assert.ok(result.bullets.some((bullet) => /EPF \/ NPS \/ Retirement/.test(bullet)));
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveNewsIngestModel falls back to OPENAI_NEWS_MODEL before generic OPENAI_MODEL', () => {
  const previousIngest = process.env.OPENAI_NEWS_INGEST_MODEL;
  const previousNews = process.env.OPENAI_NEWS_MODEL;
  const previousGeneric = process.env.OPENAI_MODEL;

  delete process.env.OPENAI_NEWS_INGEST_MODEL;
  process.env.OPENAI_NEWS_MODEL = 'shared-news-model';
  process.env.OPENAI_MODEL = 'generic-model';

  try {
    assert.equal(resolveNewsIngestModel(), 'shared-news-model');
  } finally {
    if (previousIngest === undefined) delete process.env.OPENAI_NEWS_INGEST_MODEL;
    else process.env.OPENAI_NEWS_INGEST_MODEL = previousIngest;
    if (previousNews === undefined) delete process.env.OPENAI_NEWS_MODEL;
    else process.env.OPENAI_NEWS_MODEL = previousNews;
    if (previousGeneric === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousGeneric;
  }
});

test('resolveNewsInsightModel uses the shared OPENAI_NEWS_MODEL setting', () => {
  const previousNews = process.env.OPENAI_NEWS_MODEL;
  const previousGeneric = process.env.OPENAI_MODEL;

  process.env.OPENAI_NEWS_MODEL = 'shared-news-model';
  process.env.OPENAI_MODEL = 'generic-model';

  try {
    assert.equal(resolveNewsInsightModel(), 'shared-news-model');
  } finally {
    if (previousNews === undefined) delete process.env.OPENAI_NEWS_MODEL;
    else process.env.OPENAI_NEWS_MODEL = previousNews;
    if (previousGeneric === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousGeneric;
  }
});
