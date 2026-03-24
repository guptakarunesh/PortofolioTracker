import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  ensureSubscriptionForUser,
  fetchSubscription,
  getSubscriptionLimits,
  isSubscriptionActive,
  upsertSubscriptionState
} from '../lib/subscription.js';
import { createCheckoutSession } from '../lib/payments.js';
import { createRazorpayOrder, verifyRazorpaySignature } from '../lib/razorpay.js';
import { createCashfreeOrder, verifyCashfreeOrderPaid } from '../lib/cashfree.js';
import {
  acknowledgeGooglePlaySubscription,
  buildGooglePlayManageUrl,
  cancelGooglePlaySubscription,
  getGooglePlayPublicConfig,
  resolveGooglePlayProductIdForPlan,
  resolvePlanForGooglePlayProduct,
  revokeGooglePlaySubscription,
  verifyGooglePlaySubscription
} from '../lib/googlePlayBilling.js';

const router = Router();

const PLAN_CONFIG = {
  basic_monthly: { amount: 99, periodDays: 30, period: 'monthly' },
  basic_yearly: { amount: 999, periodDays: 365, period: 'yearly' },
  premium_monthly: { amount: 189, periodDays: 30, period: 'monthly' },
  premium_yearly: { amount: 1999, periodDays: 365, period: 'yearly' }
};
const TIER_RANK = { basic: 1, premium: 2 };

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

function getTierFromPlan(plan = '') {
  const value = String(plan || '').toLowerCase();
  if (value.startsWith('premium')) return 'premium';
  if (value.startsWith('basic')) return 'basic';
  return '';
}

function evaluatePlanPurchase({ userId, targetPlan, purchasedAt = nowIso() }) {
  const targetConfig = PLAN_CONFIG[targetPlan];
  if (!targetConfig) {
    const error = new Error('invalid_plan');
    error.code = 'invalid_plan';
    throw error;
  }

  const now = new Date(purchasedAt);
  const current = fetchSubscription(userId);
  const currentActive = isSubscriptionActive(current, now);
  const currentConfig = PLAN_CONFIG[current?.plan];
  const targetTier = getTierFromPlan(targetPlan);
  const currentTier = getTierFromPlan(current?.plan);
  const targetRank = TIER_RANK[targetTier] || 0;
  const currentRank = TIER_RANK[currentTier] || 0;

  if (currentActive && currentRank > 0 && targetRank < currentRank) {
    const error = new Error('You are on a higher plan. Downgrading is not allowed.');
    error.code = 'downgrade_not_allowed';
    throw error;
  }

  if (currentActive && currentConfig && targetRank > currentRank && current?.current_period_end) {
    const periodEnd = new Date(current.current_period_end);
    const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
    const remainingDays = remainingMs / (24 * 60 * 60 * 1000);
    const currentDaily = currentConfig.amount / currentConfig.periodDays;
    const targetDaily = targetConfig.amount / targetConfig.periodDays;
    const prorataAmount = Math.max(0, Math.ceil((targetDaily - currentDaily) * remainingDays));
    return {
      plan: targetPlan,
      chargeAmount: prorataAmount,
      period: `${targetConfig.period}_prorata_upgrade`,
      startsAt: current?.started_at || purchasedAt,
      validUntil: current.current_period_end,
      mode: 'upgrade_prorata',
      fromPlan: current.plan || null
    };
  }

  const startAt = resolveStartDate(current, purchasedAt);
  return {
    plan: targetPlan,
    chargeAmount: targetConfig.amount,
    period: targetConfig.period,
    startsAt: startAt,
    validUntil: addDaysIso(startAt, targetConfig.periodDays),
    mode: 'standard',
    fromPlan: current?.plan || null
  };
}

function applySubscription({
  userId,
  plan,
  provider,
  providerTxnId,
  purchasedAt = nowIso(),
  amountOverride = null,
  periodOverride = null,
  startsAtOverride = null,
  validUntilOverride = null
}) {
  const config = PLAN_CONFIG[plan];
  if (!config) {
    const error = new Error('invalid_plan');
    error.code = 'invalid_plan';
    throw error;
  }

  const subscription = fetchSubscription(userId);
  const startAt = startsAtOverride || resolveStartDate(subscription, purchasedAt);
  const validUntil = validUntilOverride || addDaysIso(startAt, config.periodDays);
  const billedAmount = Number.isFinite(Number(amountOverride)) ? Number(amountOverride) : config.amount;
  const billedPeriod = String(periodOverride || config.period);

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
      billedAmount,
      billedPeriod,
      provider,
      providerTxnId || null,
      purchasedAt,
      validUntil,
      'succeeded'
    );
  });

  tx();
  return { plan, current_period_end: validUntil, starts_at: startAt, billed_amount_inr: billedAmount, billed_period: billedPeriod };
}

function requireOwner(req, res, next) {
  if (req.isAccountOwner === false) {
    return res.status(403).json({ error: 'forbidden', message: 'Account owner required' });
  }
  return next();
}

function buildCashfreeOrderId(userId) {
  const stamp = Date.now();
  return `nwm_${userId}_${stamp}`;
}

function publicHost(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const protocol =
    forwardedProto === 'https' || process.env.NODE_ENV === 'production'
      ? 'https'
      : req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

function toDateOnly(value) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : '';
}

function computeGstBreakup(amountInr) {
  const gross = Number(amountInr || 0);
  const taxable = Number((gross / 1.18).toFixed(2));
  const gstTotal = Number((gross - taxable).toFixed(2));
  const half = Number((gstTotal / 2).toFixed(2));
  return {
    gross,
    taxable_value: taxable,
    cgst_rate_percent: 9,
    cgst_amount: half,
    sgst_rate_percent: 9,
    sgst_amount: Number((gstTotal - half).toFixed(2)),
    gst_total: gstTotal
  };
}

function buildGstReceiptRow({ row, user }) {
  const supplier = {
    legal_name: process.env.RECEIPT_SUPPLIER_NAME || 'Networth Manager Technologies Pvt Ltd',
    gstin: process.env.RECEIPT_SUPPLIER_GSTIN || 'NA',
    address: process.env.RECEIPT_SUPPLIER_ADDRESS || 'India',
    state_code: process.env.RECEIPT_SUPPLIER_STATE_CODE || 'NA'
  };
  const invoiceDate = toDateOnly(row?.purchased_at || nowIso());
  const invoiceNo = `NWM-${invoiceDate.replace(/-/g, '')}-${row.id}`;
  const breakup = computeGstBreakup(row?.amount_inr || 0);
  return {
    invoice_number: invoiceNo,
    invoice_date: invoiceDate,
    supplier,
    customer: {
      user_id: row?.user_id,
      initials: String(user?.full_name || '').trim() || 'NA',
      mobile: String(user?.mobile || '').trim() || ''
    },
    line_item: {
      description: `Worthio Subscription - ${String(row?.plan || 'plan').replace(/_/g, ' ')}`,
      sac_code: process.env.RECEIPT_SAC_CODE || '998314',
      period: row?.period || '',
      plan: row?.plan || ''
    },
    taxes: breakup,
    total_amount_inr: breakup.gross,
    payment: {
      provider: row?.provider || '',
      transaction_id: row?.provider_txn_id || '',
      status: row?.status || '',
      purchased_at: row?.purchased_at || '',
      valid_until: row?.valid_until || ''
    }
  };
}
const upsertCheckoutSession = db.prepare(`
  INSERT INTO payment_checkout_sessions (
    user_id, order_id, plan, amount_inr, period, starts_at, valid_until, mode, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)
  ON CONFLICT(order_id) DO UPDATE SET
    plan=excluded.plan,
    amount_inr=excluded.amount_inr,
    period=excluded.period,
    starts_at=excluded.starts_at,
    valid_until=excluded.valid_until,
    mode=excluded.mode,
    status='created',
    updated_at=excluded.updated_at
`);
const getCheckoutSessionByOrder = db.prepare(
  `SELECT * FROM payment_checkout_sessions WHERE order_id = ? AND user_id = ? LIMIT 1`
);
const markCheckoutSessionVerified = db.prepare(
  `UPDATE payment_checkout_sessions SET status = 'verified', updated_at = ? WHERE order_id = ?`
);
const upsertStoreReceipt = db.prepare(`
  INSERT INTO store_subscription_receipts (
    user_id, provider, package_name, plan, product_id, purchase_token, linked_purchase_token, latest_order_id,
    subscription_state, local_status, acknowledgement_state, auto_renew_enabled, expiry_time, started_at,
    cancellation_reason, is_test_purchase, raw_payload, line_item_payload, last_verified_at, created_at, updated_at
  ) VALUES (?, 'google_play', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(purchase_token) DO UPDATE SET
    user_id=excluded.user_id,
    package_name=excluded.package_name,
    plan=excluded.plan,
    product_id=excluded.product_id,
    linked_purchase_token=excluded.linked_purchase_token,
    latest_order_id=excluded.latest_order_id,
    subscription_state=excluded.subscription_state,
    local_status=excluded.local_status,
    acknowledgement_state=excluded.acknowledgement_state,
    auto_renew_enabled=excluded.auto_renew_enabled,
    expiry_time=excluded.expiry_time,
    started_at=excluded.started_at,
    cancellation_reason=excluded.cancellation_reason,
    is_test_purchase=excluded.is_test_purchase,
    raw_payload=excluded.raw_payload,
    line_item_payload=excluded.line_item_payload,
    last_verified_at=excluded.last_verified_at,
    updated_at=excluded.updated_at
`);
const getLatestStoreReceiptForUser = db.prepare(
  `SELECT * FROM store_subscription_receipts WHERE user_id = ? AND provider = 'google_play' ORDER BY last_verified_at DESC, updated_at DESC LIMIT 1`
);
const getStoreReceiptByToken = db.prepare(
  `SELECT * FROM store_subscription_receipts WHERE purchase_token = ? OR linked_purchase_token = ? LIMIT 1`
);
const getUserStoreReceipts = db.prepare(
  `SELECT * FROM store_subscription_receipts WHERE user_id = ? AND provider = 'google_play' ORDER BY last_verified_at DESC, updated_at DESC`
);
const getPaymentHistoryByProviderTxn = db.prepare(
  `SELECT id FROM payment_history WHERE provider = ? AND provider_txn_id = ? LIMIT 1`
);
const insertPaymentHistory = db.prepare(`
  INSERT INTO payment_history (
    user_id, plan, amount_inr, period, provider, provider_txn_id, purchased_at, valid_until, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function parseGoogleAccountUserId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.startsWith('user_') ? raw.slice(5) : raw;
  const id = Number(normalized);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildGooglePlayStatusSummary(receipt) {
  if (!receipt) return null;
  return {
    provider: 'google_play',
    product_id: receipt.product_id || null,
    purchase_token: receipt.purchase_token || null,
    latest_order_id: receipt.latest_order_id || null,
    provider_state: receipt.subscription_state || null,
    auto_renew_enabled: receipt.auto_renew_enabled === null || receipt.auto_renew_enabled === undefined ? null : Boolean(receipt.auto_renew_enabled),
    cancellation_reason: receipt.cancellation_reason || null,
    manage_url: receipt.product_id ? buildGooglePlayManageUrl(receipt.product_id) : null,
    last_verified_at: receipt.last_verified_at || null
  };
}

function maybeRecordGooglePlayHistory({ userId, plan, verification, providerTxnId }) {
  const txnId = String(providerTxnId || '').trim();
  if (!txnId || !userId || !plan) return;
  const existing = getPaymentHistoryByProviderTxn.get('google_play', txnId);
  if (existing?.id) return;
  const config = PLAN_CONFIG[plan];
  insertPaymentHistory.run(
    userId,
    plan,
    config?.amount || 0,
    config?.period || 'subscription',
    'google_play',
    txnId,
    verification.startTime || nowIso(),
    verification.expiryTime || nowIso(),
    verification.localStatus || 'active'
  );
}

function persistGooglePlayVerification({ userId, plan, purchaseToken, verification }) {
  const verifiedAt = nowIso();
  upsertStoreReceipt.run(
    userId,
    verification.packageName || null,
    plan,
    verification.productId,
    purchaseToken,
    verification.linkedPurchaseToken || null,
    verification.latestOrderId || null,
    verification.subscriptionState || null,
    verification.localStatus || 'expired',
    verification.acknowledgementState || null,
    verification.autoRenewEnabled === null || verification.autoRenewEnabled === undefined ? null : verification.autoRenewEnabled ? 1 : 0,
    verification.expiryTime || null,
    verification.startTime || null,
    verification.cancellationReason || null,
    verification.isTestPurchase ? 1 : 0,
    JSON.stringify(verification.raw || {}),
    JSON.stringify(verification.lineItem || {}),
    verifiedAt,
    verifiedAt,
    verifiedAt
  );

  const current = fetchSubscription(userId);
  const shouldReplaceEntitlement =
    verification.localStatus === 'active' ||
    verification.localStatus === 'pending' ||
    verification.localStatus === 'on_hold' ||
    verification.localStatus === 'paused' ||
    current?.provider === 'google_play' ||
    current?.plan === plan;

  if (shouldReplaceEntitlement) {
    upsertSubscriptionState({
      userId,
      plan: verification.localStatus === 'expired' ? plan : plan,
      status: verification.localStatus || 'expired',
      startedAt: verification.startTime || current?.started_at || verifiedAt,
      currentPeriodEnd: verification.expiryTime || current?.current_period_end || null,
      provider: 'google_play',
      updatedAt: verifiedAt
    });
  }

  if (verification.latestOrderId && ['active', 'pending', 'on_hold', 'paused'].includes(String(verification.localStatus || ''))) {
    maybeRecordGooglePlayHistory({
      userId,
      plan,
      verification,
      providerTxnId: verification.latestOrderId
    });
  }

  return getLatestStoreReceiptForUser.get(userId);
}

async function verifyAndPersistGooglePlayPurchase({ userId, plan, productId, purchaseToken }) {
  const verification = await verifyGooglePlaySubscription({ productId, purchaseToken });
  const mappedPlan = resolvePlanForGooglePlayProduct(verification.productId);
  const effectivePlan = mappedPlan || plan;
  if (!effectivePlan) {
    const err = new Error('google_play_product_not_mapped');
    err.code = 'google_play_product_not_mapped';
    throw err;
  }
  if (plan && effectivePlan !== plan) {
    const err = new Error('google_play_plan_mismatch');
    err.code = 'google_play_plan_mismatch';
    throw err;
  }
  const boundUserId = parseGoogleAccountUserId(verification.obfuscatedExternalAccountId);
  if (boundUserId && Number(boundUserId) !== Number(userId)) {
    const err = new Error('google_play_account_mismatch');
    err.code = 'google_play_account_mismatch';
    throw err;
  }

  let acknowledgement = null;
  if (!verification.acknowledged && ['active', 'pending', 'on_hold', 'paused'].includes(String(verification.localStatus || ''))) {
    try {
      acknowledgement = await acknowledgeGooglePlaySubscription({
        purchaseToken,
        productId: verification.productId
      });
      verification.acknowledged = true;
      verification.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    } catch (error) {
      acknowledgement = { acknowledged: false, error: error?.message || 'ack_failed' };
    }
  }

  const receipt = persistGooglePlayVerification({
    userId,
    plan: effectivePlan,
    purchaseToken,
    verification
  });

  return {
    plan: effectivePlan,
    purchase: verification,
    acknowledgement,
    receipt,
    manage_url: buildGooglePlayManageUrl(verification.productId)
  };
}

function decodeGooglePlayNotification(reqBody) {
  const data = String(reqBody?.message?.data || '').trim();
  if (!data) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

router.get('/status', (req, res) => {
  const userId = req.accountUserId || req.userId;
  const row = ensureSubscriptionForUser(userId);
  const storeReceipt = getLatestStoreReceiptForUser.get(userId);
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
    provider: row?.provider || null,
    provider_details: buildGooglePlayStatusSummary(storeReceipt),
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

router.get('/history/:id/receipt', (req, res) => {
  const userId = req.accountUserId || req.userId;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid_receipt_id' });
  }
  const row = db
    .prepare('SELECT * FROM payment_history WHERE id = ? AND user_id = ? LIMIT 1')
    .get(id, userId);
  if (!row) {
    return res.status(404).json({ error: 'receipt_not_found' });
  }
  const user = db.prepare('SELECT full_name, mobile FROM users WHERE id = ? LIMIT 1').get(userId);
  return res.json(buildGstReceiptRow({ row, user }));
});

router.get('/google-play/config', requireOwner, (_req, res) => {
  return res.json(getGooglePlayPublicConfig());
});

router.post('/google-play/verify', requireOwner, async (req, res) => {
  const userId = req.accountUserId || req.userId;
  const { plan, product_id: productIdRaw, purchase_token: purchaseToken } = req.body || {};
  const productId = String(productIdRaw || resolveGooglePlayProductIdForPlan(plan) || '').trim();
  if (!purchaseToken || !productId) {
    return res.status(400).json({ error: 'google_play_missing_fields', message: 'product_id and purchase_token are required.' });
  }

  try {
    const result = await verifyAndPersistGooglePlayPurchase({
      userId,
      plan: String(plan || '').trim() || null,
      productId,
      purchaseToken: String(purchaseToken).trim()
    });
    return res.json({
      ok: true,
      provider: 'google_play',
      plan: result.plan,
      status: result.purchase.localStatus,
      provider_state: result.purchase.subscriptionState,
      acknowledged: result.purchase.acknowledged,
      auto_renew_enabled: result.purchase.autoRenewEnabled,
      current_period_end: result.purchase.expiryTime || null,
      latest_order_id: result.purchase.latestOrderId || null,
      manage_url: result.manage_url,
      cancellation_reason: result.purchase.cancellationReason || null,
      is_test_purchase: result.purchase.isTestPurchase
    });
  } catch (e) {
    const code = String(e?.code || '');
    if (['google_play_missing_fields', 'google_play_product_not_mapped'].includes(code)) {
      return res.status(400).json({ error: code, message: e.message });
    }
    if (['google_play_plan_mismatch', 'google_play_account_mismatch'].includes(code)) {
      return res.status(409).json({ error: code, message: e.message });
    }
    if (code === 'google_play_not_configured') {
      return res.status(503).json({ error: code, message: 'Google Play Billing is not configured on the server.' });
    }
    return res.status(500).json({ error: code || 'google_play_verify_failed', message: e?.message || 'Google Play verification failed.' });
  }
});

router.post('/google-play/sync', requireOwner, async (req, res) => {
  const userId = req.accountUserId || req.userId;
  const purchaseToken = String(req.body?.purchase_token || '').trim();
  const existingRows = purchaseToken ? [getStoreReceiptByToken.get(purchaseToken, purchaseToken)].filter(Boolean) : getUserStoreReceipts.all(userId);

  if (!existingRows.length) {
    return res.json({ ok: true, synced: [] });
  }

  const synced = [];
  for (const row of existingRows) {
    try {
      const result = await verifyAndPersistGooglePlayPurchase({
        userId,
        plan: row.plan || null,
        productId: row.product_id,
        purchaseToken: row.purchase_token
      });
      synced.push({
        purchase_token: row.purchase_token,
        plan: result.plan,
        status: result.purchase.localStatus,
        provider_state: result.purchase.subscriptionState,
        current_period_end: result.purchase.expiryTime || null,
        auto_renew_enabled: result.purchase.autoRenewEnabled
      });
    } catch (error) {
      synced.push({
        purchase_token: row.purchase_token,
        error: error?.code || 'google_play_sync_failed',
        message: error?.message || 'Failed to sync purchase.'
      });
    }
  }

  return res.json({ ok: true, synced });
});

router.post('/google-play/cancel', requireOwner, async (req, res) => {
  const userId = req.accountUserId || req.userId;
  const receipt = getLatestStoreReceiptForUser.get(userId);
  if (!receipt?.purchase_token || !receipt?.product_id) {
    return res.status(404).json({ error: 'google_play_subscription_not_found' });
  }

  try {
    await cancelGooglePlaySubscription({ purchaseToken: receipt.purchase_token });
    const result = await verifyAndPersistGooglePlayPurchase({
      userId,
      plan: receipt.plan || null,
      productId: receipt.product_id,
      purchaseToken: receipt.purchase_token
    });
    return res.json({
      ok: true,
      status: result.purchase.localStatus,
      provider_state: result.purchase.subscriptionState,
      current_period_end: result.purchase.expiryTime || null,
      manage_url: result.manage_url
    });
  } catch (e) {
    return res.status(500).json({ error: e?.code || 'google_play_cancel_failed', message: e?.message || 'Could not cancel Google Play subscription.' });
  }
});

router.post('/google-play/revoke', requireOwner, async (req, res) => {
  const userId = req.accountUserId || req.userId;
  const receipt = getLatestStoreReceiptForUser.get(userId);
  if (!receipt?.purchase_token || !receipt?.product_id) {
    return res.status(404).json({ error: 'google_play_subscription_not_found' });
  }

  try {
    await revokeGooglePlaySubscription({ purchaseToken: receipt.purchase_token });
    const result = await verifyAndPersistGooglePlayPurchase({
      userId,
      plan: receipt.plan || null,
      productId: receipt.product_id,
      purchaseToken: receipt.purchase_token
    });
    return res.json({
      ok: true,
      status: result.purchase.localStatus,
      provider_state: result.purchase.subscriptionState,
      current_period_end: result.purchase.expiryTime || null
    });
  } catch (e) {
    return res.status(500).json({ error: e?.code || 'google_play_revoke_failed', message: e?.message || 'Could not revoke Google Play subscription.' });
  }
});

router.post('/google-play/notifications', async (req, res) => {
  const expectedToken = String(process.env.GOOGLE_PLAY_RTDN_TOKEN || '').trim();
  if (!expectedToken || String(req.headers['x-google-play-rtdn-token'] || '').trim() !== expectedToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const notification = decodeGooglePlayNotification(req.body);
    const subscriptionNotice = notification?.subscriptionNotification || null;
    const purchaseToken = String(subscriptionNotice?.purchaseToken || '').trim();
    const productId = String(subscriptionNotice?.subscriptionId || '').trim();
    if (!purchaseToken || !productId) {
      return res.json({ ok: true, ignored: true });
    }

    const existing = getStoreReceiptByToken.get(purchaseToken, purchaseToken);
    const verified = await verifyGooglePlaySubscription({ purchaseToken, productId });
    const userId = existing?.user_id || parseGoogleAccountUserId(verified.obfuscatedExternalAccountId);
    const plan = existing?.plan || resolvePlanForGooglePlayProduct(verified.productId);

    if (!userId || !plan) {
      return res.json({ ok: true, ignored: true, reason: 'user_or_plan_unresolved' });
    }

    persistGooglePlayVerification({ userId, plan, purchaseToken, verification: verified });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.code || 'google_play_notification_failed', message: e?.message || 'Could not process Google Play notification.' });
  }
});

router.post('/purchase', requireOwner, (req, res) => {
  const { plan } = req.body || {};
  try {
    const terms = evaluatePlanPurchase({
      userId: req.accountUserId || req.userId,
      targetPlan: plan,
      purchasedAt: nowIso()
    });
    const result = applySubscription({
      userId: req.accountUserId || req.userId,
      plan,
      provider: 'manual_stub',
      providerTxnId: null,
      purchasedAt: nowIso(),
      amountOverride: terms.chargeAmount,
      periodOverride: terms.period,
      startsAtOverride: terms.startsAt,
      validUntilOverride: terms.validUntil
    });
    res.json({ ok: true, ...result, mode: terms.mode, from_plan: terms.fromPlan });
  } catch (e) {
    if (e?.code === 'invalid_plan' || e?.code === 'downgrade_not_allowed') {
      return res.status(409).json({ error: e.code, message: e.message });
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

router.post('/cashfree/order', requireOwner, async (req, res) => {
  const { plan, app_return_url: appReturnUrlRaw } = req.body || {};
  const config = PLAN_CONFIG[plan];
  if (!config) {
    return res.status(400).json({ error: 'invalid_plan' });
  }

  const userId = req.accountUserId || req.userId;
  const orderId = buildCashfreeOrderId(userId);
  const host = publicHost(req);
  const fallbackAppReturnUrl = process.env.CASHFREE_APP_RETURN_URL || 'worthio://subscription-return';
  let returnUrl = process.env.CASHFREE_RETURN_URL || `${host}/cashfree/return?order_id={order_id}`;
  const appReturnUrl = String(appReturnUrlRaw || '').trim();
  const effectiveAppReturnUrl = appReturnUrl || fallbackAppReturnUrl;
  if (!process.env.CASHFREE_RETURN_URL) {
    returnUrl =
      `${host}/cashfree/return` +
      `?app_return_url=${encodeURIComponent(effectiveAppReturnUrl)}` +
      `&plan=${encodeURIComponent(String(plan))}` +
      `&order_id={order_id}`;
  }
  const notifyUrl = process.env.CASHFREE_NOTIFY_URL || '';
  try {
    const quoted = evaluatePlanPurchase({
      userId,
      targetPlan: plan,
      purchasedAt: nowIso()
    });

    const order = await createCashfreeOrder({
      orderId,
      amountInr: quoted.chargeAmount,
      customer: {
        id: `user_${userId}`,
        name: req.user?.full_name || `User ${userId}`,
        phone: req.user?.mobile || '',
        email: req.user?.email || ''
      },
      returnUrl,
      notifyUrl,
      orderNote: `Subscription ${plan}`
    });
    const ts = nowIso();
    upsertCheckoutSession.run(
      userId,
      String(order.orderId || orderId),
      plan,
      quoted.chargeAmount,
      quoted.period,
      quoted.startsAt,
      quoted.validUntil,
      quoted.mode,
      ts,
      ts
    );
    const sessionId = String(order.paymentSessionId || '').trim();
    const fallbackCheckoutUrl = sessionId ? `${host}/cashfree/checkout-page?session_id=${encodeURIComponent(sessionId)}` : null;

    return res.json({
      provider: 'cashfree',
      order_id: order.orderId,
      payment_session_id: sessionId || null,
      checkout_url: fallbackCheckoutUrl || order.checkoutUrl || null,
      plan,
      amount: quoted.chargeAmount,
      period: quoted.period,
      mode: quoted.mode,
      from_plan: quoted.fromPlan
    });
  } catch (e) {
    if (e?.code === 'invalid_plan' || e?.code === 'downgrade_not_allowed') {
      return res.status(409).json({ error: e.code, message: e.message });
    }
    const status = e?.code === 'cashfree_not_configured' ? 500 : e?.status || 500;
    return res.status(status).json({
      error: e?.code || 'cashfree_order_failed',
      message: e?.message || 'Failed to create Cashfree order.'
    });
  }
});

router.post('/cashfree/verify', requireOwner, async (req, res) => {
  const { plan, order_id: orderId } = req.body || {};
  if (!plan || !orderId) {
    return res.status(400).json({ error: 'missing_fields', message: 'plan and order_id are required.' });
  }

  try {
    const verification = await verifyCashfreeOrderPaid(orderId);
    if (!verification.paid) {
      return res.status(409).json({
        error: 'payment_not_completed',
        message: 'Payment is not completed yet. Please try again after payment.',
        order_status: verification.orderStatus || 'UNKNOWN'
      });
    }

    const userId = req.accountUserId || req.userId;
    const checkoutSession = getCheckoutSessionByOrder.get(String(orderId), userId);
    const quoted = checkoutSession || evaluatePlanPurchase({ userId, targetPlan: plan, purchasedAt: nowIso() });
    const result = applySubscription({
      userId,
      plan: quoted.plan || plan,
      provider: 'cashfree',
      providerTxnId: verification.paymentId || String(orderId),
      purchasedAt: nowIso(),
      amountOverride: Number(quoted.amount_inr ?? quoted.chargeAmount ?? PLAN_CONFIG[plan]?.amount ?? 0),
      periodOverride: String(quoted.period || PLAN_CONFIG[plan]?.period || 'manual'),
      startsAtOverride: quoted.starts_at || quoted.startsAt || null,
      validUntilOverride: quoted.valid_until || quoted.validUntil || null
    });
    markCheckoutSessionVerified.run(nowIso(), String(orderId));

    return res.json({
      ok: true,
      ...result,
      provider: 'cashfree',
      order_id: orderId,
      mode: quoted.mode || 'standard',
      from_plan: quoted.fromPlan || null
    });
  } catch (e) {
    if (e?.code === 'invalid_plan' || e?.code === 'downgrade_not_allowed') {
      return res.status(409).json({ error: e.code, message: e.message });
    }
    const status = e?.code === 'cashfree_not_configured' ? 500 : e?.status || 500;
    return res.status(status).json({
      error: e?.code || 'cashfree_verify_failed',
      message: e?.message || 'Cashfree verification failed.'
    });
  }
});

router.get('/cashfree/return', (_req, res) => {
  return res
    .status(200)
    .send('<html><body style="font-family: sans-serif; padding:16px;">Payment response received. You can return to the app and tap Verify Payment.</body></html>');
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
