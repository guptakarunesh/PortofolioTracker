import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();

const CATEGORY_BUCKETS = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const CONSERVATIVE_RANGES = {
  'Banking & Deposits': [20, 40],
  'Market Investments': [15, 35],
  'Precious Metals': [5, 15],
  'Real Estate': [10, 20],
  'Retirement Funds': [5, 15],
  'Insurance (Cash Value)': [3, 10],
  'Other Assets': [0, 8]
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
  if (c.includes('banking') || c.includes('deposit') || c.includes('cash')) return 'Cash & Deposits';
  if (c.includes('market') || c.includes('equity') || c.includes('stock') || c.includes('mutual')) return 'Equities';
  if (c.includes('retirement') || c.includes('fund') || c.includes('ppf') || c.includes('nps')) return 'Retirement / Long-Term';
  if (c.includes('precious') || c.includes('gold') || c.includes('silver')) return 'Gold / Commodities';
  if (c.includes('real estate') || c.includes('property')) return 'Real Estate';
  if (c.includes('insurance')) return 'Insurance (Cash Value)';
  return 'Other';
}

function getConservativeGaps(assets) {
  const byCategoryRows = new Map();
  for (const asset of assets) {
    const category = asset.category || 'Other Assets';
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

async function callOpenAI({
  apiKey,
  model,
  country,
  currency,
  portfolio,
  useWebSearch = true,
  forceNewsUnavailable = false
}) {
  const controller = new AbortController();
  const webTimeoutMs = Math.max(20_000, Number(process.env.AI_WEB_TIMEOUT_MS || 60_000));
  const nonWebTimeoutMs = Math.max(10_000, Number(process.env.AI_NONWEB_TIMEOUT_MS || 20_000));
  const timeout = setTimeout(() => controller.abort(), useWebSearch ? webTimeoutMs : nonWebTimeoutMs);
  const payload = {
    model,
    // Keep reasoning minimal: this is a brief popup.
    reasoning: { effort: 'low' },
    tools: useWebSearch
      ? [
          {
            type: 'web_search',
            search_context_size: 'low',
            user_location: { type: 'approximate', country: country || 'IN' }
          }
        ]
      : [],
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              "Role: Personal Finance News Analyst for Indian Retail Investors.\n" +
              "You MUST:\n" +
              "- Never provide personalized investment advice or buy/sell instructions.\n" +
              "- Avoid recommending specific tickers, funds, or products.\n" +
              "- Use simple language and only specific catalysts (policy changes, rate moves, regulation, price shocks).\n" +
              "- Prioritize India news first, then global news affecting India.\n" +
              "- Focus on last 48 hours only.\n" +
              "- Output STRICT JSON (no markdown) with keys: bullets (array), disclaimer (string), as_of (ISO-8601 string).\n" +
              "- Output EXACTLY 5 bullets.\n" +
              "- Each bullet must be max 30-35 words.\n" +
              "- Bullet format: [Investment Type]: News Fact. Wallet Impact: Bullish/Bearish/Neutral - 5 to 8 word explanation. Source: Site Name - URL.\n" +
              "- No long explanations, opinions, or generic macro commentary.\n" +
              (forceNewsUnavailable
                ? "- Web news is unavailable. Still output exactly 5 bullets in the same format, and clearly say data is unavailable and user should verify trusted sources manually."
                : "")
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              `User market country: ${country || 'Unknown'}\n` +
              `Display currency: ${currency || 'INR'}\n\n` +
              `Coverage focus:\n` +
              `Stocks, ETFs, Mutual Funds, FDs, Savings/RDs, EPF/NPS, Insurance, Gold/Silver, Bonds, and Real Estate (land/flats).\n\n` +
              `Portfolio context (for risk framing only, not advice):\n` +
              JSON.stringify(portfolio) +
              `\n\nTask:\n` +
              `1) Provide exactly 5 bullets.\n` +
              `2) Keep each bullet within 30-35 words.\n` +
              `3) Keep it short and layman-friendly.`
          }
        ]
      }
    ]
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `OpenAI request failed (${response.status})`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    throw new Error('OpenAI response was not valid JSON');
  }

  const outputText =
    (typeof parsed?.output_text === 'string' && parsed.output_text) ||
    (Array.isArray(parsed?.output)
      ? parsed.output
          .filter((item) => item?.type === 'message')
          .flatMap((item) => item?.content || [])
          .filter((chunk) => chunk?.type === 'output_text')
          .map((chunk) => chunk?.text)
          .join('\n')
      : '');

  if (!outputText || typeof outputText !== 'string') {
    throw new Error('OpenAI response missing output text');
  }

  let out = null;
  try {
    out = JSON.parse(outputText);
  } catch (_e) {
    throw new Error('OpenAI output text was not valid JSON');
  }

  const bullets = Array.isArray(out?.bullets)
    ? out.bullets.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  if (bullets.length !== 5) {
    throw new Error('OpenAI output must include exactly 5 bullets');
  }
  const disclaimer = typeof out?.disclaimer === 'string' ? out.disclaimer : '';
  const asOf = typeof out?.as_of === 'string' ? out.as_of : nowIso();

  return { bullets, disclaimer, as_of: asOf };
}

function unavailableNewsBullets(reason = 'Live news fetch unavailable right now.') {
  return [
    `Stocks / ETFs / Mutual Funds: ${reason} Wallet Impact: Neutral - Verify index and fund updates manually. Source: NSE India - https://www.nseindia.com/`,
    `FDs / Savings / RDs: ${reason} Wallet Impact: Neutral - Check latest bank rate circulars. Source: RBI - https://www.rbi.org.in/`,
    `EPF / NPS / Insurance: ${reason} Wallet Impact: Neutral - Confirm contribution and policy rule updates. Source: EPFO - https://www.epfindia.gov.in/`,
    `Gold / Silver / Bonds: ${reason} Wallet Impact: Neutral - Track bullion and bond yield moves. Source: MCX - https://www.mcxindia.com/`,
    `Real Estate (Land / Flats): ${reason} Wallet Impact: Neutral - Verify local policy and demand signals. Source: CREDAI - https://credai.org/`
  ];
}

router.get('/insights', async (req, res) => {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const configuredModel = String(
    process.env.OPENAI_NEWS_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano'
  ).trim();
  const model = configuredModel === 'gpt-5' ? 'gpt-5-nano' : configuredModel;

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

  const conservativeGaps = getConservativeGaps(assets);
  const topGaps = conservativeGaps.slice(0, 2);
  const gapBullets = topGaps.map((gap) => {
    const action = gap.status === 'above' ? 'Reduce' : 'Increase';
    return `Top gap: ${gap.category} ${gap.currentPct.toFixed(1)}% vs ${gap.targetMin}-${gap.targetMax}% (conservative). ${action} focus.`;
  });
  if (!gapBullets.length) {
    gapBullets.push('No major gaps vs conservative ranges. Focus on maintaining balance.');
  }

  const conservativeSummary =
    'Conservative summary: allocation is tilted to a few buckets while Cash/Deposits, Market Investments, Gold, and Retirement Funds may be below conservative ranges.';

  const liabilityBullet = totalLiabilities > 0
    ? `Liabilities focus: total outstanding ${Math.round(totalLiabilities).toLocaleString()} across ${liabilities.length} loans. Prioritize reduction after the top allocation gaps.`
    : 'Liabilities focus: no outstanding liabilities detected.';

  const defaultDisclaimer =
    'These insights are AI-generated using publicly available country-level information and your portfolio data. ' +
    'They are for awareness only and can be incomplete or incorrect. Please research further and consult a financial advisor before making decisions.';

  const cacheRaw = getUserSetting(accountUserId, 'ai_insights_cache');
  let cache = null;
  try {
    cache = cacheRaw ? JSON.parse(cacheRaw) : null;
  } catch (_e) {
    cache = null;
  }
  const cachedAt = cache?.cached_at ? new Date(cache.cached_at).getTime() : 0;
  const within24h = cachedAt && Date.now() - cachedAt < 24 * 60 * 60 * 1000;

  const personalBullets = [
    gapBullets[0],
    gapBullets[1],
    conservativeSummary,
    liabilityBullet
  ].filter(Boolean);

  if (
    within24h &&
    Array.isArray(cache?.personal_bullets) &&
    Array.isArray(cache?.news_bullets) &&
    cache.news_bullets.length === 5
  ) {
    return res.json({
      personal_bullets: cache.personal_bullets,
      news_bullets: cache.news_bullets,
      disclaimer: defaultDisclaimer,
      as_of: cache?.as_of || nowIso(),
      cached: true,
      portfolio
    });
  }

  if (!apiKey) {
    return res.status(200).json({
      personal_bullets: personalBullets,
      news_bullets: unavailableNewsBullets(),
      disclaimer: defaultDisclaimer,
      as_of: nowIso(),
      portfolio
    });
  }

  try {
    const result = await callOpenAI({
      apiKey,
      model,
      country: countryCode,
      currency: preferredCurrency || 'INR',
      portfolio: newsPromptContext,
      useWebSearch: true
    });
    const payload = {
      personal_bullets: personalBullets,
      news_bullets: result.bullets,
      disclaimer: defaultDisclaimer,
      as_of: result.as_of || nowIso()
    };
    setUserSetting(accountUserId, 'ai_insights_cache', JSON.stringify({
      ...payload,
      cached_at: nowIso()
    }));
    return res.json({
      ...payload,
      portfolio
    });
  } catch (e) {
    const errText = String(e?.message || e);
    const timedOut = errText.toLowerCase().includes('aborted') || errText.toLowerCase().includes('timeout');
    try {
      const fallback = await callOpenAI({
        apiKey,
        model,
        country: countryCode,
        currency: preferredCurrency || 'INR',
        portfolio: newsPromptContext,
        useWebSearch: false,
        forceNewsUnavailable: true
      });
      const payload = {
        personal_bullets: personalBullets,
        news_bullets: fallback.bullets,
        disclaimer: defaultDisclaimer,
        as_of: fallback.as_of || nowIso()
      };
      setUserSetting(accountUserId, 'ai_insights_cache', JSON.stringify({
        ...payload,
        cached_at: nowIso()
      }));
      return res.status(200).json({
        ...payload,
        portfolio,
        warning: timedOut ? 'news_timeout_nonweb_fallback' : 'news_error_nonweb_fallback'
      });
    } catch (_fallbackErr) {
      if (Array.isArray(cache?.news_bullets) && cache.news_bullets.length === 5) {
        return res.status(200).json({
          personal_bullets: personalBullets,
          news_bullets: cache.news_bullets,
          disclaimer: defaultDisclaimer,
          as_of: cache?.as_of || nowIso(),
          cached: true,
          warning: timedOut ? 'news_timeout_using_cached' : 'news_error_using_cached',
          error: errText,
          portfolio
        });
      }
    }
    return res.status(200).json({
      personal_bullets: personalBullets,
      news_bullets: unavailableNewsBullets(
        timedOut ? 'Live 48h news timed out.' : 'Live 48h news is currently unavailable.'
      ),
      disclaimer: defaultDisclaimer,
      as_of: nowIso(),
      error: errText,
      portfolio
    });
  }
});

export default router;
