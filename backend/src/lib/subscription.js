import { db } from './db.js';

const BASIC_PLANS = new Set(['basic_monthly', 'basic_yearly']);
const PREMIUM_PLANS = new Set(['premium_monthly', 'premium_yearly', 'trial_premium']);

export function fetchSubscription(userId) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
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

export function ensureSubscriptionForUser(userId) {
  const existing = fetchSubscription(userId);
  if (existing) return existing;

  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  if (!user?.created_at) return null;

  const createdAt = new Date(user.created_at);
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(trialEnd.getDate() + 30);
  const now = new Date();
  const status = trialEnd.getTime() > now.getTime() ? 'active' : 'expired';

  const row = {
    user_id: userId,
    plan: 'trial_premium',
    status,
    started_at: createdAt.toISOString(),
    current_period_end: trialEnd.toISOString(),
    provider: 'trial',
    updated_at: now.toISOString()
  };

  db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, provider, updated_at)
    VALUES (@user_id, @plan, @status, @started_at, @current_period_end, @provider, @updated_at)
  `).run(row);

  db.prepare(`
    INSERT INTO payment_history (
      user_id, plan, amount_inr, period, provider, provider_txn_id,
      purchased_at, valid_until, status
    ) VALUES (?, 'trial_premium', 0, 'trial', 'trial', null, ?, ?, ?)
  `).run(userId, row.started_at, row.current_period_end, status === 'active' ? 'succeeded' : 'expired');

  return row;
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
