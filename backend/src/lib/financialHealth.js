const DEFAULT_WEIGHTS = {
  debt_to_asset: 0.5,
  liquidity: 0.3,
  asset_diversity: 0.2
};

const DEFAULT_WEIGHTS_NO_LIQUIDITY = {
  debt_to_asset: 0.7,
  liquidity: 0,
  asset_diversity: 0.3
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function bucketFromAssetCategory(category = '') {
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

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseTenureMonths(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (raw.includes('year')) return amount * 12;
  return amount;
}

function isLikelyShortTermLoanType(value = '') {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('credit card') || text.includes('card') || text.includes('overdraft') || text.includes('personal loan');
}

function monthsUntilEndDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const diffMs = dt.getTime() - Date.now();
  return diffMs / (30 * 24 * 60 * 60 * 1000);
}

function resolveShortTermLiabilityState(liabilities = []) {
  let inferableCount = 0;
  let shortTermCount = 0;
  let shortTermTotal = 0;

  for (const liability of Array.isArray(liabilities) ? liabilities : []) {
    const outstanding = safeNumber(liability?.outstanding_amount);
    const monthsFromTenure = parseTenureMonths(liability?.tenure_remaining);
    const monthsFromEndDate = monthsUntilEndDate(liability?.end_date);
    const likelyShortTermType = isLikelyShortTermLoanType(liability?.loan_type);
    const inferable = likelyShortTermType || monthsFromTenure != null || monthsFromEndDate != null;

    if (!inferable) continue;
    inferableCount += 1;

    const shortTerm =
      likelyShortTermType ||
      (monthsFromTenure != null && monthsFromTenure <= 12) ||
      (monthsFromEndDate != null && monthsFromEndDate <= 12);

    if (!shortTerm) continue;
    shortTermCount += 1;
    shortTermTotal += outstanding;
  }

  return {
    inferableCount,
    shortTermCount,
    shortTermTotal
  };
}

function buildBucketAllocation(assets = []) {
  const byBucket = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const bucket = bucketFromAssetCategory(asset?.category);
    byBucket.set(bucket, safeNumber(byBucket.get(bucket)) + safeNumber(asset?.current_value));
  }
  return [...byBucket.entries()]
    .map(([bucket, value]) => ({ bucket, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

function normalizeWeights(rawWeights = {}, liquidityAvailable = true) {
  const base = liquidityAvailable ? DEFAULT_WEIGHTS : DEFAULT_WEIGHTS_NO_LIQUIDITY;
  const merged = {
    debt_to_asset: safeNumber(rawWeights?.debt_to_asset) || base.debt_to_asset,
    liquidity: liquidityAvailable ? safeNumber(rawWeights?.liquidity) || base.liquidity : 0,
    asset_diversity: safeNumber(rawWeights?.asset_diversity) || base.asset_diversity
  };
  const sum = Object.values(merged).reduce((acc, value) => acc + safeNumber(value), 0) || 1;
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, safeNumber(value) / sum])
  );
}

function metricStatus(score = 0) {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'stable';
  if (score >= 40) return 'watch';
  return 'weak';
}

function scoreLabel(score = 0) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Stable';
  if (score >= 40) return 'Needs Attention';
  return 'At Risk';
}

function formatBucketForSentence(bucket = '') {
  const value = String(bucket || '').trim();
  if (!value) return 'a few asset buckets';
  if (value === 'Real Estate') return 'real estate';
  return value.toLowerCase();
}

function buildSummary({ score = 0, drivers = [], bucketAllocation = [], totalAssets = 0 } = {}) {
  const weakest = [...drivers].sort((a, b) => a.score - b.score)[0];
  const strongest = [...drivers].sort((a, b) => b.score - a.score)[0];
  const topBucket = bucketAllocation[0];
  const topBucketShare = totalAssets > 0 ? safeNumber(topBucket?.value) / totalAssets : 0;
  const concentratedBucket = topBucketShare >= 0.35 ? formatBucketForSentence(topBucket?.bucket) : 'a few asset buckets';

  if (score >= 80) {
    return 'Your overall financial position looks strong, with good support from debt control, liquidity, and diversification.';
  }
  if (score >= 60) {
    if (strongest?.key === 'liquidity' && (weakest?.key === 'debt_to_asset' || weakest?.key === 'asset_diversity')) {
      return `Your overall financial position looks stable, with strong liquidity, but debt levels and concentration in ${concentratedBucket} are still holding the score back.`;
    }
    if (weakest?.key === 'debt_to_asset') {
      return 'Your overall financial position looks stable, but liabilities are still a meaningful drag on the score.';
    }
    if (weakest?.key === 'asset_diversity') {
      return `Your overall financial position looks stable, but concentration in ${concentratedBucket} is still holding the score back.`;
    }
    return 'Your overall financial position looks stable, though one or two areas still need attention.';
  }
  if (score >= 40) {
    return weakest?.key === 'debt_to_asset'
      ? 'Liabilities are putting visible pressure on your balance sheet right now.'
      : 'Your score is being held back by one weak area in your current asset-liability mix.';
  }
  return 'Your current balance sheet shows elevated stress and needs attention before new risk-taking.';
}

function buildDriverDetails({
  debtRatio,
  debtScore,
  liquidAssets,
  shortTermLiabilities,
  liquidityRatio,
  liquidityScore,
  liquidityAvailable,
  diversityScore,
  diversityRaw,
  bucketAllocation,
  weights
}) {
  const drivers = [
    {
      key: 'debt_to_asset',
      label: 'Debt-to-Asset Ratio',
      score: round1(debtScore),
      weight: round1(weights.debt_to_asset * 100),
      value_label: `${round1(debtRatio * 100)}%`,
      detail:
        debtRatio <= 0.25
          ? 'Liabilities are low relative to total assets.'
          : debtRatio <= 0.6
            ? 'Liabilities are meaningful but still manageable relative to assets.'
            : 'Liabilities are high relative to total assets and are pulling the score down.',
      status: metricStatus(debtScore)
    },
    {
      key: 'liquidity',
      label: 'Liquidity Coverage',
      score: round1(liquidityScore),
      weight: round1(weights.liquidity * 100),
      value_label: liquidityAvailable ? (Number.isFinite(liquidityRatio) ? `${round1(liquidityRatio)}x` : 'Fully covered') : 'Not enough term data',
      detail: liquidityAvailable
        ? shortTermLiabilities > 0
          ? `Liquid assets of ${Math.round(liquidAssets).toLocaleString()} cover about ${round1(liquidityRatio)}x of identified short-term liabilities.`
          : 'No short-term liabilities were identified, so near-term liquidity looks comfortable.'
        : 'Short-term liability terms are not available, so this metric was down-weighted.',
      status: liquidityAvailable ? metricStatus(liquidityScore) : 'neutral',
      available: liquidityAvailable
    },
    {
      key: 'asset_diversity',
      label: 'Asset Diversity',
      score: round1(diversityScore),
      weight: round1(weights.asset_diversity * 100),
      value_label: `${round1(diversityRaw * 100)}/100`,
      detail:
        bucketAllocation.length <= 1
          ? 'Most assets sit in one bucket, so diversification is limited.'
          : `Assets are spread across ${bucketAllocation.length} bucket${bucketAllocation.length === 1 ? '' : 's'}, which helps reduce concentration risk.`,
      status: metricStatus(diversityScore)
    }
  ];
  return drivers;
}

function buildNextSteps({ drivers = [], bucketAllocation = [], shortTermLiabilities = 0, liquidityAvailable = true }) {
  const steps = [];
  const weakestDrivers = [...drivers]
    .filter((driver) => driver.key !== 'liquidity' || liquidityAvailable)
    .sort((a, b) => a.score - b.score);

  for (const driver of weakestDrivers) {
    if (driver.key === 'debt_to_asset') {
      steps.push('Prioritize reducing the highest-interest liability before making large new investments.');
    } else if (driver.key === 'liquidity') {
      if (shortTermLiabilities > 0) {
        steps.push('Build more cash or near-cash reserves to improve coverage of short-term liabilities.');
      }
    } else if (driver.key === 'asset_diversity') {
      const topBucket = bucketAllocation[0];
      if (topBucket?.bucket) {
        steps.push(`Avoid adding only to ${topBucket.bucket}; use future contributions to strengthen other buckets gradually.`);
      } else {
        steps.push('Spread future contributions across more than one asset bucket to reduce concentration risk.');
      }
    }
    if (steps.length >= 3) break;
  }

  if (!steps.length) {
    steps.push('Keep reviewing debt, liquidity, and diversification together before making large allocation changes.');
  }
  return steps.slice(0, 3);
}

export function calculateFinancialHealthScore({ assets = [], liabilities = [], weights = null, asOf = '' } = {}) {
  const assetList = Array.isArray(assets) ? assets : [];
  const liabilityList = Array.isArray(liabilities) ? liabilities : [];
  const totalAssets = assetList.reduce((acc, item) => acc + safeNumber(item?.current_value), 0);
  const totalLiabilities = liabilityList.reduce((acc, item) => acc + safeNumber(item?.outstanding_amount), 0);
  const netWorth = totalAssets - totalLiabilities;

  if (totalAssets <= 0) {
    return {
      as_of: asOf || new Date().toISOString(),
      score: 0,
      label: 'Not Enough Data',
      summary: 'Add at least one asset to calculate your financial health score.',
      drivers: [],
      next_steps: ['Start by adding your main assets and liabilities to get a useful score.'],
      totals: {
        total_assets: 0,
        total_liabilities: totalLiabilities,
        net_worth: netWorth,
        liquid_assets: 0,
        short_term_liabilities: 0
      },
      allocation: {
        by_bucket_value: {},
        by_bucket_pct: {},
        bucket_count: 0
      },
      effective_weights: normalizeWeights(weights || {}, false)
    };
  }

  const bucketAllocation = buildBucketAllocation(assetList);
  const byBucketValue = Object.fromEntries(bucketAllocation.map((row) => [row.bucket, round1(row.value)]));
  const byBucketPct = Object.fromEntries(
    bucketAllocation.map((row) => [row.bucket, round1((row.value / totalAssets) * 100)])
  );
  const liquidAssets = safeNumber(byBucketValue['Cash & Bank Accounts']);
  const shortTermState = resolveShortTermLiabilityState(liabilityList);
  const liquidityAvailable = liabilityList.length === 0 || shortTermState.inferableCount > 0;
  const shortTermLiabilities = shortTermState.shortTermTotal;
  const effectiveWeights = normalizeWeights(weights || {}, liquidityAvailable);

  const debtRatio = totalLiabilities / totalAssets;
  const debtScore = clamp(100 - debtRatio * 100, 0, 100);

  let liquidityRatio = 0;
  let liquidityScore = 0;
  if (liquidityAvailable) {
    liquidityRatio = shortTermLiabilities > 0 ? liquidAssets / shortTermLiabilities : Number.POSITIVE_INFINITY;
    liquidityScore = shortTermLiabilities > 0 ? clamp(liquidityRatio * 50, 0, 100) : 100;
  }

  const diversityRaw =
    1 -
    bucketAllocation.reduce((sum, row) => {
      const share = row.value / totalAssets;
      return sum + share * share;
    }, 0);
  const diversityScore = clamp(diversityRaw * 100, 0, 100);

  const drivers = buildDriverDetails({
    debtRatio,
    debtScore,
    liquidAssets,
    shortTermLiabilities,
    liquidityRatio,
    liquidityScore,
    liquidityAvailable,
    diversityScore,
    diversityRaw,
    bucketAllocation,
    weights: effectiveWeights
  });

  const score = round1(
    drivers.reduce((sum, driver) => {
      const weight = safeNumber(effectiveWeights[driver.key]);
      return sum + driver.score * weight;
    }, 0)
  );

  return {
    as_of: asOf || new Date().toISOString(),
    score,
    label: scoreLabel(score),
    summary: buildSummary({
      score,
      drivers,
      bucketAllocation,
      totalAssets
    }),
    drivers,
    next_steps: buildNextSteps({
      drivers,
      bucketAllocation,
      shortTermLiabilities,
      liquidityAvailable
    }),
    totals: {
      total_assets: round1(totalAssets),
      total_liabilities: round1(totalLiabilities),
      net_worth: round1(netWorth),
      liquid_assets: round1(liquidAssets),
      short_term_liabilities: round1(shortTermLiabilities)
    },
    allocation: {
      by_bucket_value: byBucketValue,
      by_bucket_pct: byBucketPct,
      bucket_count: bucketAllocation.length
    },
    effective_weights: Object.fromEntries(
      Object.entries(effectiveWeights).map(([key, value]) => [key, round1(value)])
    )
  };
}

export function buildFinancialHealthFallbackExplanation(snapshot = {}) {
  const drivers = Array.isArray(snapshot?.drivers) ? snapshot.drivers : [];
  const weakest = [...drivers].sort((a, b) => safeNumber(a.score) - safeNumber(b.score))[0];
  const strongest = [...drivers].sort((a, b) => safeNumber(b.score) - safeNumber(a.score))[0];
  const score = round1(snapshot?.score);
  const bucketPct = snapshot?.allocation?.by_bucket_pct || {};
  const dominantBucketEntry = Object.entries(bucketPct).sort((a, b) => safeNumber(b[1]) - safeNumber(a[1]))[0];
  const dominantBucket = formatBucketForSentence(dominantBucketEntry?.[0]);
  const dominantBucketShare = safeNumber(dominantBucketEntry?.[1]);

  const headline =
    score >= 80
      ? 'Your score is being supported by a healthy balance across the main financial factors.'
      : score >= 60
        ? 'Your score is supported by a few solid strengths, but one or two factors are still holding it back.'
        : 'Your score is being pulled down by one or two clear balance-sheet weaknesses.';

  const strengthSentence =
    strongest?.key === 'liquidity'
      ? 'Your score is supported by strong liquidity, which means your near-term obligations are well covered.'
      : strongest?.key === 'asset_diversity'
        ? 'Your score is supported by having assets spread across multiple buckets, which helps reduce concentration risk.'
        : strongest?.key === 'debt_to_asset'
          ? 'Your score is supported by liabilities staying at a manageable level relative to your assets.'
          : '';

  const limitingSentence =
    weakest?.key === 'debt_to_asset'
      ? dominantBucketShare >= 35
        ? `The main factor holding it back is that liabilities are still meaningful relative to your assets, while a large share of your wealth remains concentrated in ${dominantBucket}.`
        : 'The main factor holding it back is that liabilities are still meaningful relative to your assets.'
      : weakest?.key === 'asset_diversity'
        ? `The main factor holding it back is that a large share of your wealth is concentrated in ${dominantBucket}.`
        : weakest?.key === 'liquidity'
          ? 'The main factor holding it back is that liquid assets could cover short-term obligations more comfortably.'
          : '';

  const improvementSentence =
    weakest?.key === 'debt_to_asset'
      ? 'Reducing expensive debt and gradually improving diversification should strengthen this score over time.'
      : weakest?.key === 'asset_diversity'
        ? 'Broadening future contributions across more asset buckets should strengthen this score over time.'
        : weakest?.key === 'liquidity'
          ? 'Building more cash or near-cash reserves should strengthen this score over time.'
          : 'Keeping debt, liquidity, and diversification in balance should strengthen this score over time.';

  const body = [strengthSentence, limitingSentence, improvementSentence]
    .filter(Boolean)
    .join(' ');

  return {
    source: 'rule_based',
    headline,
    body: body || 'This score is based on your current assets, liabilities, liquidity, and diversification.',
    actions: []
  };
}

export function buildFinancialHealthExplainPrompt(snapshot = {}) {
  const drivers = Array.isArray(snapshot?.drivers) ? snapshot.drivers : [];
  return [
    'You are explaining a financial health score to a retail investor.',
    'Do not mention any private data, names, account numbers, or institutions.',
    'Keep the tone calm, practical, and concise.',
    'Return STRICT JSON with keys headline and body.',
    'Return ONLY valid JSON.',
    `Score: ${round1(snapshot?.score)}/100 (${snapshot?.label || 'Unknown'})`,
    `Summary: ${String(snapshot?.summary || '')}`,
    'Drivers:',
    ...drivers.map(
      (driver) =>
        `- ${driver.label}: score ${round1(driver.score)}/100, value ${driver.value_label}, detail: ${driver.detail}`
    ),
    'Rules:',
    '- headline must be one short sentence.',
    '- body must be 2 or 3 sentences only.',
    '- Do not repeat the same bullet-point details already shown in the score card.',
    '- Focus on what is helping, what is limiting the score, and what would improve it over time.'
  ].join('\n');
}
