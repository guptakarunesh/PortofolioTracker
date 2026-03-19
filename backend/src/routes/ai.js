import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

const APPROVED_SOURCE_RULES = [
  { label: 'Reuters', patterns: [/reuters/i, /reuters\.com/i] },
  { label: 'The Economic Times', patterns: [/economic times/i, /economictimes\.com/i] },
  { label: 'Moneycontrol', patterns: [/moneycontrol/i, /moneycontrol\.com/i] },
  { label: 'Mint', patterns: [/\bmint\b/i, /livemint\.com/i] },
  { label: 'Business Standard', patterns: [/business standard/i, /business-standard\.com/i] },
  { label: 'RBI', patterns: [/\brbi\b/i, /rbi\.org\.in/i] },
  { label: 'SEBI', patterns: [/\bsebi\b/i, /sebi\.gov\.in/i] },
  { label: 'EPFO', patterns: [/\bepfo\b/i, /epfindia\.gov\.in/i] },
  { label: 'PFRDA', patterns: [/\bpfrda\b/i, /pfrda\.org\.in/i] },
  { label: 'PIB', patterns: [/\bpib\b/i, /pib\.gov\.in/i] }
];

const STALE_MONTH_MAP = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

const NEWS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectApprovedSource(bullet = '') {
  return APPROVED_SOURCE_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(String(bullet || '')))) || null;
}

function collectBulletDates(text = '') {
  const raw = String(text || '');
  const dates = [];
  const pushDate = (year, monthIndex, day) => {
    const dt = new Date(Date.UTC(Number(year), Number(monthIndex), Number(day), 12, 0, 0));
    if (!Number.isNaN(dt.getTime())) dates.push(dt);
  };

  for (const match of raw.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g)) {
    const monthIndex = STALE_MONTH_MAP[String(match[2] || '').toLowerCase()];
    if (monthIndex != null) pushDate(match[3], monthIndex, match[1]);
  }
  for (const match of raw.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2})[,\-\s]+(\d{4})\b/g)) {
    const monthIndex = STALE_MONTH_MAP[String(match[1] || '').toLowerCase()];
    if (monthIndex != null) pushDate(match[3], monthIndex, match[2]);
  }
  for (const match of raw.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    pushDate(match[3], Number(match[2]) - 1, match[1]);
  }

  return dates;
}

function isBulletFreshEnough(bullet = '', now = Date.now()) {
  const dates = collectBulletDates(bullet);
  if (!dates.length) return true;
  return dates.every((date) => now - date.getTime() <= NEWS_MAX_AGE_MS);
}

function sanitizeGeneratedBullets(rawBullets = [], fallbackReason = 'Live 48h news is currently unavailable.') {
  const fallbackBullets = unavailableNewsBullets(fallbackReason);
  const now = Date.now();

  return rawBullets.slice(0, 5).map((bullet, index) => {
    const text = String(bullet || '').trim();
    const source = detectApprovedSource(text);
    const usesLegacyTone = /\b(wallet impact|bullish|bearish|neutral)\b/i.test(text);
    const freshEnough = isBulletFreshEnough(text, now);
    const hasSourceSegment = /\bsource:\s*[^-]+-\s*https?:\/\//i.test(text);
    if (!text || !source || usesLegacyTone || !freshEnough || !hasSourceSegment) {
      return fallbackBullets[index] || fallbackBullets[0];
    }
    return text;
  });
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
              "- Use very simple language a normal middle-class saver or investor can understand quickly.\n" +
              "- Focus on helping the user decide what to review next, not what to buy or sell.\n" +
              "- Use only specific catalysts (policy changes, rate moves, regulation, price shocks).\n" +
              "- Prioritize India news first, then global news affecting India.\n" +
              "- Focus on last 48 hours only.\n" +
              "- Never mention or imply news older than 48 hours.\n" +
              "- If recent news cannot be verified, clearly say live 48h news is unavailable.\n" +
              "- Use only these preferred sources when citing news: Reuters, The Economic Times, Moneycontrol, Mint, Business Standard, RBI, SEBI, EPFO, PFRDA, PIB.\n" +
              "- Prefer RBI, SEBI, EPFO, PFRDA, and PIB for rule changes or official announcements.\n" +
              "- Prefer Reuters for fast macro, banking, metals, and market-moving updates.\n" +
              "- Prefer Economic Times, Moneycontrol, Mint, and Business Standard for retail-friendly India coverage.\n" +
              "- Output STRICT JSON (no markdown) with keys: bullets (array), disclaimer (string), as_of (ISO-8601 string).\n" +
              "- Output EXACTLY 5 bullets.\n" +
              "- Each bullet must be max 42 words.\n" +
              "- Bullet format: [Investment Type] What happened: short fact. Why it matters: short impact. What to consider: short practical review point. Source: Site Name - URL.\n" +
              "- Do not use the words Bullish, Bearish, or Neutral.\n" +
              "- No long explanations, opinions, jargon, or generic macro commentary.\n" +
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
              `2) Keep each bullet within 42 words.\n` +
              `3) Keep it short, practical, and layman-friendly.\n` +
              `4) Make every bullet useful for a person deciding what part of their portfolio to review next.`
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

  return {
    bullets: sanitizeGeneratedBullets(bullets),
    disclaimer,
    as_of: asOf
  };
}

function unavailableNewsBullets(reason = 'Live news fetch unavailable right now.') {
  return [
    `Stocks / ETFs / Mutual Funds. What happened: ${reason} Why it matters: stock and fund moves may be missed. What to consider: check index, sector, and fund updates manually. Source: NSE India - https://www.nseindia.com/`,
    `FDs / Savings / RDs. What happened: ${reason} Why it matters: deposit rates may have changed. What to consider: review latest bank and RBI rate circulars. Source: RBI - https://www.rbi.org.in/`,
    `EPF / NPS / Insurance. What happened: ${reason} Why it matters: rule or contribution changes may matter. What to consider: verify scheme and policy updates manually. Source: EPFO - https://www.epfindia.gov.in/`,
    `Gold / Silver / Bonds. What happened: ${reason} Why it matters: commodity and yield moves can shift returns. What to consider: check bullion prices and bond yield direction. Source: MCX - https://www.mcxindia.com/`,
    `Real Estate (Land / Flats). What happened: ${reason} Why it matters: policy and demand shifts can affect prices. What to consider: verify local market and rate updates. Source: CREDAI - https://credai.org/`
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
  let cache = null;
  try {
    cache = cacheRaw ? JSON.parse(cacheRaw) : null;
  } catch (_e) {
    cache = null;
  }
  const cachedAt = cache?.cached_at ? new Date(cache.cached_at).getTime() : 0;
  const within24h = cachedAt && Date.now() - cachedAt < AI_CACHE_TTL_MS;
  const cacheDisplayAsOf = cache?.cached_at || nowIso();

  if (forceRefresh) {
    deleteUserSetting(accountUserId, 'ai_insights_cache');
    cache = null;
  }

  const personalBullets = [
    gapBullets[0],
    gapBullets[1],
    conservativeSummary,
    liabilityBullet
  ].filter(Boolean);

  if (
    !forceRefresh &&
    within24h &&
    Array.isArray(cache?.personal_bullets) &&
    Array.isArray(cache?.news_bullets) &&
    cache.news_bullets.length === 5
  ) {
    return res.json({
      personal_bullets: cache.personal_bullets,
      news_bullets: cache.news_bullets,
      disclaimer: defaultDisclaimer,
      as_of: cacheDisplayAsOf,
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
      as_of: nowIso(),
      source_as_of: nowIso()
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
        as_of: nowIso(),
        source_as_of: nowIso()
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
      if (!forceRefresh && within24h && Array.isArray(cache?.news_bullets) && cache.news_bullets.length === 5) {
        return res.status(200).json({
          personal_bullets: personalBullets,
          news_bullets: cache.news_bullets,
          disclaimer: defaultDisclaimer,
          as_of: cacheDisplayAsOf,
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
