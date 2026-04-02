import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestDbPath, loadApp, appRequest } from './test-utils.js';

async function registerUser(app, { initials, mobile, email, deviceId = 'test-device' }) {
  const register = await appRequest(app, {
    method: 'POST',
    path: '/api/auth/register',
    body: {
      full_name: initials,
      mobile,
      email,
      country: 'India',
      firebase_id_token: `mock:${mobile}`,
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: 'v1.1',
      terms_version: 'v1.1',
      device_context: { device_id: deviceId }
    }
  });
  assert.equal(register.status, 201);
  assert.ok(register.body.token);
  assert.ok(register.body.user?.id);
  return {
    token: register.body.token,
    userId: register.body.user.id,
    user: register.body.user
  };
}

async function setSubscription(userId, { plan, status = 'active', provider = 'manual', days = 30 }) {
  const { upsertSubscriptionState } = await import('../src/lib/subscription.js');
  const startAt = new Date().toISOString();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + Number(status === 'active' ? days : -Math.max(1, days)));
  upsertSubscriptionState({
    userId,
    plan,
    status,
    startedAt: startAt,
    currentPeriodEnd: plan === 'none' ? null : periodEnd.toISOString(),
    provider
  });
}

test('family routes require premium and admin access', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const owner = await registerUser(app, {
    initials: 'OW',
    mobile: '6666666701',
    email: 'owner-premium@example.com'
  });
  await setSubscription(owner.userId, { plan: 'basic_monthly', status: 'active', days: 30 });

  const blockedList = await appRequest(app, {
    method: 'GET',
    path: '/api/family',
    token: owner.token
  });
  assert.equal(blockedList.status, 403);
  assert.equal(blockedList.body.error, 'premium_required');

  const blockedInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666702', role: 'read' }
  });
  assert.equal(blockedInvite.status, 403);
  assert.equal(blockedInvite.body.error, 'premium_required');

  await setSubscription(owner.userId, { plan: 'premium_monthly', status: 'active', days: 30 });
  const member = await registerUser(app, {
    initials: 'RW',
    mobile: '6666666702',
    email: 'member-write@example.com'
  });

  const addMember = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666702', role: 'write' }
  });
  assert.equal(addMember.status, 201);

  const memberList = await appRequest(app, {
    method: 'GET',
    path: '/api/family',
    token: member.token
  });
  assert.equal(memberList.status, 403);
  assert.equal(memberList.body.error, 'forbidden');

  const memberAudit = await appRequest(app, {
    method: 'GET',
    path: '/api/family/audit',
    token: member.token
  });
  assert.equal(memberAudit.status, 403);
  assert.equal(memberAudit.body.error, 'forbidden');

  const memberInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: member.token,
    body: { mobile: '6666666703', role: 'read' }
  });
  assert.equal(memberInvite.status, 403);
  assert.equal(memberInvite.body.error, 'forbidden');
});

test('family invite validation blocks invalid input, self-add, duplicates, and cross-owner collisions', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const ownerOne = await registerUser(app, {
    initials: 'OA',
    mobile: '6666666711',
    email: 'owner-one@example.com'
  });
  const ownerTwo = await registerUser(app, {
    initials: 'OB',
    mobile: '6666666712',
    email: 'owner-two@example.com'
  });
  await setSubscription(ownerOne.userId, { plan: 'premium_monthly', status: 'active', days: 30 });
  await setSubscription(ownerTwo.userId, { plan: 'premium_monthly', status: 'active', days: 30 });

  const invalidMobile = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '12345', role: 'read' }
  });
  assert.equal(invalidMobile.status, 400);

  const invalidRole = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '6666666719', role: 'viewer' }
  });
  assert.equal(invalidRole.status, 400);
  assert.equal(invalidRole.body.error, 'Invalid role');

  const selfAdd = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '6666666711', role: 'read' }
  });
  assert.equal(selfAdd.status, 400);
  assert.equal(selfAdd.body.error, 'Owner cannot be added as a family member');

  const firstInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '6666666715', role: 'read' }
  });
  assert.equal(firstInvite.status, 201);

  const duplicateOwnerInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '6666666715', role: 'read' }
  });
  assert.equal(duplicateOwnerInvite.status, 409);
  assert.equal(duplicateOwnerInvite.body.error, 'Invite already sent to this mobile number');

  const crossOwnerInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerTwo.token,
    body: { mobile: '6666666715', role: 'read' }
  });
  assert.equal(crossOwnerInvite.status, 409);
  assert.equal(crossOwnerInvite.body.error, 'This user already has a pending family invite');
});

test('family invite lifecycle covers resend, cancel, expiry, and late registration fallback', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();
  const { db } = await import('../src/lib/db.js');

  const owner = await registerUser(app, {
    initials: 'OF',
    mobile: '6666666721',
    email: 'owner-flow@example.com'
  });
  await setSubscription(owner.userId, { plan: 'premium_monthly', status: 'active', days: 30 });

  const pending = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666722', role: 'read' }
  });
  assert.equal(pending.status, 201);
  const inviteId = pending.body.invite.id;
  const firstExpiry = pending.body.invite.expires_at;

  const resent = await appRequest(app, {
    method: 'POST',
    path: `/api/family/invites/${inviteId}/resend`,
    token: owner.token
  });
  assert.equal(resent.status, 200);
  assert.ok(new Date(resent.body.expires_at).getTime() >= new Date(firstExpiry).getTime());

  const canceled = await appRequest(app, {
    method: 'DELETE',
    path: `/api/family/invites/${inviteId}`,
    token: owner.token
  });
  assert.equal(canceled.status, 204);

  const resendCanceled = await appRequest(app, {
    method: 'POST',
    path: `/api/family/invites/${inviteId}/resend`,
    token: owner.token
  });
  assert.equal(resendCanceled.status, 400);
  assert.equal(resendCanceled.body.error, 'Only pending invites can be resent');

  const lateInvite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666723', role: 'admin' }
  });
  assert.equal(lateInvite.status, 201);
  const lateInviteId = lateInvite.body.invite.id;
  db.prepare('UPDATE family_invites SET expires_at = ?, updated_at = ? WHERE id = ?').run(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    new Date().toISOString(),
    lateInviteId
  );

  const familyList = await appRequest(app, {
    method: 'GET',
    path: '/api/family',
    token: owner.token
  });
  assert.equal(familyList.status, 200);
  const expiredInvite = familyList.body.invites.find((row) => row.id === lateInviteId);
  assert.equal(expiredInvite.status, 'expired');

  const lateMember = await registerUser(app, {
    initials: 'LM',
    mobile: '6666666723',
    email: 'late-member@example.com'
  });

  const access = await appRequest(app, {
    method: 'GET',
    path: '/api/family/access',
    token: lateMember.token
  });
  assert.equal(access.status, 200);
  assert.equal(access.body.is_owner, true);
  assert.equal(access.body.role, 'admin');
});

test('family membership blocks joining another family and admin actions validate role and existence', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const ownerOne = await registerUser(app, {
    initials: 'AA',
    mobile: '6666666731',
    email: 'owner-a@example.com'
  });
  const ownerTwo = await registerUser(app, {
    initials: 'AB',
    mobile: '6666666732',
    email: 'owner-b@example.com'
  });
  const member = await registerUser(app, {
    initials: 'MB',
    mobile: '6666666733',
    email: 'member-block@example.com'
  });
  await setSubscription(ownerOne.userId, { plan: 'premium_monthly', status: 'active', days: 30 });
  await setSubscription(ownerTwo.userId, { plan: 'premium_monthly', status: 'active', days: 30 });

  const added = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerOne.token,
    body: { mobile: '6666666733', role: 'read' }
  });
  assert.equal(added.status, 201);
  const memberRowId = added.body.id;

  const otherFamilyAdd = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: ownerTwo.token,
    body: { mobile: '6666666733', role: 'read' }
  });
  assert.equal(otherFamilyAdd.status, 409);
  assert.equal(otherFamilyAdd.body.error, 'This user is already part of another family');

  const invalidRoleUpdate = await appRequest(app, {
    method: 'PUT',
    path: `/api/family/${memberRowId}`,
    token: ownerOne.token,
    body: { role: 'viewer' }
  });
  assert.equal(invalidRoleUpdate.status, 400);
  assert.equal(invalidRoleUpdate.body.error, 'Invalid role');

  const missingRoleUpdate = await appRequest(app, {
    method: 'PUT',
    path: '/api/family/999',
    token: ownerOne.token,
    body: { role: 'admin' }
  });
  assert.equal(missingRoleUpdate.status, 404);
  assert.equal(missingRoleUpdate.body.error, 'Family member not found');

  const missingDelete = await appRequest(app, {
    method: 'DELETE',
    path: '/api/family/999',
    token: ownerOne.token
  });
  assert.equal(missingDelete.status, 404);
  assert.equal(missingDelete.body.error, 'Family member not found');
});

test('leave family blocks owner exit and avoids granting a second standalone trial', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const owner = await registerUser(app, {
    initials: 'LO',
    mobile: '6666666741',
    email: 'owner-leave@example.com'
  });
  const member = await registerUser(app, {
    initials: 'LT',
    mobile: '6666666742',
    email: 'member-leave@example.com'
  });
  await setSubscription(owner.userId, { plan: 'premium_monthly', status: 'active', days: 30 });
  await setSubscription(member.userId, { plan: 'none', status: 'expired', provider: 'trial', days: 2 });

  const addMember = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666742', role: 'read' }
  });
  assert.equal(addMember.status, 201);

  const ownerLeave = await appRequest(app, {
    method: 'POST',
    path: '/api/family/leave',
    token: owner.token
  });
  assert.equal(ownerLeave.status, 400);
  assert.equal(ownerLeave.body.error, 'owner_cannot_leave_family');

  const memberLeave = await appRequest(app, {
    method: 'POST',
    path: '/api/family/leave',
    token: member.token
  });
  assert.equal(memberLeave.status, 200);
  assert.equal(memberLeave.body.subscription.plan, 'none');
  assert.equal(memberLeave.body.subscription.status, 'expired');

  const leaveAgain = await appRequest(app, {
    method: 'POST',
    path: '/api/family/leave',
    token: member.token
  });
  assert.equal(leaveAgain.status, 400);
  assert.equal(leaveAgain.body.error, 'owner_cannot_leave_family');
});

test('recent family activity is available to members and capped to the latest five items', async () => {
  process.env.DB_PATH = buildTestDbPath();
  process.env.OTP_PROVIDER = 'mock';
  process.env.OTP_TEST_ECHO = '1';

  const app = await loadApp();

  const owner = await registerUser(app, {
    initials: 'RA',
    mobile: '6666666751',
    email: 'recent-owner@example.com'
  });
  await setSubscription(owner.userId, { plan: 'premium_monthly', status: 'active', days: 30 });

  await appRequest(app, {
    method: 'POST',
    path: '/api/assets',
    token: owner.token,
    body: {
      category: 'Banking & Deposits',
      name: 'Recent Bank',
      current_value: 1000
    }
  });

  await appRequest(app, {
    method: 'POST',
    path: '/api/liabilities',
    token: owner.token,
    body: {
      loan_type: 'Personal Loan',
      lender: 'Recent Lender',
      outstanding_amount: 500
    }
  });

  const invite = await appRequest(app, {
    method: 'POST',
    path: '/api/family',
    token: owner.token,
    body: { mobile: '6666666752', role: 'read' }
  });
  assert.equal(invite.status, 201);

  const member = await registerUser(app, {
    initials: 'RB',
    mobile: '6666666752',
    email: 'recent-member@example.com'
  });

  const ownerFamily = await appRequest(app, {
    method: 'GET',
    path: '/api/family',
    token: owner.token
  });
  const memberRow = ownerFamily.body.members[0];

  await appRequest(app, {
    method: 'PUT',
    path: `/api/family/${memberRow.id}`,
    token: owner.token,
    body: { role: 'admin' }
  });

  const recent = await appRequest(app, {
    method: 'GET',
    path: '/api/family/recent-activity',
    token: member.token
  });
  assert.equal(recent.status, 200);
  assert.ok(Array.isArray(recent.body.items));
  assert.ok(recent.body.items.length > 0);
  assert.ok(recent.body.items.length <= 5);
  const kinds = recent.body.items.map((item) => item.kind);
  assert.ok(kinds.includes('asset_updated'));
  assert.ok(kinds.includes('liability_updated'));
  assert.ok(kinds.some((kind) => kind.startsWith('family_')));
});
