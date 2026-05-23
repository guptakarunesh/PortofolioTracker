import { db, nowIso } from './db.js';
import { getAccountAccessState } from './accountLifecycle.js';

const DEFAULT_SNAPSHOT_TIME_ZONE = 'Asia/Kolkata';
const SNAPSHOT_LIMIT = 12;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localParts(date = new Date(), timeZone = DEFAULT_SNAPSHOT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const out = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
  });
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute)
  };
}

export function snapshotMonthForDate(date = new Date(), timeZone = DEFAULT_SNAPSHOT_TIME_ZONE) {
  const parts = localParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-01`;
}

export function isMonthlySnapshotDay(date = new Date(), timeZone = DEFAULT_SNAPSHOT_TIME_ZONE) {
  return localParts(date, timeZone).day === 1;
}

export function currentPerformanceTotals(userId) {
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

export function capturePerformanceSnapshotForUser({
  userId,
  snapshotMonth = snapshotMonthForDate(),
  capturedAt = nowIso()
}) {
  const existing = db
    .prepare('SELECT id FROM performance_snapshots WHERE user_id = ? AND quarter_start = ?')
    .get(userId, snapshotMonth);
  if (existing) {
    return { captured: false, reason: 'already_exists', snapshotMonth };
  }

  const totals = currentPerformanceTotals(userId);
  db.prepare(`
    INSERT INTO performance_snapshots (
      user_id, quarter_start, total_assets, total_liabilities, net_worth, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, snapshotMonth, totals.totalAssets, totals.totalLiabilities, totals.netWorth, capturedAt);

  return {
    captured: true,
    snapshotMonth,
    ...totals
  };
}

export function captureMonthlyPerformanceSnapshotsForAllUsers({
  now = new Date(),
  timeZone = DEFAULT_SNAPSHOT_TIME_ZONE,
  force = false
} = {}) {
  const checkedAt = nowIso();
  const snapshotMonth = snapshotMonthForDate(now, timeZone);
  if (!force && !isMonthlySnapshotDay(now, timeZone)) {
    return {
      ok: true,
      action: 'skipped_not_snapshot_day',
      checked_at: checkedAt,
      snapshot_month: snapshotMonth,
      time_zone: timeZone,
      users_seen: 0,
      captured: 0,
      skipped_existing: 0,
      skipped_disabled: 0
    };
  }

  const users = db.prepare('SELECT id FROM users ORDER BY id ASC').all();
  let captured = 0;
  let skippedExisting = 0;
  let skippedDisabled = 0;

  db.transaction(() => {
    users.forEach((user) => {
      if (getAccountAccessState(user.id).status === 'disabled') {
        skippedDisabled += 1;
        return;
      }
      const result = capturePerformanceSnapshotForUser({
        userId: user.id,
        snapshotMonth,
        capturedAt: checkedAt
      });
      if (result.captured) captured += 1;
      else if (result.reason === 'already_exists') skippedExisting += 1;
    });
  })();

  return {
    ok: true,
    action: 'monthly_snapshots_captured',
    checked_at: checkedAt,
    snapshot_month: snapshotMonth,
    time_zone: timeZone,
    users_seen: users.length,
    captured,
    skipped_existing: skippedExisting,
    skipped_disabled: skippedDisabled
  };
}

export function fetchPerformanceSnapshots(userId, { limit = SNAPSHOT_LIMIT } = {}) {
  const safeLimit = Math.max(1, Math.min(SNAPSHOT_LIMIT, Number(limit || SNAPSHOT_LIMIT)));
  return db
    .prepare(`
      SELECT quarter_start, total_assets, total_liabilities, net_worth, captured_at
      FROM performance_snapshots
      WHERE user_id = ?
      ORDER BY quarter_start DESC
      LIMIT ?
    `)
    .all(userId, safeLimit)
    .map((row) => ({
      snapshotMonth: row.quarter_start,
      quarterStart: row.quarter_start,
      totalAssets: Number(row.total_assets || 0),
      totalLiabilities: Number(row.total_liabilities || 0),
      netWorth: Number(row.net_worth || 0),
      capturedAt: row.captured_at
    }))
    .reverse();
}

export function formatSnapshotLabel(snapshotMonth = '') {
  const date = new Date(snapshotMonth);
  if (Number.isNaN(date.getTime())) return String(snapshotMonth || '');
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
