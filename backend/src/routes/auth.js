import { Router } from 'express';
import { db, nowIso } from '../lib/db.js';
import {
  createSessionToken,
  hashPin,
  hashToken,
  isValidIndianMobile,
  normalizeMobile,
  sessionExpiryIso,
  verifyPin
} from '../lib/auth.js';
import { decryptString, encryptString, hashLookup } from '../lib/crypto.js';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../lib/legal.js';
import { OTP_CONFIG, hashOtp, normalizeProvider, sendOtp, verifyOtp } from '../lib/otp.js';
import { ensureSubscriptionForUser, isPremiumActive } from '../lib/subscription.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

function logFamilyAudit(ownerUserId, actorUserId, action, meta = {}) {
  db.prepare(`
    INSERT INTO family_audit (owner_user_id, actor_user_id, action, meta, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ownerUserId, actorUserId || null, action, JSON.stringify(meta || {}), nowIso());
}

function publicUser(userRow) {
  return {
    id: userRow.id,
    full_name: decryptString(userRow.full_name),
    mobile: decryptString(userRow.mobile),
    email: decryptString(userRow.email || '')
  };
}

router.post('/register', (req, res) => {
  const {
    full_name,
    mobile,
    email = '',
    mpin,
    consent_privacy,
    consent_terms,
    privacy_policy_version,
    terms_version
  } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!full_name || String(full_name).trim().length < 2) {
    return res.status(400).json({ error: 'Valid full_name is required' });
  }
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }
  if (!mpin || !/^\d{4,6}$/.test(String(mpin))) {
    return res.status(400).json({ error: 'mpin must be 4 to 6 digits' });
  }
  if (!consent_privacy || !consent_terms) {
    return res.status(400).json({ error: 'Privacy Policy and Terms consent are required' });
  }
  if (
    String(privacy_policy_version || '') !== PRIVACY_POLICY_VERSION ||
    String(terms_version || '') !== TERMS_VERSION
  ) {
    return res.status(400).json({ error: 'Please accept the latest legal document versions' });
  }

  const mobileHash = hashLookup(cleanMobile);
  const exists = db.prepare('SELECT id FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (exists) {
    return res.status(409).json({ error: 'An account with this mobile already exists' });
  }

  const token = createSessionToken();
  let user = null;
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO users (full_name, mobile, mobile_hash, email, mpin_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      encryptString(String(full_name).trim()),
      encryptString(cleanMobile),
      mobileHash,
      encryptString(String(email || '').trim()),
      hashPin(String(mpin)),
      nowIso()
    );

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    const pendingInvite = db
      .prepare(
        `
        SELECT * FROM family_invites
        WHERE mobile_hash = ? AND status = 'pending' AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(mobileHash, nowIso());

    if (pendingInvite) {
      const ownerSubscription = ensureSubscriptionForUser(pendingInvite.owner_user_id);
      if (!isPremiumActive(ownerSubscription)) {
        db.prepare(`
          UPDATE family_invites
          SET status = 'expired', updated_at = ?
          WHERE id = ?
        `).run(nowIso(), pendingInvite.id);
      } else {
      const alreadyMember = db
        .prepare('SELECT id FROM family_members WHERE member_user_id = ?')
        .get(user.id);
      if (!alreadyMember) {
        db.prepare(`
          INSERT INTO family_members (owner_user_id, member_user_id, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(pendingInvite.owner_user_id, user.id, pendingInvite.role, nowIso(), nowIso());

        db.prepare(`
          UPDATE family_invites
          SET status = 'accepted', accepted_user_id = ?, updated_at = ?
          WHERE id = ?
        `).run(user.id, nowIso(), pendingInvite.id);

        db.prepare(`
          UPDATE family_invites
          SET status = 'canceled', updated_at = ?
          WHERE mobile_hash = ? AND status = 'pending' AND id != ?
        `).run(nowIso(), mobileHash, pendingInvite.id);

        logFamilyAudit(pendingInvite.owner_user_id, user.id, 'invite_accepted', {
          invite_id: pendingInvite.id,
          role: pendingInvite.role
        });
      }
      }
    }

    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, hashToken(token), sessionExpiryIso(), nowIso());

    db.prepare(`
      INSERT INTO consent_log (
        user_id, privacy_policy_version, terms_version, consented_at, ip_address, user_agent, consent_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      PRIVACY_POLICY_VERSION,
      TERMS_VERSION,
      nowIso(),
      String(req.ip || ''),
      String(req.headers['user-agent'] || ''),
      'mobile_register'
    );

    const trialStart = nowIso();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 30);
    const trialEndIso = trialEnd.toISOString();

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
    `).run(user.id, trialStart, trialEndIso, nowIso());

    db.prepare(`
      INSERT INTO payment_history (
        user_id, plan, amount_inr, period, provider, provider_txn_id,
        purchased_at, valid_until, status
      ) VALUES (?, 'trial_premium', 0, 'trial', 'trial', null, ?, ?, 'succeeded')
    `).run(user.id, trialStart, trialEndIso);
  });

  tx();
  return res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { mobile, mpin } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!isValidIndianMobile(cleanMobile) || !mpin) {
    return res.status(400).json({ error: 'mobile and mpin are required' });
  }

  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user || !verifyPin(String(mpin), user.mpin_hash)) {
    return res.status(401).json({ error: 'Invalid mobile or mpin' });
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  const token = createSessionToken();
  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, hashToken(token), sessionExpiryIso(), nowIso());

  return res.json({ token, user: publicUser(user) });
});

router.post('/otp/send', async (req, res) => {
  const { mobile } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }

  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  db.prepare('DELETE FROM otp_requests WHERE expires_at < ?').run(nowIso);

  const latest = db
    .prepare('SELECT * FROM otp_requests WHERE mobile_hash = ? ORDER BY created_at DESC LIMIT 1')
    .get(mobileHash);

  if (latest?.last_sent_at) {
    const lastSent = new Date(latest.last_sent_at).getTime();
    const cooldownMs = OTP_CONFIG.resendCooldownSeconds * 1000;
    const waitMs = lastSent + cooldownMs - now.getTime();
    if (waitMs > 0) {
      return res.status(429).json({
        error: 'Please wait before requesting a new OTP.',
        retry_after_seconds: Math.ceil(waitMs / 1000)
      });
    }
  }

  try {
    const providerPayload = await sendOtp(cleanMobile);
    const expiresAt = new Date(Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000).toISOString();
    const provider = providerPayload.provider || normalizeProvider();
    const otpHash = provider === 'mock' && providerPayload.otp ? hashOtp(providerPayload.otp) : null;

    db.prepare(`
      INSERT INTO otp_requests (mobile_hash, provider, provider_ref, otp_hash, expires_at, attempts, last_sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(mobileHash, provider, providerPayload.providerRef, otpHash, expiresAt, nowIso, nowIso);

    if (provider === 'mock' && providerPayload.otp) {
      console.log(`[OTP MOCK] ${cleanMobile}: ${providerPayload.otp}`);
    }

    const response = {
      sent: true,
      expires_at: expiresAt,
      retry_after_seconds: OTP_CONFIG.resendCooldownSeconds
    };
    if (process.env.OTP_TEST_ECHO === '1' && provider === 'mock' && providerPayload.otp) {
      response.otp = providerPayload.otp;
    }
    return res.json(response);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Failed to send OTP' });
  }
});

router.post('/otp/verify', async (req, res) => {
  const { mobile, otp } = req.body || {};
  const cleanMobile = normalizeMobile(mobile);

  if (!isValidIndianMobile(cleanMobile) || !otp) {
    return res.status(400).json({ error: 'mobile and otp are required' });
  }

  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }

  const nowIso = new Date().toISOString();
  const request = db
    .prepare('SELECT * FROM otp_requests WHERE mobile_hash = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .get(mobileHash, nowIso);

  if (!request) {
    return res.status(400).json({ error: 'OTP expired or not requested' });
  }

  if (request.attempts >= OTP_CONFIG.maxAttempts) {
    return res.status(429).json({ error: 'Too many failed OTP attempts. Please request a new OTP.' });
  }

  try {
    let verified = false;
    if (request.provider === 'mock') {
      verified = request.otp_hash && hashOtp(otp) === request.otp_hash;
    } else {
      verified = await verifyOtp(cleanMobile, otp, request.provider_ref, request.provider);
    }

    if (!verified) {
      db.prepare('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?').run(request.id);
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    db.prepare('DELETE FROM otp_requests WHERE id = ?').run(request.id);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso, user.id);

    const token = createSessionToken();
    db.prepare(`
      INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, hashToken(token), sessionExpiryIso(), nowIso);

    return res.json({ token, user: publicUser(user) });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'OTP verification failed' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  res.status(204).send();
});

export default router;
