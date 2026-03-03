import { resolveAccountContext } from '../lib/family.js';

export function attachAccountContext(req, res, next) {
  const context = resolveAccountContext(req.userId);

  if (!context.isOwner && !context.premiumActive) {
    return res
      .status(403)
      .json({ error: 'premium_required', message: 'Premium subscription required', feature: 'family' });
  }

  req.accountUserId = context.accountUserId;
  req.accountOwnerId = context.ownerUserId;
  req.accessRole = context.accessRole;
  req.isAccountOwner = context.isOwner;
  req.isAccountAdmin = context.isAdmin;
  req.accountPremiumActive = context.premiumActive;

  return next();
}

export function requireAccountWrite(req, res, next) {
  if (req.accessRole === 'read') {
    return res.status(403).json({ error: 'forbidden', message: 'Read-only access' });
  }
  return next();
}

export function requireAccountAdmin(req, res, next) {
  if (!req.isAccountOwner && !req.isAccountAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
  }
  return next();
}

