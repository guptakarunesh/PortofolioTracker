import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import { ensureSubscriptionForUser, isPremiumActive } from '../lib/subscription.js';

const router = Router();

function quarterStartIso(date = new Date()) {
  const d = new Date(date);
  const m = d.getMonth();
  const qStartMonth = m < 3 ? 0 : m < 6 ? 3 : m < 9 ? 6 : 9;
  return new Date(Date.UTC(d.getFullYear(), qStartMonth, 1, 0, 0, 0, 0)).toISOString().slice(0, 10);
}

function isQuarterStartToday(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth();
  const day = d.getDate();
  return day === 1 && (month === 0 || month === 3 || month === 6 || month === 9);
}

function currentTotals(userId) {
  const totalAssets = Number(
    db
      .prepare('SELECT COALESCE(SUM(current_value), 0) AS total FROM assets WHERE user_id = ?')
      .get(userId).total
  );
  const totalLiabilities = Number(
    db
      .prepare('SELECT COALESCE(SUM(outstanding_amount), 0) AS total FROM liabilities WHERE user_id = ?')
      .get(userId).total
  );
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities
  };
}

function monthStartIso(date = new Date()) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString().slice(0, 10);
}

function seedLastSixMonthsIfEmpty(userId) {
  const existingCount = Number(
    db
      .prepare('SELECT COUNT(*) AS c FROM performance_snapshots WHERE user_id = ?')
      .get(userId).c
  );
  if (existingCount > 0) return false;

  const totals = currentTotals(userId);
  const baseAssets = totals.totalAssets > 0 ? totals.totalAssets * 0.82 : 1250000;
  const baseLiabilities = totals.totalLiabilities > 0 ? totals.totalLiabilities * 1.12 : 360000;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO performance_snapshots (
      user_id, quarter_start, total_assets, total_liabilities, net_worth, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 5; i >= 0; i -= 1) {
    const monthDate = new Date();
    monthDate.setUTCDate(1);
    monthDate.setUTCHours(0, 0, 0, 0);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - i);

    const monthStart = monthStartIso(monthDate);
    const growthStep = 1 + (5 - i) * 0.03;
    const assetBump = 1 + ((5 - i) % 3) * 0.01;
    const liabilityDrop = 1 - ((5 - i) % 2) * 0.015;
    const totalAssets = Math.round(baseAssets * growthStep * assetBump);
    const totalLiabilities = Math.max(0, Math.round(baseLiabilities * (1 / growthStep) * liabilityDrop));
    const netWorth = totalAssets - totalLiabilities;

    insert.run(userId, monthStart, totalAssets, totalLiabilities, netWorth, nowIso());
  }

  return true;
}

function captureQuarterSnapshotIfDue(userId) {
  if (!isQuarterStartToday()) return null;
  const quarterStart = quarterStartIso(new Date());
  const existing = db
    .prepare('SELECT id FROM performance_snapshots WHERE user_id = ? AND quarter_start = ?')
    .get(userId, quarterStart);
  if (existing) return null;

  const totals = currentTotals(userId);
  db.prepare(`
    INSERT INTO performance_snapshots (
      user_id, quarter_start, total_assets, total_liabilities, net_worth, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, quarterStart, totals.totalAssets, totals.totalLiabilities, totals.netWorth, nowIso());

  return {
    quarterStart,
    ...totals
  };
}

router.get('/last-six', (req, res) => {
  const subscription = ensureSubscriptionForUser(req.accountUserId);
  if (!isPremiumActive(subscription)) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'performance' });
  }
  const seeded = seedLastSixMonthsIfEmpty(req.accountUserId);
  captureQuarterSnapshotIfDue(req.accountUserId);

  const rows = db
    .prepare(`
      SELECT quarter_start, total_assets, total_liabilities, net_worth, captured_at
      FROM performance_snapshots
      WHERE user_id = ?
      ORDER BY quarter_start DESC
      LIMIT 6
    `)
    .all(req.accountUserId)
    .map((row) => ({
      quarterStart: row.quarter_start,
      totalAssets: Number(row.total_assets || 0),
      totalLiabilities: Number(row.total_liabilities || 0),
      netWorth: Number(row.net_worth || 0),
      capturedAt: row.captured_at
    }))
    .reverse();

  return res.json({
    quarterCapturePolicy: 'auto-on-quarter-start-day',
    seededSampleData: seeded,
    snapshots: rows
  });
});

export default router;
