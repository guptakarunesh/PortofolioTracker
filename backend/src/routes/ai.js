import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { buildInsightNewsBullets, filterMeaningfulCuratedNewsItems, getSharedCuratedNewsState } from '../lib/newsPipeline.js';
import { resolveOpenAiApiKey } from '../lib/openai.js';
import {
  buildFinancialHealthExplainPrompt,
  buildFinancialHealthFallbackExplanation,
  calculateFinancialHealthScore
} from '../lib/financialHealth.js';

const router = Router();
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AI_BULLET_BUILD_TIMEOUT_MS = Math.max(
  8_000,
  Number.parseInt(process.env.AI_BULLET_BUILD_TIMEOUT_MS || '20000', 10)
);
const AI_SCORE_EXPLAIN_TIMEOUT_MS = Math.max(
  6_000,
  Number.parseInt(process.env.AI_SCORE_EXPLAIN_TIMEOUT_MS || process.env.AI_NONWEB_TIMEOUT_MS || '12000', 10)
);
const SHARED_CURATED_NEWS_REFRESH_HOURS = Math.max(
  1,
  Number.parseInt(process.env.SHARED_CURATED_NEWS_REFRESH_HOURS || '12', 10)
);

const CATEGORY_BUCKETS = [
  'Cash & Bank Accounts',
  'Market Stocks & RSUs',
  'Retirement Funds',
  'Real Estate',
  'Vehicles',
  'Business Equity',
  'Precious Metals',
  'Jewelry & Watches',
  'Collectibles',
  'Insurance & Other'
];

const CONSERVATIVE_RANGES = {
  'Cash & Bank Accounts': [20, 40],
  'Market Stocks & RSUs': [15, 30],
  'Retirement Funds': [10, 20],
  'Precious Metals': [5, 15],
  'Real Estate': [10, 20],
  'Vehicles': [0, 10],
  'Business Equity': [0, 8],
  'Jewelry & Watches': [0, 8],
  'Collectibles': [0, 5],
  'Insurance & Other': [3, 10]
};

function getUserSetting(userId, key) {
  const row = db
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ? LIMIT 1')
    .get(userId, key);
  return row?.value ?? null;
}

function setUserSetting(userId, key, value) {
  db.prepare(
    `
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `
  ).run(userId, key, value, nowIso());
}

function deleteUserSetting(userId, key) {
  db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, key);
}

function isAiGeneratedNewsSource(value = '') {
  return String(value || '').toLowerCase().startsWith('ai_');
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_e) {
    return fallback;
  }
}

function normalizeCountry(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function currencyFromCountry(country = '') {
  const normalized = normalizeCountry(country);
  if (!normalized) return 'INR';
  const map = {
    india: 'INR',
    'united states': 'USD',
    usa: 'USD',
    'united kingdom': 'GBP',
    uk: 'GBP',
    'united arab emirates': 'AED',
    uae: 'AED',
    singapore: 'SGD',
    germany: 'EUR',
    france: 'EUR',
    spain: 'EUR',
    italy: 'EUR',
    netherlands: 'EUR',
    europe: 'EUR'
  };
  if (map[normalized]) return map[normalized];
  if (normalized.includes('united states')) return 'USD';
  if (normalized.includes('united kingdom')) return 'GBP';
  if (normalized.includes('arab emirates')) return 'AED';
  if (normalized.includes('singapore')) return 'SGD';
  if (normalized.includes('europe')) return 'EUR';
  return 'INR';
}

function countryCodeFromCountry(country = '') {
  const normalized = normalizeCountry(country);
  if (!normalized) return 'IN';
  const map = {
    india: 'IN',
    'united states': 'US',
    usa: 'US',
    'united kingdom': 'GB',
    uk: 'GB',
    'united arab emirates': 'AE',
    uae: 'AE',
    singapore: 'SG',
    germany: 'DE',
    france: 'FR',
    spain: 'ES',
    italy: 'IT',
    netherlands: 'NL'
  };
  return map[normalized] || 'IN';
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumBy(rows, field) {
  return rows.reduce((acc, row) => acc + safeNumber(row?.[field]), 0);
}

function bucketFromAssetCategory(category = '') {
  const c = String(category || '').toLowerCase();
  if (c.includes('cash & bank') || c.includes('banking') || c.includes('deposit') || c.includes('cash')) return 'Cash & Bank Accounts';
  if (c.includes('market stocks') || c.includes('rsu') || c.includes('market') || c.includes('etf') || c.includes('stock') || c.includes('mutual')) return 'Market Stocks & RSUs';
  if (c.includes('retirement') || c.includes('epf') || c.includes('ppf') || c.includes('vpf') || c.includes('nps')) return 'Retirement Funds';
  if (c.includes('real estate') || c.includes('property')) return 'Real Estate';
  if (c.includes('vehicle') || c.includes('car') || c.includes('boat') || c.includes('powersport')) return 'Vehicles';
  if (c.includes('business equity') || c.includes('startup') || c.includes('private ownership')) return 'Business Equity';
  if (c.includes('jewelry') || c.includes('jewellery') || c.includes('watch') || c.includes('gemstone')) return 'Jewelry & Watches';
  if (c.includes('collectible') || c.includes('art') || c.includes('wine') || c.includes('memorabilia') || c.includes('trading card')) return 'Collectibles';
  if (c.includes('precious') || c.includes('gold') || c.includes('silver')) return 'Precious Metals';
  if (c.includes('insurance') || c.includes('crypto') || c.includes('ip')) return 'Insurance & Other';
  return 'Insurance & Other';
}

function getConservativeGaps(assets) {
  const byCategoryRows = new Map();
  for (const asset of assets) {
    const category = asset.category || 'Insurance & Other';
    const total = byCategoryRows.get(category) || 0;
    byCategoryRows.set(category, total + safeNumber(asset.current_value));
  }

  const allocation = CATEGORY_BUCKETS.map((category) => ({
    category,
    currentValue: byCategoryRows.get(category) || 0
  }));
  const totalAssets = allocation.reduce((sum, row) => sum + row.currentValue, 0);
  const withPct = allocation.map((row) => ({
    ...row,
    pctOfTotal: totalAssets > 0 ? (row.currentValue / totalAssets) * 100 : 0
  }));

  const gaps = withPct.map((row) => {
    const range = CONSERVATIVE_RANGES[row.category] || [0, 100];
    const min = range[0];
    const max = range[1];
    const pct = Number(row.pctOfTotal || 0);
    const deltaLow = min - pct;
    const deltaHigh = pct - max;
    const status = pct < min ? 'below' : pct > max ? 'above' : 'within';
    const gapPct = status === 'below' ? deltaLow : status === 'above' ? deltaHigh : 0;

    return {
      category: row.category,
      currentPct: pct,
      targetMin: min,
      targetMax: max,
      status,
      gapPct
    };
  });

  return gaps
    .filter((gap) => gap.status !== 'within')
    .sort((a, b) => Number(b.gapPct || 0) - Number(a.gapPct || 0));
}

function metalsFallbackBullet(reason = 'Live metals coverage is limited right now.') {
  return `Gold / Silver / Metals. What happened: ${reason} Why it matters: metal prices can change portfolio hedge value quickly. What to consider: review current bullion rates and whether your hedge allocation still fits. Source: IBJA - https://www.ibja.co/`;
}

function hasMetalsBullet(bullets = []) {
  return Array.isArray(bullets) && bullets.some((bullet) => /gold|silver|metals/i.test(String(bullet || '')));
}

function ensureMetalsCoverage(bullets = [], { includeMetals = false, reason } = {}) {
  const list = Array.isArray(bullets) ? bullets.filter(Boolean) : [];
  if (!includeMetals || hasMetalsBullet(list)) {
    return list.slice(0, 5);
  }
  const fallback = metalsFallbackBullet(reason);
  const withoutDuplicateMetals = list.filter((bullet) => !/gold|silver|metals/i.test(String(bullet || '')));
  return [fallback, ...withoutDuplicateMetals].slice(0, 5);
}

function unavailableNewsBullets(reason = 'Live news fetch unavailable right now.', options = {}) {
  const bullets = [
    `Stocks / ETFs / Mutual Funds. What happened: ${reason} Why it matters: stock and fund moves may be missed. What to consider: check index, sector, and fund updates manually. Source: NSE India - https://www.nseindia.com/`,
    `FDs / Savings / RDs. What happened: ${reason} Why it matters: deposit rates may have changed. What to consider: review latest bank and RBI rate circulars. Source: RBI - https://www.rbi.org.in/`,
    `EPF / NPS / Insurance. What happened: ${reason} Why it matters: rule or contribution changes may matter. What to consider: verify scheme and policy updates manually. Source: EPFO - https://www.epfindia.gov.in/`,
    `Gold / Silver / Bonds. What happened: ${reason} Why it matters: commodity and yield moves can shift returns. What to consider: check bullion prices and bond yield direction. Source: MCX - https://www.mcxindia.com/`,
    `Real Estate (Land / Flats). What happened: ${reason} Why it matters: policy and demand shifts can affect prices. What to consider: verify local market and rate updates. Source: CREDAI - https://credai.org/`
  ];
  return ensureMetalsCoverage(bullets, options);
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const safePromise = Promise.resolve(promise);
  safePromise.catch(() => {
    // Prevent late rejections from surfacing as unhandled when timeout wins.
  });
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message || 'timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([safePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function readFinancialHealthWeights(userId) {
  const raw = getUserSetting(userId, 'financial_health_weights');
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    debt_to_asset: Number(parsed.debt_to_asset),
    liquidity: Number(parsed.liquidity),
    asset_diversity: Number(parsed.asset_diversity)
  };
}

function buildFinancialHealthSnapshot(userId) {
  const assets = db
    .prepare(
      `SELECT id, category, current_value
       FROM assets
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(userId);
  const liabilities = db
    .prepare(
      `SELECT id, loan_type, outstanding_amount, tenure_remaining, end_date
       FROM liabilities
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(userId);

  return calculateFinancialHealthScore({
    assets,
    liabilities,
    weights: readFinancialHealthWeights(userId),
    asOf: nowIso()
  });
}

function extractExplainOutputText(parsed = {}) {
  if (typeof parsed?.output_text === 'string' && parsed.output_text.trim()) return parsed.output_text.trim();
  const output = Array.isArray(parsed?.output) ? parsed.output : [];
  const parts = [];
  for (const item of output) {
    if (item?.type !== 'message') continue;
    for (const chunk of Array.isArray(item?.content) ? item.content : []) {
      if (typeof chunk?.text === 'string' && chunk.text.trim()) parts.push(chunk.text.trim());
      else if (typeof chunk?.text?.value === 'string' && chunk.text.value.trim()) parts.push(chunk.text.value.trim());
      else if (typeof chunk?.output_text === 'string' && chunk.output_text.trim()) parts.push(chunk.output_text.trim());
    }
  }
  return parts.join('\n').trim();
}

function parseExplainPayload(raw = '') {
  const direct = safeJsonParse(raw, null);
  if (direct && typeof direct === 'object') return direct;
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const recovered = safeJsonParse(text.slice(start, end + 1), null);
    if (recovered && typeof recovered === 'object') return recovered;
  }
  throw new Error('invalid_explain_payload');
}

async function buildFinancialHealthAiExplanation(snapshot, apiKey) {
  const prompt = buildFinancialHealthExplainPrompt(snapshot);
  const response = await withTimeout(
    fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: String(process.env.OPENAI_SUPPORT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano').trim() || 'gpt-5-nano',
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'financial_health_explanation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                headline: { type: 'string' },
                body: { type: 'string' }
              },
              required: ['headline', 'body']
            }
          }
        }
      })
    }),
    AI_SCORE_EXPLAIN_TIMEOUT_MS,
    'financial_health_explanation_timeout'
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `OpenAI request failed (${response.status})`);
  }
  const parsed = JSON.parse(raw);
  const outputText = extractExplainOutputText(parsed);
  if (!outputText) throw new Error('financial_health_explanation_empty');
  const payload = parseExplainPayload(outputText);
  return {
    source: 'ai',
    headline: String(payload?.headline || '').trim(),
    body: String(payload?.body || '').trim(),
    actions: []
  };
}

router.get('/health-score', async (req, res) => {
  const snapshot = buildFinancialHealthSnapshot(req.accountUserId);
  return res.json({
    ...snapshot,
    disclaimer:
      'This score is calculated from the assets and liabilities you entered. It is educational only and not investment, tax, or legal advice.',
    explain_available: true
  });
});

router.post('/health-score/explain', async (req, res) => {
  const snapshot = buildFinancialHealthSnapshot(req.accountUserId);
  const apiKey = resolveOpenAiApiKey();

  try {
    const explanation = apiKey
      ? await buildFinancialHealthAiExplanation(snapshot, apiKey)
      : buildFinancialHealthFallbackExplanation(snapshot);
    return res.json({
      as_of: snapshot.as_of,
      score: snapshot.score,
      explanation,
      disclaimer:
        explanation.source === 'ai'
          ? 'AI-generated explanation for awareness only. It can be incomplete or incorrect.'
          : 'Rule-based explanation generated from your latest asset and liability snapshot.'
    });
  } catch (_error) {
    const fallback = buildFinancialHealthFallbackExplanation(snapshot);
    return res.json({
      as_of: snapshot.as_of,
      score: snapshot.score,
      explanation: fallback,
      warning: 'ai_explanation_unavailable_using_rule_based',
      disclaimer: 'Rule-based explanation generated from your latest asset and liability snapshot.'
    });
  }
});

router.get('/insights', async (req, res) => {
  const apiKey = resolveOpenAiApiKey();
  const accountUserId = req.accountUserId;
  const storedCountry = getUserSetting(accountUserId, 'country') || '';
  const country = storedCountry || 'India';
  if (!storedCountry) {
    setUserSetting(accountUserId, 'country', 'India');
  }
  const countryCode = countryCodeFromCountry(country);
  const storedCurrency = getUserSetting(accountUserId, 'preferred_currency') || '';
  const preferredCurrency = storedCurrency || currencyFromCountry(country);
  if (!storedCurrency) {
    setUserSetting(accountUserId, 'preferred_currency', preferredCurrency);
  }

  const assets = db
    .prepare(
      `SELECT id, category, name, account_ref, tracking_url, invested_amount, current_value
       FROM assets
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(accountUserId);
  const liabilities = db
    .prepare(
      `SELECT id, loan_type, lender, outstanding_amount
       FROM liabilities
       WHERE user_id = ?
       ORDER BY id DESC`
    )
    .all(accountUserId);

  const totalAssets = sumBy(assets, 'current_value');
  const totalLiabilities = sumBy(liabilities, 'outstanding_amount');
  const netWorth = totalAssets - totalLiabilities;

  const byBucket = {};
  for (const asset of assets) {
    const bucket = bucketFromAssetCategory(asset.category);
    byBucket[bucket] = (byBucket[bucket] || 0) + safeNumber(asset.current_value);
  }

  const topAssets = [...assets]
    .sort((a, b) => safeNumber(b.current_value) - safeNumber(a.current_value))
    .slice(0, 10)
    .map((a) => ({
      name: a.name,
      category: a.category,
      bucket: bucketFromAssetCategory(a.category),
      current_value: safeNumber(a.current_value)
    }));

  const portfolio = {
    as_of: nowIso(),
    totals: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth
    },
    allocation: {
      by_bucket_value: byBucket,
      by_bucket_pct: Object.fromEntries(
        Object.entries(byBucket).map(([k, v]) => [k, totalAssets > 0 ? Math.round((v / totalAssets) * 1000) / 10 : 0])
      )
    },
    top_assets: topAssets,
    liabilities_summary: {
      count: liabilities.length,
      total_outstanding: totalLiabilities
    }
  };
  const newsPromptContext = {
    as_of: portfolio.as_of,
    totals: portfolio.totals,
    allocation_pct: portfolio.allocation.by_bucket_pct
  };
  const hasPreciousMetalsExposure = safeNumber(byBucket['Precious Metals']) > 0;

  const conservativeGaps = getConservativeGaps(assets);
  const topGaps = conservativeGaps.slice(0, 2);
  const gapBullets = topGaps.map((gap) => {
    const action = gap.status === 'above' ? 'review trimming future additions' : 'review whether you want to build this allocation gradually';
    return `${gap.category}: now ${gap.currentPct.toFixed(1)}% of assets versus a conservative range of ${gap.targetMin}-${gap.targetMax}%. What to do next: ${action}.`;
  });
  if (!gapBullets.length) {
    gapBullets.push('Allocation check: no major gap against conservative ranges right now. What to do next: stay diversified and review changes before making large additions.');
  }

  const conservativeSummary =
    'Portfolio balance: a few buckets still dominate your assets. What to do next: review whether cash, long-term retirement, and diversification buckets need gradual strengthening.';

  const liabilityBullet = totalLiabilities > 0
    ? `Liabilities: outstanding balance is ${Math.round(totalLiabilities).toLocaleString()} across ${liabilities.length} loan(s). What to do next: compare debt reduction versus fresh investing before committing new money.`
    : 'Liabilities: no outstanding liabilities detected. What to do next: focus on allocation quality, liquidity, and diversification.';

  const defaultDisclaimer =
    'These insights are AI-generated using publicly available country-level information and your portfolio data. ' +
    'They are for awareness only and can be incomplete or incorrect. Please research further and consult a financial advisor before making decisions.';

  const cacheRaw = getUserSetting(accountUserId, 'ai_insights_cache');
  const forceRefresh = String(req.query.force_refresh || '') === '1';
  const sharedCuratedNewsState = getSharedCuratedNewsState({ staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS });
  const currentNewsSnapshotAt = String(sharedCuratedNewsState.last_success_at || '');
  let cache = null;
  try {
    cache = cacheRaw ? JSON.parse(cacheRaw) : null;
  } catch (_e) {
    cache = null;
  }
  const cachedAt = cache?.cached_at ? new Date(cache.cached_at).getTime() : 0;
  const within24h = cachedAt && Date.now() - cachedAt < AI_CACHE_TTL_MS;
  const cacheDisplayAsOf = cache?.cached_at || nowIso();
  const cacheHasAiSource = isAiGeneratedNewsSource(cache?.news_source || '');
  const cacheMatchesSharedNews = !currentNewsSnapshotAt || cache?.news_snapshot_at === currentNewsSnapshotAt;

  const personalBullets = [
    gapBullets[0],
    gapBullets[1],
    conservativeSummary,
    liabilityBullet
  ].filter(Boolean);

  if (
    !forceRefresh &&
    within24h &&
    cacheHasAiSource &&
    cacheMatchesSharedNews &&
    Array.isArray(cache?.personal_bullets) &&
    Array.isArray(cache?.news_bullets) &&
    cache.news_bullets.length === 5
  ) {
    return res.json({
      personal_bullets: cache.personal_bullets,
      news_bullets: ensureMetalsCoverage(cache.news_bullets, {
        includeMetals: hasPreciousMetalsExposure,
        reason: 'Recent metals-specific coverage is limited right now.'
      }),
      disclaimer: defaultDisclaimer,
      as_of: cacheDisplayAsOf,
      cached: true,
      news_source: cache.news_source,
      portfolio
    });
  }

  try {
    const curatedItems = filterMeaningfulCuratedNewsItems(sharedCuratedNewsState?.items || []);
    if (!curatedItems.length) {
      throw new Error('no_curated_news_available');
    }
    const result = await withTimeout(
      buildInsightNewsBullets({
        apiKey,
        items: curatedItems,
        country: countryCode,
        currency: preferredCurrency || 'INR',
        portfolio: newsPromptContext
      }),
      AI_BULLET_BUILD_TIMEOUT_MS,
      'insight_generation_timeout'
    );
    const payload = {
      personal_bullets: personalBullets,
      news_bullets: ensureMetalsCoverage(result.bullets, {
        includeMetals: hasPreciousMetalsExposure,
        reason: 'Recent metals-specific coverage is limited right now.'
      }),
      disclaimer: defaultDisclaimer,
      as_of: nowIso(),
      source_as_of: currentNewsSnapshotAt || nowIso(),
      news_snapshot_at: currentNewsSnapshotAt || '',
      news_source: String(result?.source || 'unknown')
    };
    if (sharedCuratedNewsState?.stale) payload.ingest_warning = 'shared_curated_news_stale';
    if (isAiGeneratedNewsSource(payload.news_source)) {
      setUserSetting(accountUserId, 'ai_insights_cache', JSON.stringify({
        ...payload,
        cached_at: nowIso()
      }));
    } else {
      deleteUserSetting(accountUserId, 'ai_insights_cache');
    }
    return res.json({
      ...payload,
      portfolio
    });
  } catch (e) {
    const errText = String(e?.message || e);
    if (
      within24h &&
      cacheHasAiSource &&
      cacheMatchesSharedNews &&
      Array.isArray(cache?.news_bullets) &&
      cache.news_bullets.length === 5
    ) {
      return res.status(200).json({
        personal_bullets: personalBullets,
        news_bullets: ensureMetalsCoverage(cache.news_bullets, {
          includeMetals: hasPreciousMetalsExposure,
          reason: 'Recent metals-specific coverage is limited right now.'
        }),
        disclaimer: defaultDisclaimer,
        as_of: cacheDisplayAsOf,
        cached: true,
        news_source: cache.news_source,
        warning: forceRefresh ? 'news_error_using_cached_after_refresh' : 'news_error_using_cached',
        error: errText,
        portfolio
      });
    }
    const isCuratedUnavailable = errText.includes('no_curated_news_available');
    return res.status(200).json({
      personal_bullets: personalBullets,
      news_bullets: unavailableNewsBullets(
        isCuratedUnavailable
          ? 'Live curated news is currently unavailable.'
          : errText.toLowerCase().includes('timeout')
            ? 'Live 48h news timed out.'
            : 'Live 48h news is currently unavailable.',
        {
          includeMetals: hasPreciousMetalsExposure,
          reason: isCuratedUnavailable
            ? 'Recent metals-specific coverage is currently unavailable.'
            : errText.toLowerCase().includes('timeout')
              ? 'Recent metals-specific coverage timed out.'
              : 'Recent metals-specific coverage is limited right now.'
        }
      ),
      disclaimer: defaultDisclaimer,
      as_of: nowIso(),
      news_source: 'unavailable',
      warning: isCuratedUnavailable ? 'curated_news_empty' : undefined,
      error: errText,
      portfolio
    });
  }
});

export default router;
