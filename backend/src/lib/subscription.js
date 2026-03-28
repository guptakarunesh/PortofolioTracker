import { db } from './db.js';

const BASIC_PLANS = new Set(['basic_monthly', 'basic_yearly']);
const PREMIUM_PLANS = new Set(['premium_monthly', 'premium_yearly', 'trial_premium']);

function addDaysIso(dateValue, days) {
  const next = new Date(dateValue);
  next.setDate(next.getDate() + Number(days || 0));
  return next.toISOString();
}

export function fetchSubscription(userId) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
}

export function hasConsumedTrialAccess(userId) {
  const row = db
    .prepare(`SELECT id FROM payment_history WHERE user_id = ? AND provider = 'trial' LIMIT 1`)
    .get(userId);
  return Boolean(row?.id);
}

export function upsertSubscriptionState({
  userId,
  plan = 'none',
  status = 'expired',
  startedAt = null,
  currentPeriodEnd = null,
  provider = null,
  updatedAt = new Date().toISOString()
}) {
  db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, provider, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan=excluded.plan,
      status=excluded.status,
      started_at=excluded.started_at,
      current_period_end=excluded.current_period_end,
      provider=excluded.provider,
      updated_at=excluded.updated_at
  `).run(userId, plan, status, startedAt, currentPeriodEnd, provider, updatedAt);

  return fetchSubscription(userId);
}

export function provisionTrialPremium({
  userId,
  startedAt = new Date().toISOString(),
  updatedAt = startedAt
}) {
  const currentPeriodEnd = addDaysIso(startedAt, 30);
  db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, provider, updated_at)
    VALUES (?, 'trial_premium', 'active', ?, ?, 'trial', ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan=excluded.plan,
      status=excluded.status,
      started_at=excluded.started_at,
      current_period_end=excluded.current_period_end,
      provider=excluded.provider,
      updated_at=excluded.updated_at
  `).run(userId, startedAt, currentPeriodEnd, updatedAt);

  db.prepare(`
    INSERT INTO payment_history (
      user_id, plan, amount_inr, period, provider, provider_txn_id,
      purchased_at, valid_until, status
    ) VALUES (?, 'trial_premium', 0, 'monthly', 'trial', null, ?, ?, 'succeeded')
  `).run(userId, startedAt, currentPeriodEnd);

  return fetchSubscription(userId);
}

export function ensureStandaloneSubscriptionAfterFamilyLeave(userId, nowIso = new Date().toISOString()) {
  const existing = fetchSubscription(userId);
  if (existing) return existing;
  if (hasConsumedTrialAccess(userId)) {
    return upsertSubscriptionState({
      userId,
      plan: 'none',
      status: 'expired',
      startedAt: null,
      currentPeriodEnd: null,
      provider: 'trial',
      updatedAt: nowIso
    });
  }
  return provisionTrialPremium({ userId, startedAt: nowIso, updatedAt: nowIso });
}

export function ensureSubscriptionForUser(userId) {
  const existing = fetchSubscription(userId);
  if (existing) return existing;

  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  if (!user?.created_at) return null;

  const createdAt = new Date(user.created_at).toISOString();
  const trialRow = provisionTrialPremium({
    userId,
    startedAt: createdAt,
    updatedAt: new Date().toISOString()
  });
  if (!trialRow) return null;

  if (new Date(trialRow.current_period_end || 0).getTime() <= Date.now()) {
    db.prepare(`
      UPDATE payment_history
      SET status = 'expired'
      WHERE user_id = ?
        AND provider = 'trial'
        AND plan = 'trial_premium'
        AND purchased_at = ?
        AND valid_until = ?
    `).run(userId, trialRow.started_at, trialRow.current_period_end);
    return upsertSubscriptionState({
      userId,
      plan: 'trial_premium',
      status: 'expired',
      startedAt: trialRow.started_at,
      currentPeriodEnd: trialRow.current_period_end,
      provider: 'trial',
      updatedAt: new Date().toISOString()
    });
  }

  return trialRow;
}

export function isSubscriptionActive(subscriptionRow, now = new Date()) {
  if (!subscriptionRow) return false;
  if (subscriptionRow.status !== 'active') return false;
  if (!subscriptionRow.current_period_end) return false;
  return new Date(subscriptionRow.current_period_end).getTime() > now.getTime();
}

export function isBasicActive(subscriptionRow, now = new Date()) {
  return isSubscriptionActive(subscriptionRow, now) && BASIC_PLANS.has(subscriptionRow.plan);
}

export function isPremiumActive(subscriptionRow, now = new Date()) {
  return isSubscriptionActive(subscriptionRow, now) && PREMIUM_PLANS.has(subscriptionRow.plan);
}

export function getSubscriptionLimits(subscriptionRow, now = new Date()) {
  if (isBasicActive(subscriptionRow, now)) {
    return { maxAssets: 10, maxLiabilities: 5 };
  }
  return { maxAssets: null, maxLiabilities: null };
}
