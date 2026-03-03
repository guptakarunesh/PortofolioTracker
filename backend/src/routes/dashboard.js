import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

const categories = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const PROFILE_RANGES = {
  conservative: {
    'Banking & Deposits': [20, 40],
    'Market Investments': [15, 35],
    'Precious Metals': [5, 15],
    'Real Estate': [15, 35],
    'Retirement Funds': [10, 20],
    'Insurance (Cash Value)': [5, 12],
    'Other Assets': [0, 8]
  },
  moderate: {
    'Banking & Deposits': [10, 25],
    'Market Investments': [30, 50],
    'Precious Metals': [5, 12],
    'Real Estate': [10, 30],
    'Retirement Funds': [10, 20],
    'Insurance (Cash Value)': [3, 10],
    'Other Assets': [0, 8]
  },
  aggressive: {
    'Banking & Deposits': [5, 15],
    'Market Investments': [45, 65],
    'Precious Metals': [3, 10],
    'Real Estate': [8, 25],
    'Retirement Funds': [8, 18],
    'Insurance (Cash Value)': [2, 8],
    'Other Assets': [0, 10]
  }
};

function parseRiskProfile(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'conservative' || normalized === 'aggressive' || normalized === 'moderate') {
    return normalized;
  }
  return 'moderate';
}

function getAllocationForUser(userId) {
  const byCategoryRows = db
    .prepare(`SELECT category, SUM(current_value) AS value FROM assets WHERE user_id = ? GROUP BY category`)
    .all(userId);
  const byCategoryMap = new Map(byCategoryRows.map((r) => [r.category, Number(r.value || 0)]));
  const allocation = categories.map((category) => ({
    category,
    currentValue: byCategoryMap.get(category) || 0
  }));
  const totalAssets = allocation.reduce((sum, a) => sum + a.currentValue, 0);
  const withPct = allocation.map((item) => ({
    ...item,
    pctOfTotal: totalAssets > 0 ? (item.currentValue / totalAssets) * 100 : 0
  }));
  return { allocation: withPct, totalAssets };
}

router.get('/summary', (req, res) => {
  const userId = req.accountUserId;
  const { allocation, totalAssets } = getAllocationForUser(userId);
  const totalLiabilities = Number(
    db
      .prepare(`SELECT COALESCE(SUM(outstanding_amount), 0) AS total FROM liabilities WHERE user_id = ?`)
      .get(userId).total
  );
  const netWorth = totalAssets - totalLiabilities;

  res.json({
    lastUpdated: new Date().toISOString(),
    totalAssets,
    totalLiabilities,
    netWorth,
    allocation
  });
});

router.get('/allocation-insight', (req, res) => {
  const userId = req.accountUserId;
  const { allocation, totalAssets } = getAllocationForUser(userId);

  if (totalAssets <= 0) {
    return res.json({
      profile: 'moderate',
      score: 0,
      summary: 'Add at least one asset to get a personalized allocation insight.',
      gaps: [],
      suggestions: ['Start by adding your current assets to compare against the benchmark.'],
      disclaimer:
        'Educational guidance only. This is not investment, tax, or legal advice.'
    });
  }

  const riskSetting = db
    .prepare(`SELECT value FROM user_settings WHERE user_id = ? AND key = 'risk_profile' LIMIT 1`)
    .get(userId);
  const profile = parseRiskProfile(riskSetting?.value);
  const ranges = PROFILE_RANGES[profile];

  const gaps = allocation.map((row) => {
    const range = ranges[row.category] || [0, 100];
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

  const outOfRange = gaps.filter((g) => g.status !== 'within').sort((a, b) => b.gapPct - a.gapPct);
  const totalGap = gaps.reduce((sum, g) => sum + Math.max(0, g.gapPct), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - totalGap * 2)));
  const topGaps = outOfRange.slice(0, 3);

  const suggestions = topGaps.map((g) =>
    g.status === 'below'
      ? `Consider increasing ${g.category} by about ${g.gapPct.toFixed(1)}% to align with your ${profile} range (${g.targetMin}-${g.targetMax}%).`
      : `Consider reducing ${g.category} by about ${g.gapPct.toFixed(1)}% to align with your ${profile} range (${g.targetMin}-${g.targetMax}%).`
  );

  if (!suggestions.length) {
    suggestions.push(`Your allocation is currently aligned with the ${profile} benchmark ranges.`);
  }

  return res.json({
    profile,
    score,
    summary:
      suggestions.length === 1 && outOfRange.length === 0
        ? 'Your portfolio looks balanced for your selected risk profile.'
        : `You have ${outOfRange.length} ${outOfRange.length === 1 ? 'category' : 'categories'} outside suggested ranges.`,
    gaps,
    suggestions,
    disclaimer:
      'Educational guidance only. This is not investment, tax, or legal advice.'
  });
});

export default router;
