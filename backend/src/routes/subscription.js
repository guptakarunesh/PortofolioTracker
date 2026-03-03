import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  ensureSubscriptionForUser,
  fetchSubscription,
  getSubscriptionLimits,
  isSubscriptionActive
} from '../lib/subscription.js';
import { createCheckoutSession } from '../lib/payments.js';
import { createRazorpayOrder, verifyRazorpaySignature } from '../lib/razorpay.js';

const router = Router();

const PLAN_CONFIG = {
  basic_monthly: { amount: 99, periodDays: 30, period: 'monthly' },
  basic_yearly: { amount: 999, periodDays: 365, period: 'yearly' },
  premium_monthly: { amount: 169, periodDays: 30, period: 'monthly' },
  premium_yearly: { amount: 1599, periodDays: 365, period: 'yearly' }
};

function addDaysIso(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function resolveStartDate(subscriptionRow, nowIsoString) {
  if (subscriptionRow?.plan === 'trial_premium' && subscriptionRow.current_period_end) {
    const trialEnd = new Date(subscriptionRow.current_period_end);
    if (trialEnd.getTime() > new Date(nowIsoString).getTime()) {
      return subscriptionRow.current_period_end;
    }
  }
  return nowIsoString;
}

function applySubscription({ userId, plan, provider, providerTxnId, purchasedAt = nowIso() }) {
  const config = PLAN_CONFIG[plan];
  if (!config) {
    const error = new Error('invalid_plan');
    error.code = 'invalid_plan';
    throw error;
  }

  const subscription = fetchSubscription(userId);
  const startAt = resolveStartDate(subscription, purchasedAt);
  const validUntil = addDaysIso(startAt, config.periodDays);

  const upsert = db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, provider, updated_at)
    VALUES (?, ?, 'active', ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan=excluded.plan,
      status=excluded.status,
      started_at=excluded.started_at,
      current_period_end=excluded.current_period_end,
      provider=excluded.provider,
      updated_at=excluded.updated_at
  `);

  const insertHistory = db.prepare(`
    INSERT INTO payment_history (
      user_id, plan, amount_inr, period, provider, provider_txn_id,
      purchased_at, valid_until, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    upsert.run(userId, plan, startAt, validUntil, provider, purchasedAt);
    insertHistory.run(
      userId,
      plan,
      config.amount,
      config.period,
      provider,
      providerTxnId || null,
      purchasedAt,
      validUntil,
      'succeeded'
    );
  });

  tx();
  return { plan, current_period_end: validUntil, starts_at: startAt };
}

function requireOwner(req, res, next) {
  if (req.isAccountOwner === false) {
    return res.status(403).json({ error: 'forbidden', message: 'Account owner required' });
  }
  return next();
}

router.get('/status', (req, res) => {
  const userId = req.accountUserId || req.userId;
  const row = ensureSubscriptionForUser(userId);
  const trialRow = db
    .prepare(`SELECT purchased_at, valid_until FROM payment_history WHERE user_id = ? AND plan = 'trial_premium' ORDER BY purchased_at ASC LIMIT 1`)
    .get(userId);
  const now = new Date();
  const active = isSubscriptionActive(row, now);
  const limits = getSubscriptionLimits(row, now);

  res.json({
    plan: row?.plan || 'none',
    status: active ? 'active' : row?.status || 'expired',
    started_at: row?.started_at || null,
    current_period_end: row?.current_period_end || null,
    trial_start: trialRow?.purchased_at || null,
    trial_end: trialRow?.valid_until || null,
    limits,
    now: now.toISOString()
  });
});

router.get('/history', (req, res) => {
  const userId = req.accountUserId || req.userId;
  const rows = db
    .prepare('SELECT * FROM payment_history WHERE user_id = ? ORDER BY purchased_at DESC')
    .all(userId);
  res.json(rows);
});

router.post('/purchase', requireOwner, (req, res) => {
  const { plan } = req.body || {};
  try {
    const result = applySubscription({
      userId: req.accountUserId || req.userId,
      plan,
      provider: 'manual_stub',
      providerTxnId: null,
      purchasedAt: nowIso()
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e?.code === 'invalid_plan') {
      return res.status(400).json({ error: 'invalid_plan' });
    }
    res.status(500).json({ error: 'purchase_failed', message: e?.message || 'Purchase failed.' });
  }
});

router.post('/checkout', requireOwner, (req, res) => {
  const { plan, provider } = req.body || {};
  const config = PLAN_CONFIG[plan];
  if (!config) {
    return res.status(400).json({ error: 'invalid_plan' });
  }

  try {
    const session = createCheckoutSession({
      userId: req.accountUserId || req.userId,
      plan,
      amount: config.amount,
      period: config.period,
      provider
    });

    res.json({
      provider: session.provider,
      checkout_url: session.checkoutUrl,
      plan,
      amount: config.amount,
      period: config.period
    });
  } catch (e) {
    const status = e?.code === 'payment_not_configured' ? 500 : 500;
    res.status(status).json({ error: e?.code || 'checkout_failed', message: e?.message || 'Checkout failed.' });
  }
});

router.post('/razorpay/order', requireOwner, async (req, res) => {
  const { plan } = req.body || {};
  const config = PLAN_CONFIG[plan];
  if (!config) {
    return res.status(400).json({ error: 'invalid_plan' });
  }

  try {
    const order = await createRazorpayOrder({
      amountInr: config.amount,
      receipt: `user_${req.accountUserId || req.userId}_${Date.now()}`,
      notes: { user_id: String(req.accountUserId || req.userId), plan }
    });

    res.json({
      order_id: order.orderId,
      key_id: order.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      plan,
      period: config.period
    });
  } catch (e) {
    const code = e?.code || 'razorpay_order_failed';
    res.status(500).json({ error: code, message: e?.message || 'Failed to create Razorpay order.' });
  }
});

router.post('/razorpay/verify', requireOwner, (req, res) => {
  const { plan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!plan || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  let valid = false;
  try {
    valid = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });
  } catch (e) {
    return res.status(500).json({ error: e?.code || 'razorpay_verify_failed', message: e?.message || 'Verify failed.' });
  }

  if (!valid) {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  try {
    const result = applySubscription({
      userId: req.accountUserId || req.userId,
      plan,
      provider: 'razorpay',
      providerTxnId: razorpay_payment_id,
      purchasedAt: nowIso()
    });
    res.json({ ok: true, ...result, provider: 'razorpay' });
  } catch (e) {
    if (e?.code === 'invalid_plan') {
      return res.status(400).json({ error: 'invalid_plan' });
    }
    res.status(500).json({ error: 'purchase_failed', message: e?.message || 'Purchase failed.' });
  }
});

export default router;
