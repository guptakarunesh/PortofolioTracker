import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';

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
    seededSampleData: false,
    snapshots: rows
  });
});

export default router;
