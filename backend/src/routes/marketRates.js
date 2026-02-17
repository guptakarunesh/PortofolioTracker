import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

const router = Router();
const TROY_OUNCE_TO_GRAM = 31.1035;
const LIVE_REFRESH_MS = 10_000;
const BULLIONS_BASE_URL = 'https://bullions.co.in/';
const EBULLION_GOLD_URL = 'https://www.ebullion.in/gold-prices';
const EBULLION_SILVER_URL = 'https://www.ebullion.in/silver-prices';
const GOOGLE_GOLD_URL = 'https://www.google.com/finance/quote/XAU-INR';
const GOOGLE_SILVER_URL = 'https://www.google.com/finance/quote/XAG-INR';
let liveRatesCache = {
  data: null,
  fetchedAt: 0
};

async function fetchMetalsLiveApi() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(
      'https://api.metals.live/v1/spot/metals?currencies=inr',
      {
        method: 'GET',
        headers: { 
          'User-Agent': 'portfolio-tracker/1.0',
          'Accept': 'application/json'
        },
        signal: controller.signal
      }
    );

    if (!res.ok) throw new Error(`Metals.live API failed (${res.status})`);

    const data = await res.json();
    const gold = data?.metals?.gold;
    const silver = data?.metals?.silver;

    if (!gold || !silver) throw new Error('Gold or silver data missing from response');

    return {
      source: 'metals-live',
      lastUpdated: new Date().toISOString(),
      gold: {
        symbol: 'XAUINR',
        perOunceInr: Number(gold.inr) || Number(gold.usd) * 83.5, // Fallback conversion
        perGramInr: (Number(gold.inr) / TROY_OUNCE_TO_GRAM) || (Number(gold.usd) * 83.5 / TROY_OUNCE_TO_GRAM),
        asOf: new Date().toISOString()
      },
      silver: {
        symbol: 'XAGINR',
        perOunceInr: Number(silver.inr) || Number(silver.usd) * 83.5,
        perGramInr: (Number(silver.inr) / TROY_OUNCE_TO_GRAM) || (Number(silver.usd) * 83.5 / TROY_OUNCE_TO_GRAM),
        asOf: new Date().toISOString()
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooQuote(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
      {
        method: 'GET',
        headers: { 'User-Agent': 'portfolio-tracker/1.0' },
        signal: controller.signal
      }
    );

    if (!res.ok) throw new Error(`Quote API failed (${res.status})`);

    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];
    const value = Number(quote?.regularMarketPrice);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid quote for ${symbol}`);

    return {
      symbol,
      perOunceInr: value,
      perGramInr: value / TROY_OUNCE_TO_GRAM,
      asOf: quote?.regularMarketTime
        ? new Date(Number(quote.regularMarketTime) * 1000).toISOString()
        : new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseEbullionPerGramInr(html, metal) {
  if (!html || typeof html !== 'string') return null;

  const normalized = html.replace(/\s+/g, ' ');
  const explicitPattern = /₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/|per)?\s*(gram|gm|g|10\s*g|10\s*gram|kg|kilogram)/gi;
  let match = explicitPattern.exec(normalized);
  while (match) {
    const rawValue = Number(String(match[1]).replace(/,/g, ''));
    const unit = String(match[2] || '').toLowerCase().replace(/\s+/g, '');
    let value = rawValue;
    if (unit === '10g' || unit === '10gram') value = rawValue / 10;
    if (unit === 'kg' || unit === 'kilogram') value = rawValue / 1000;

    if (Number.isFinite(value) && value > 0) {
      if (metal === 'gold' && value >= 1000 && value <= 20000) return value;
      if (metal === 'silver' && value >= 10 && value <= 500) return value;
    }
    match = explicitPattern.exec(normalized);
  }

  const jsonLikePattern = /"price"\s*:\s*"?(?:₹\s*)?([0-9][0-9,]*(?:\.[0-9]+)?)"?/gi;
  match = jsonLikePattern.exec(normalized);
  while (match) {
    const value = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      if (metal === 'gold' && value >= 1000 && value <= 20000) return value;
      if (metal === 'silver' && value >= 10 && value <= 500) return value;
    }
    match = jsonLikePattern.exec(normalized);
  }

  // Some pages list gold as INR per 10g or silver as INR per kg without rupee symbol.
  const tenGramPattern = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:inr)?\s*(?:\/|per)?\s*10\s*(?:g|gram)/gi;
  match = tenGramPattern.exec(normalized);
  while (match) {
    const perGram = Number(String(match[1]).replace(/,/g, '')) / 10;
    if (Number.isFinite(perGram) && perGram > 0) {
      if (metal === 'gold' && perGram >= 1000 && perGram <= 20000) return perGram;
      if (metal === 'silver' && perGram >= 10 && perGram <= 500) return perGram;
    }
    match = tenGramPattern.exec(normalized);
  }

  const kgPattern = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:inr)?\s*(?:\/|per)?\s*(?:kg|kilogram)/gi;
  match = kgPattern.exec(normalized);
  while (match) {
    const perGram = Number(String(match[1]).replace(/,/g, '')) / 1000;
    if (Number.isFinite(perGram) && perGram > 0) {
      if (metal === 'gold' && perGram >= 1000 && perGram <= 20000) return perGram;
      if (metal === 'silver' && perGram >= 10 && perGram <= 500) return perGram;
    }
    match = kgPattern.exec(normalized);
  }

  return null;
}

async function fetchEbullionPerGram(url, metal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    // Try with CORS proxy first
    const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
    
    let res;
    try {
      res = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      });
    } catch (proxyError) {
      // Fallback to direct request if proxy fails
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
    }

    if (!res.ok) throw new Error(`eBullion page request failed (${res.status})`);
    const html = await res.text();
    const perGramInr = parseEbullionPerGramInr(html, metal);
    if (!Number.isFinite(perGramInr) || perGramInr <= 0) {
      throw new Error(`eBullion ${metal} rate not found in page`);
    }
    return perGramInr;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEbullionRates() {
  const [goldPerGram, silverPerGram] = await Promise.all([
    fetchEbullionPerGram(EBULLION_GOLD_URL, 'gold'),
    fetchEbullionPerGram(EBULLION_SILVER_URL, 'silver')
  ]);

  return {
    source: 'ebullion',
    lastUpdated: new Date().toISOString(),
    gold: {
      symbol: 'XAUINR',
      perGramInr: goldPerGram,
      perOunceInr: goldPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    },
    silver: {
      symbol: 'XAGINR',
      perGramInr: silverPerGram,
      perOunceInr: silverPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    }
  };
}

function pickByMetalRange(value, metal) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (metal === 'gold' && value >= 1000 && value <= 20000) return value;
  if (metal === 'silver' && value >= 10 && value <= 500) return value;
  return null;
}

function parseBullionsPerGramInr(html, metal) {
  if (!html || typeof html !== 'string') return null;
  const normalized = html.replace(/\s+/g, ' ');
  const low = normalized.toLowerCase();

  // Try contextual extraction close to metal keyword.
  const metalWord = metal === 'gold' ? 'gold' : 'silver';
  const idx = low.indexOf(metalWord);
  if (idx >= 0) {
    const windowText = normalized.slice(Math.max(0, idx - 180), idx + 260);
    const m = windowText.match(/₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/|per)?\s*(gram|gm|g|10\s*g|10\s*gram|kg|kilogram)?/i);
    if (m?.[1]) {
      const raw = Number(String(m[1]).replace(/,/g, ''));
      const unit = String(m[2] || 'gram').toLowerCase().replace(/\s+/g, '');
      let perGram = raw;
      if (unit === '10g' || unit === '10gram') perGram = raw / 10;
      if (unit === 'kg' || unit === 'kilogram') perGram = raw / 1000;
      const picked = pickByMetalRange(perGram, metal);
      if (picked) return picked;
    }
  }

  // Generic INR+unit matches.
  const generic = /₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/|per)?\s*(gram|gm|g|10\s*g|10\s*gram|kg|kilogram)/gi;
  let match = generic.exec(normalized);
  while (match) {
    const raw = Number(String(match[1]).replace(/,/g, ''));
    const unit = String(match[2] || 'gram').toLowerCase().replace(/\s+/g, '');
    let perGram = raw;
    if (unit === '10g' || unit === '10gram') perGram = raw / 10;
    if (unit === 'kg' || unit === 'kilogram') perGram = raw / 1000;
    const picked = pickByMetalRange(perGram, metal);
    if (picked) return picked;
    match = generic.exec(normalized);
  }

  return null;
}

async function fetchBullionsRates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(BULLIONS_BASE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });
    
    if (!res.ok) throw new Error(`bullions.co.in request failed (${res.status})`);
    const html = await res.text();

    const goldPerGram = parseBullionsPerGramInr(html, 'gold');
    const silverPerGram = parseBullionsPerGramInr(html, 'silver');

    if (!goldPerGram || !silverPerGram) {
      throw new Error('bullions.co.in gold/silver rates not found in page');
    }

    return {
      source: 'bullions.co.in',
      lastUpdated: new Date().toISOString(),
      gold: {
        symbol: 'XAUINR',
        perGramInr: goldPerGram,
        perOunceInr: goldPerGram * TROY_OUNCE_TO_GRAM,
        asOf: new Date().toISOString()
      },
      silver: {
        symbol: 'XAGINR',
        perGramInr: silverPerGram,
        perOunceInr: silverPerGram * TROY_OUNCE_TO_GRAM,
        asOf: new Date().toISOString()
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseGooglePerOunceInr(html) {
  if (!html || typeof html !== 'string') return null;
  const normalized = html.replace(/\s+/g, ' ');

  // Pattern commonly rendered by Google Finance for quote values.
  let match = normalized.match(/data-last-price="([0-9.,]+)"/i);
  if (match?.[1]) {
    const value = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return value;
  }

  // Fallback: find an INR number near "XAU-INR" / "XAG-INR" quote content.
  match = normalized.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*INR/i);
  if (match?.[1]) {
    const value = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

async function fetchGooglePerOunce(url, metal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    // Try with CORS proxy first
    const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
    
    let res;
    try {
      res = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      });
    } catch (proxyError) {
      // Fallback to direct request if proxy fails
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
    }

    if (!res.ok) throw new Error(`Google ${metal} page request failed (${res.status})`);
    const html = await res.text();
    const perOunceInr = parseGooglePerOunceInr(html);
    if (!Number.isFinite(perOunceInr) || perOunceInr <= 0) {
      throw new Error(`Google ${metal} rate not found in page`);
    }
    return perOunceInr;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleRates() {
  const [goldPerOunceInr, silverPerOunceInr] = await Promise.all([
    fetchGooglePerOunce(GOOGLE_GOLD_URL, 'gold'),
    fetchGooglePerOunce(GOOGLE_SILVER_URL, 'silver')
  ]);

  return {
    source: 'google-finance-fallback',
    lastUpdated: new Date().toISOString(),
    gold: {
      symbol: 'XAUINR',
      perGramInr: goldPerOunceInr / TROY_OUNCE_TO_GRAM,
      perOunceInr: goldPerOunceInr,
      asOf: new Date().toISOString()
    },
    silver: {
      symbol: 'XAGINR',
      perGramInr: silverPerOunceInr / TROY_OUNCE_TO_GRAM,
      perOunceInr: silverPerOunceInr,
      asOf: new Date().toISOString()
    }
  };
}

function fallbackSettings(userId) {
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ? AND key IN (?, ?)')
    .all(userId, 'gold_24k_per_gram', 'silver_per_gram');

  const map = rows.reduce((acc, row) => {
    acc[row.key] = Number(row.value);
    return acc;
  }, {});

  const goldPerGram = Number.isFinite(map.gold_24k_per_gram) ? map.gold_24k_per_gram : 6500;
  const silverPerGram = Number.isFinite(map.silver_per_gram) ? map.silver_per_gram : 75;

  return {
    gold: {
      symbol: 'XAUINR=X',
      perGramInr: goldPerGram,
      perOunceInr: goldPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    },
    silver: {
      symbol: 'XAGINR=X',
      perGramInr: silverPerGram,
      perOunceInr: silverPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    },
    source: 'settings-fallback'
  };
}

function hardcodedFallback() {
  return {
    source: 'hardcoded-fallback',
    lastUpdated: new Date().toISOString(),
    gold: {
      symbol: 'XAUINR',
      perGramInr: 6500,
      perOunceInr: 6500 * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    },
    silver: {
      symbol: 'XAGINR',
      perGramInr: 75,
      perOunceInr: 75 * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    }
  };
}

router.get('/live', async (req, res) => {
  const nowMs = Date.now();
  if (liveRatesCache.data && nowMs - liveRatesCache.fetchedAt < LIVE_REFRESH_MS) {
    return res.json({
      ...liveRatesCache.data,
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: nowMs - liveRatesCache.fetchedAt
    });
  }

  const errors = [];

  try {
    const bullions = await fetchBullionsRates();
    const payload = {
      ...bullions,
      source: 'bullions.co.in-scrape-primary',
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`bullions: ${String(error?.message || error)}`);
  }

  try {
    const ebullion = await fetchEbullionRates();
    const payload = {
      ...ebullion,
      source: 'ebullion-scrape-fallback',
      warning: 'Primary scrape source unavailable, using eBullion fallback.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`ebullion: ${String(error?.message || error)}`);
  }

  try {
    const metalsLive = await fetchMetalsLiveApi();
    const payload = {
      ...metalsLive,
      warning: 'Scraped sources unavailable, using metals.live API fallback.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`metals.live: ${String(error?.message || error)}`);
  }

  try {
    const [gold, silver] = await Promise.all([fetchYahooQuote('XAUINR=X'), fetchYahooQuote('XAGINR=X')]);
    const payload = {
      source: 'yahoo-finance-fallback',
      lastUpdated: new Date().toISOString(),
      gold,
      silver,
      warning: 'Using Yahoo fallback because primary sources were unavailable.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`yahoo: ${String(error?.message || error)}`);
  }

  try {
    const google = await fetchGoogleRates();
    const payload = {
      ...google,
      warning: 'Using Google Finance fallback because primary sources were unavailable.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`google: ${String(error?.message || error)}`);
  }

  try {
    const fallback = fallbackSettings(req.userId);
    const payload = {
      ...fallback,
      lastUpdated: new Date().toISOString(),
      warning: 'Live providers unavailable, using saved Settings values.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  } catch (error) {
    errors.push(`settings: ${String(error?.message || error)}`);
    const hard = hardcodedFallback();
    const payload = {
      ...hard,
      warning: 'Live providers and settings unavailable, using hardcoded defaults.',
      error: errors.join(' | '),
      cacheTtlMs: LIVE_REFRESH_MS,
      cacheAgeMs: 0
    };
    liveRatesCache = {
      data: payload,
      fetchedAt: Date.now()
    };
    return res.json(payload);
  }
});

// Endpoint to manually update market rates (for users to set current rates)
router.post('/update', async (req, res) => {
  const { goldPerGramInr, silverPerGramInr } = req.body || {};

  if (!goldPerGramInr || !silverPerGramInr) {
    return res.status(400).json({
      error: 'Both goldPerGramInr and silverPerGramInr are required'
    });
  }

  const goldValue = Number(goldPerGramInr);
  const silverValue = Number(silverPerGramInr);

  if (!Number.isFinite(goldValue) || goldValue <= 0 || !Number.isFinite(silverValue) || silverValue <= 0) {
    return res.status(400).json({
      error: 'Values must be positive numbers'
    });
  }

  const stmt = db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `);

  const tx = db.transaction(() => {
    stmt.run(req.userId, 'gold_24k_per_gram', String(goldValue), nowIso());
    stmt.run(req.userId, 'silver_per_gram', String(silverValue), nowIso());
  });

  tx();

  return res.json({
    success: true,
    message: 'Market rates updated successfully',
    updated: {
      goldPerGramInr: goldValue,
      silverPerGramInr: silverValue,
      perOunceGoldInr: goldValue * TROY_OUNCE_TO_GRAM,
      perOunceSilverInr: silverValue * TROY_OUNCE_TO_GRAM,
      updatedAt: nowIso()
    }
  });
});

// Endpoint to get current rates for display purposes
router.get('/current', (req, res) => {
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ? AND key IN (?, ?)')
    .all(req.userId, 'gold_24k_per_gram', 'silver_per_gram');

  const map = rows.reduce((acc, row) => {
    acc[row.key] = Number(row.value);
    return acc;
  }, {});

  const goldPerGram = Number.isFinite(map.gold_24k_per_gram) ? map.gold_24k_per_gram : 6500;
  const silverPerGram = Number.isFinite(map.silver_per_gram) ? map.silver_per_gram : 75;

  return res.json({
    source: 'user-settings',
    gold: {
      symbol: 'XAUINR',
      perGramInr: goldPerGram,
      perOunceInr: goldPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    },
    silver: {
      symbol: 'XAGINR',
      perGramInr: silverPerGram,
      perOunceInr: silverPerGram * TROY_OUNCE_TO_GRAM,
      asOf: new Date().toISOString()
    }
  });
});

export default router;
