import { Router } from 'express';

const router = Router();
const FX_CACHE_TTL_MS = 60_000;
const DEFAULT_BASE = 'INR';
const DEFAULT_SYMBOLS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

let fxCache = {
  data: null,
  fetchedAt: 0,
  key: ''
};

function normalizeSymbols(input) {
  if (!input) return [...DEFAULT_SYMBOLS];
  const values = String(input)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const uniq = [...new Set(values)];
  if (!uniq.includes('INR')) uniq.unshift('INR');
  return uniq;
}

function pickRates(payload) {
  const candidate = payload?.rates || payload?.data?.rates || payload?.result?.rates;
  if (!candidate || typeof candidate !== 'object') return null;

  const out = {};
  Object.entries(candidate).forEach(([k, v]) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[String(k).toUpperCase()] = n;
  });
  return Object.keys(out).length ? out : null;
}

async function fetchJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'portfolio-tracker/1.0'
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFxrateCom(base) {
  const urls = [
    `https://www.fxrate.com/api/latest?base=${encodeURIComponent(base)}`,
    `https://fxrate.com/api/latest?base=${encodeURIComponent(base)}`,
    `https://www.fxrate.com/rates?base=${encodeURIComponent(base)}`
  ];

  const errors = [];
  for (const url of urls) {
    try {
      const payload = await fetchJson(url, 7000);
      const rates = pickRates(payload);
      if (!rates) throw new Error('No rates object found in payload');
      return {
        source: 'fxrate.com',
        rates,
        asOf: new Date().toISOString()
      };
    } catch (e) {
      errors.push(`${url}: ${String(e?.message || e)}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function fetchOpenErApi(base) {
  const payload = await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, 7000);
  const rates = pickRates(payload);
  if (!rates) throw new Error('open.er-api missing rates payload');
  return {
    source: 'open.er-api-fallback',
    rates,
    asOf: new Date().toISOString()
  };
}

router.get('/live', async (req, res) => {
  const base = String(req.query.base || DEFAULT_BASE).toUpperCase();
  const symbols = normalizeSymbols(req.query.symbols);
  const cacheKey = `${base}:${symbols.join(',')}`;
  const now = Date.now();

  if (fxCache.data && fxCache.key === cacheKey && now - fxCache.fetchedAt < FX_CACHE_TTL_MS) {
    return res.json({
      ...fxCache.data,
      cacheTtlMs: FX_CACHE_TTL_MS,
      cacheAgeMs: now - fxCache.fetchedAt
    });
  }

  const errors = [];
  let latest = null;

  try {
    latest = await fetchFxrateCom(base);
  } catch (e) {
    errors.push(`fxrate.com: ${String(e?.message || e)}`);
  }

  if (!latest) {
    try {
      latest = await fetchOpenErApi(base);
    } catch (e) {
      errors.push(`open.er-api: ${String(e?.message || e)}`);
    }
  }

  if (!latest) {
    if (fxCache.data && fxCache.key === cacheKey) {
      return res.json({
        ...fxCache.data,
        stale: true,
        warning: 'All live FX providers unavailable, returning last known rates.',
        error: errors.join(' | '),
        cacheTtlMs: FX_CACHE_TTL_MS,
        cacheAgeMs: now - fxCache.fetchedAt
      });
    }
    return res.status(503).json({
      error: 'Unable to fetch live FX rates.',
      details: errors
    });
  }

  const filtered = { [base]: 1 };
  symbols.forEach((symbol) => {
    if (symbol === base) {
      filtered[symbol] = 1;
      return;
    }
    const rate = Number(latest.rates[symbol]);
    if (Number.isFinite(rate) && rate > 0) filtered[symbol] = rate;
  });

  const payload = {
    base,
    rates: filtered,
    source: latest.source,
    asOf: latest.asOf,
    warning: errors.length ? 'Primary FX source unavailable, fallback used.' : undefined,
    error: errors.length ? errors.join(' | ') : undefined
  };

  fxCache = {
    data: payload,
    fetchedAt: Date.now(),
    key: cacheKey
  };

  return res.json({
    ...payload,
    cacheTtlMs: FX_CACHE_TTL_MS,
    cacheAgeMs: 0
  });
});

export default router;
