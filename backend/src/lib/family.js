import { db } from './db.js';
import { ensureSubscriptionForUser, isPremiumActive } from './subscription.js';

export function resolveAccountContext(userId) {
  const member = db
    .prepare('SELECT owner_user_id, role FROM family_members WHERE member_user_id = ?')
    .get(userId);

  if (!member) {
    const subscription = ensureSubscriptionForUser(userId);
    return {
      accountUserId: userId,
      ownerUserId: userId,
      accessRole: 'admin',
      isOwner: true,
      isAdmin: true,
      premiumActive: isPremiumActive(subscription)
    };
  }

  const ownerId = member.owner_user_id;
  const subscription = ensureSubscriptionForUser(ownerId);
  return {
    accountUserId: ownerId,
    ownerUserId: ownerId,
    accessRole: member.role,
    isOwner: false,
    isAdmin: member.role === 'admin',
    premiumActive: isPremiumActive(subscription)
  };
}

