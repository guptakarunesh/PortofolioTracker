import { Router } from 'express';
import { db } from '../lib/db.js';
import { bucketFromAssetCategory } from '../lib/financialHealth.js';

const router = Router();

const categories = [
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

const PROFILE_RANGES = {
  conservative: {
    'Cash & Bank Accounts': [20, 40],
    'Market Stocks & RSUs': [15, 30],
    'Retirement Funds': [10, 20],
    'Precious Metals': [5, 15],
    'Real Estate': [15, 35],
    'Vehicles': [0, 10],
    'Business Equity': [0, 8],
    'Jewelry & Watches': [0, 8],
    'Collectibles': [0, 5],
    'Insurance & Other': [3, 10]
  },
  moderate: {
    'Cash & Bank Accounts': [10, 25],
    'Market Stocks & RSUs': [25, 45],
    'Retirement Funds': [10, 20],
    'Real Estate': [10, 30],
    'Vehicles': [0, 8],
    'Business Equity': [0, 12],
    'Precious Metals': [4, 12],
    'Jewelry & Watches': [0, 6],
    'Collectibles': [0, 4],
    'Insurance & Other': [2, 8]
  },
  aggressive: {
    'Cash & Bank Accounts': [5, 15],
    'Market Stocks & RSUs': [35, 60],
    'Retirement Funds': [8, 18],
    'Real Estate': [8, 25],
    'Vehicles': [0, 6],
    'Business Equity': [0, 18],
    'Precious Metals': [3, 10],
    'Jewelry & Watches': [0, 5],
    'Collectibles': [0, 4],
    'Insurance & Other': [2, 8]
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
  const assetRows = db
    .prepare(`SELECT category, current_value FROM assets WHERE user_id = ?`)
    .all(userId);
  const byCategoryMap = new Map();
  for (const row of assetRows) {
    const normalizedCategory = bucketFromAssetCategory(row?.category || '');
    const nextValue = Number(row?.current_value || 0);
    byCategoryMap.set(normalizedCategory, Number(byCategoryMap.get(normalizedCategory) || 0) + nextValue);
  }
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
