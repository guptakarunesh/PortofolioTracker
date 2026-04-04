import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsightNewsBullets } from '../src/lib/newsPipeline.js';

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
