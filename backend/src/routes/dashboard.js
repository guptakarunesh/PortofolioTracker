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

router.get('/summary', (req, res) => {
  const userId = req.userId;

  const byCategoryRows = db
    .prepare(`SELECT category, SUM(current_value) AS value FROM assets WHERE user_id = ? GROUP BY category`)
    .all(userId);

  const byCategoryMap = new Map(byCategoryRows.map((r) => [r.category, Number(r.value || 0)]));
  const allocation = categories.map((category) => ({
    category,
    currentValue: byCategoryMap.get(category) || 0
  }));

  const totalAssets = allocation.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = Number(
    db
      .prepare(`SELECT COALESCE(SUM(outstanding_amount), 0) AS total FROM liabilities WHERE user_id = ?`)
      .get(userId).total
  );
  const netWorth = totalAssets - totalLiabilities;

  const allocationWithPct = allocation.map((a) => ({
    ...a,
    pctOfTotal: totalAssets > 0 ? (a.currentValue / totalAssets) * 100 : 0
  }));

  res.json({
    lastUpdated: new Date().toISOString(),
    totalAssets,
    totalLiabilities,
    netWorth,
    allocation: allocationWithPct
  });
});

export default router;
