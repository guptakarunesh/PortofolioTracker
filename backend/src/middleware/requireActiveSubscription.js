import { ensureSubscriptionForUser, isSubscriptionActive } from '../lib/subscription.js';

export default function requireActiveSubscription(req, res, next) {
  const ownerId = req.accountUserId || req.userId;
  const subscription = ensureSubscriptionForUser(ownerId);
  if (!isSubscriptionActive(subscription)) {
    return res.status(402).json({
      error: 'subscription_expired',
      message: 'Subscription expired. Renew to make changes.'
    });
  }
  return next();
}
