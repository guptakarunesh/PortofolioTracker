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
import {
  OTP_CONFIG,
  OtpServiceError,
  hashOtp,
  normalizeProvider,
  sendOtp,
  verifyFirebaseIdToken,
  verifyOtp
} from '../lib/otp.js';
import { ensureSubscriptionForUser, isPremiumActive, provisionTrialPremium } from '../lib/subscription.js';
import { logSecurityEvent, notifyOwnerAndFamily } from '../lib/securityEvents.js';
import {
  countTrustedDevices,
  extractDeviceContext,
  getClientIp,
  isTrustedDevice,
  logAuthEvent,
  upsertUserDevice
} from '../lib/deviceSecurity.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();
const COUNTRY_CURRENCY = {
  india: 'INR',
  'united states': 'USD',
  usa: 'USD',
  'united kingdom': 'GBP',
  uk: 'GBP',
  'united arab emirates': 'AED',
  uae: 'AED',
  singapore: 'SGD',
  germany: 'EUR',
  france: 'EUR',
  spain: 'EUR',
  italy: 'EUR',
  netherlands: 'EUR',
  europe: 'EUR'
};
const OTP_PURPOSE_LOGIN = 'login';
const OTP_PURPOSE_MPIN_RESET = 'reset_mpin';
const OTP_PURPOSE_SECURITY_PIN_RESET = 'reset_security_pin';
const RESET_FAIL_LIMIT = Number.parseInt(process.env.SECURITY_RESET_FAIL_LIMIT || '5', 10);
const RESET_LOCK_MINUTES = Number.parseInt(process.env.SECURITY_RESET_LOCK_MINUTES || '15', 10);

function normalizeCountry(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function currencyFromCountry(value = '') {
  const normalized = normalizeCountry(value);
  if (!normalized) return 'INR';
  if (COUNTRY_CURRENCY[normalized]) return COUNTRY_CURRENCY[normalized];
  if (normalized.includes('united states')) return 'USD';
  if (normalized.includes('united kingdom')) return 'GBP';
  if (normalized.includes('arab emirates')) return 'AED';
  if (normalized.includes('singapore')) return 'SGD';
  if (normalized.includes('euro') || normalized.includes('europe')) return 'EUR';
  return 'INR';
}

function logFamilyAudit(ownerUserId, actorUserId, action, meta = {}) {
  db.prepare(`
    INSERT INTO family_audit (owner_user_id, actor_user_id, action, meta, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ownerUserId, actorUserId || null, action, JSON.stringify(meta || {}), nowIso());
}

function initialsFromName(name = '') {
  const compact = String(name || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,2}$/.test(compact)) return compact;
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function publicUser(userRow) {
  const initials = initialsFromName(decryptString(userRow.full_name));
  return {
    id: userRow.id,
    full_name: initials || 'NA',
    mobile: decryptString(userRow.mobile),
    email: decryptString(userRow.email || '')
  };
}

function getUserSettingValue(userId, key) {
  const row = db
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ? LIMIT 1')
    .get(userId, key);
  return row?.value ?? '';
}

function setUserSettingValue(userId, key, value) {
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `).run(userId, key, String(value ?? ''), nowIso());
}

function lockKeys(prefix) {
  return {
    failCount: `${prefix}_fail_count`,
    lockUntil: `${prefix}_lock_until`
  };
}

function getResetLockState(userId, prefix) {
  const keys = lockKeys(prefix);
  const lockUntil = String(getUserSettingValue(userId, keys.lockUntil) || '').trim();
  if (!lockUntil) return { locked: false, retryAfterSeconds: 0 };
  const untilTs = new Date(lockUntil).getTime();
  if (!Number.isFinite(untilTs) || untilTs <= Date.now()) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return { locked: true, retryAfterSeconds: Math.ceil((untilTs - Date.now()) / 1000) };
}

function clearResetFailures(userId, prefix) {
  const keys = lockKeys(prefix);
  setUserSettingValue(userId, keys.failCount, '0');
  setUserSettingValue(userId, keys.lockUntil, '');
}

function registerResetFailure(userId, prefix) {
  const keys = lockKeys(prefix);
  const current = Number.parseInt(String(getUserSettingValue(userId, keys.failCount) || '0'), 10) || 0;
  const next = current + 1;
  if (next >= RESET_FAIL_LIMIT) {
    const lockUntil = new Date(Date.now() + RESET_LOCK_MINUTES * 60 * 1000).toISOString();
    setUserSettingValue(userId, keys.failCount, '0');
    setUserSettingValue(userId, keys.lockUntil, lockUntil);
    return {
      locked: true,
      retryAfterSeconds: RESET_LOCK_MINUTES * 60
    };
  }
  setUserSettingValue(userId, keys.failCount, String(next));
  return { locked: false, retryAfterSeconds: 0 };
}

function requireUnlockedReset(res, userId, prefix) {
  const state = getResetLockState(userId, prefix);
  if (!state.locked) return null;
  res.status(429).json({
    error: 'Too many failed attempts. Please try again later.',
    retry_after_seconds: state.retryAfterSeconds
  });
  return state;
}

function isTransientOtpFailure(error) {
  const status = Number(error?.status || 0);
  if (status >= 500) return true;
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code.includes('TIMEOUT') ||
    code.includes('UNAVAILABLE') ||
    code.includes('INTERNAL') ||
    message.includes('fetch failed') ||
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable')
  );
}

async function sendOtpForPurpose(cleanMobile, mobileHash, purpose, providerOptions = {}) {
  const now = new Date();
  const nowIsoStr = now.toISOString();
  db.prepare('DELETE FROM otp_requests WHERE expires_at < ?').run(nowIsoStr);

  const latest = db
    .prepare('SELECT * FROM otp_requests WHERE mobile_hash = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
    .get(mobileHash, purpose);

  if (latest?.last_sent_at) {
    const lastSent = new Date(latest.last_sent_at).getTime();
    const cooldownMs = OTP_CONFIG.resendCooldownSeconds * 1000;
    const waitMs = lastSent + cooldownMs - now.getTime();
    if (waitMs > 0) {
      return {
        ok: false,
        status: 429,
        body: {
          error: 'Please wait before requesting a new OTP.',
          retry_after_seconds: Math.ceil(waitMs / 1000)
        }
      };
    }
  }

  try {
    const providerPayload = await sendOtp(cleanMobile, undefined, providerOptions);
    const expiresAt = new Date(Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000).toISOString();
    const provider = providerPayload.provider || normalizeProvider();
    const otpHash = provider === 'mock' && providerPayload.otp ? hashOtp(providerPayload.otp) : null;

    db.prepare(`
      INSERT INTO otp_requests (mobile_hash, purpose, provider, provider_ref, otp_hash, expires_at, attempts, last_sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(mobileHash, purpose, provider, providerPayload.providerRef, otpHash, expiresAt, nowIsoStr, nowIsoStr);

    if (provider === 'mock' && providerPayload.otp) {
      console.log(`[OTP MOCK:${purpose}] ${cleanMobile}: ${providerPayload.otp}`);
    }

    const body = {
      sent: true,
      expires_at: expiresAt,
      retry_after_seconds: OTP_CONFIG.resendCooldownSeconds
    };
    if (process.env.OTP_TEST_ECHO === '1' && provider === 'mock' && providerPayload.otp) {
      body.otp = providerPayload.otp;
    }

    return { ok: true, status: 200, body };
  } catch (e) {
    const status = Number(e?.status) || (e instanceof OtpServiceError ? e.status : 502);
    const transient = isTransientOtpFailure(e);
    return {
      ok: false,
      status: status >= 400 && status < 600 ? status : 502,
      body: transient
        ? {
            error: 'Unable to send OTP right now. Please wait a few seconds and try again.',
            retry_after_seconds: 3
          }
        : { error: e.message || 'Failed to send OTP' }
    };
  }
}

async function verifyOtpForPurpose(cleanMobile, mobileHash, otp, purpose) {
  const nowIsoStr = new Date().toISOString();
  const request = db
    .prepare(
      'SELECT * FROM otp_requests WHERE mobile_hash = ? AND purpose = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(mobileHash, purpose, nowIsoStr);

  if (!request) {
    return { ok: false, status: 400, error: 'OTP expired or not requested' };
  }
  if (request.attempts >= OTP_CONFIG.maxAttempts) {
    return { ok: false, status: 429, error: 'Too many failed OTP attempts. Please request a new OTP.' };
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
      return { ok: false, status: 401, error: 'Invalid OTP' };
    }

    db.prepare('DELETE FROM otp_requests WHERE id = ?').run(request.id);
    return { ok: true, status: 200 };
  } catch (e) {
    const status = Number(e?.status) || (e instanceof OtpServiceError ? e.status : 502);
    const transient = isTransientOtpFailure(e);
    return {
      ok: false,
      status: status >= 400 && status < 600 ? status : 502,
      error: transient ? 'Unable to verify OTP right now. Please wait a few seconds and try again.' : e.message || 'OTP verification failed'
    };
  }
}

function getOptionalSessionUser(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db
    .prepare(
      `
      SELECT s.user_id, s.expires_at
      FROM sessions s
      WHERE s.token_hash = ?
      LIMIT 1
    `
    )
    .get(tokenHash);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;
  return { userId: Number(session.user_id) };
}

function saveSupportChatMessage(userId, role, message) {
  if (!userId || !message) return;
  db.prepare(
    `
    INSERT INTO support_chat_messages (user_id, role, message, created_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(Number(userId), String(role || 'user'), encryptString(String(message || '')), nowIso());
}

function loadSupportChatHistory(userId, limit = 300) {
  if (!userId) return [];
  const safeLimit = Math.max(1, Math.min(1000, Number(limit || 300)));
  const rows = db
    .prepare(
      `
      SELECT role, message, created_at
      FROM support_chat_messages
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `
    )
    .all(Number(userId), safeLimit)
    .reverse();
  return rows
    .map((row) => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      text: decryptString(row.message || ''),
      created_at: row.created_at
    }));
}

function buildSupportFallbackReply(message = '') {
  const text = String(message || '').toLowerCase();
  if (text.includes('network') || text.includes('request failed')) {
    return 'Got it. Let us fix the network issue first: check internet, reopen app, switch Wi-Fi/mobile data once, and retry. If login still fails, use OTP Login. What exact error text do you see now?';
  }
  if (text.includes('fingerprint') || text.includes('face id') || text.includes('biometric')) {
    return 'Understood. For biometric login: first login once with mobile + MPIN, then enable it in Account > Privacy & Security, and confirm Face ID/Fingerprint is enrolled in device settings. Which step is failing for you?';
  }
  if (text.includes('otp')) {
    return 'Sure. For OTP login: confirm mobile number, tap Send OTP, enter the latest 6-digit OTP quickly, and use Resend after cooldown if needed. Are you not receiving OTP or seeing OTP verification failure?';
  }
  if (text.includes('mpin') || text.includes('pin') || text.includes('invalid')) {
    return 'Okay. If MPIN fails, use MPIN Reset on login: request OTP, verify OTP, set new MPIN, then login again. For sensitive-detail PIN reset, use Account > Privacy & Security. Is this for login MPIN or security PIN?';
  }
  if (text.includes('subscription') || text.includes('premium') || text.includes('payment')) {
    return 'Understood. Open Manage Plan, complete payment, then check Account > Subscription status. If status does not refresh, reopen app once. Did payment succeed but plan still shows inactive?';
  }
  if (text.includes('family')) {
    return 'Got it. Family Access works on premium plans. Go to Account > Family Access, invite by mobile, assign role, and confirm member accepted invite. Is the issue with invite sending, accepting, or permissions?';
  }
  return 'I can help with login, OTP, MPIN reset, biometric, reminders, family access, and subscription. Tell me what you tried and the exact error shown, and I will guide you step by step.';
}

async function callSupportAssistant({ apiKey, model, message, history = [] }) {
  const safeHistory = Array.isArray(history)
    ? history
        .filter((item) => item && typeof item === 'object')
        .slice(-8)
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: String(item.text || '').slice(0, 500)
        }))
    : [];

  const inputHistory = safeHistory.map((item) => ({
    role: item.role,
    content: [{ type: 'input_text', text: item.text }]
  }));

  const payload = {
    model,
    reasoning: { effort: 'low' },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You are Networth Manager in-app support assistant.\n' +
              'Goals:\n' +
              '- Help users fix login/OTP/MPIN/fingerprint/network/subscription/family/reminder issues.\n' +
              '- Be conversational and context-aware across turns. Use chat history to avoid repeating yourself.\n' +
              '- First answer the user’s exact question directly, then give steps if needed.\n' +
              '- Use simple short steps (max 6 steps).\n' +
              '- Keep replies crisp: 40-120 words.\n' +
              '- If required detail is missing, ask exactly one clarifying question at the end.\n' +
              '- Mention exact app path when useful (e.g., Account > Privacy & Security).\n' +
              '- Ask for only non-sensitive info; never request full OTP/MPIN/PIN/account numbers.\n' +
              '- If a direct fix is not possible, clearly state limitation and give next best action.'
          }
        ]
      },
      ...inputHistory,
      {
        role: 'user',
        content: [{ type: 'input_text', text: String(message || '').slice(0, 500) }]
      }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `OpenAI request failed (${response.status})`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    throw new Error('Support assistant response was not valid JSON');
  }

  const outputText =
    (typeof parsed?.output_text === 'string' && parsed.output_text.trim()) ||
    (Array.isArray(parsed?.output)
      ? parsed.output
          .filter((item) => item?.type === 'message')
          .flatMap((item) => item?.content || [])
          .filter((chunk) => chunk?.type === 'output_text')
          .map((chunk) => String(chunk?.text || ''))
          .join('\n')
          .trim()
      : '');

  if (!outputText) {
    throw new Error('Support assistant returned an empty response');
  }
  return outputText;
}

function createBoundSession({ userId, token, authMethod, context, req, createdAt = nowIso() }) {
  const deviceId = String(context?.device_id || '').trim() || null;
  db.prepare(`
    INSERT INTO sessions (
      user_id, token_hash, device_id, auth_method,
      created_ip, created_user_agent, last_seen_at, last_seen_ip, last_seen_user_agent,
      expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    hashToken(token),
    deviceId,
    String(authMethod || ''),
    getClientIp(req),
    String(req.headers['user-agent'] || ''),
    createdAt,
    getClientIp(req),
    String(req.headers['user-agent'] || ''),
    sessionExpiryIso(),
    createdAt
  );
}

router.post('/support-chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const explicitHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const authUser = getOptionalSessionUser(req);
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'message must be 500 characters or less' });
  }

  if (authUser?.userId) {
    saveSupportChatMessage(authUser.userId, 'user', message);
  }

  const storedHistory = authUser?.userId ? loadSupportChatHistory(authUser.userId, 120) : [];
  const history = storedHistory.length
    ? storedHistory.map((item) => ({ role: item.role, text: item.text }))
    : explicitHistory;

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = String(process.env.OPENAI_SUPPORT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-nano').trim();
  if (!apiKey) {
    const fallback = buildSupportFallbackReply(message);
    if (authUser?.userId) {
      saveSupportChatMessage(authUser.userId, 'assistant', fallback);
    }
    return res.json({
      reply: fallback,
      source: 'fallback',
      as_of: nowIso(),
      history_saved: Boolean(authUser?.userId)
    });
  }

  try {
    const reply = await callSupportAssistant({ apiKey, model, message, history });
    if (authUser?.userId) {
      saveSupportChatMessage(authUser.userId, 'assistant', reply);
    }
    return res.json({ reply, source: 'ai', as_of: nowIso(), history_saved: Boolean(authUser?.userId) });
  } catch (_e) {
    const fallback = buildSupportFallbackReply(message);
    if (authUser?.userId) {
      saveSupportChatMessage(authUser.userId, 'assistant', fallback);
    }
    return res.json({
      reply: fallback,
      source: 'fallback',
      as_of: nowIso(),
      warning: 'support_ai_unavailable',
      history_saved: Boolean(authUser?.userId)
    });
  }
});

router.get('/support-chat/history', requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 500)));
  const items = loadSupportChatHistory(req.userId, limit);
  return res.json({ items });
});

router.post('/register', async (req, res) => {
  const {
    full_name,
    mobile,
    email = '',
    country = '',
    firebase_id_token: firebaseIdToken,
    consent_privacy,
    consent_terms,
    privacy_policy_version,
    terms_version
  } = req.body || {};
  const context = extractDeviceContext(req, req.body?.device_context);
  const cleanMobile = normalizeMobile(mobile);
  const initials = String(full_name || '').replace(/\s+/g, '').toUpperCase();

  if (!String(context.device_id || '').trim()) {
    return res.status(400).json({ error: 'device_id_required', message: 'Device identifier is required.' });
  }

  if (!/^[A-Z]{2}$/.test(initials)) {
    return res.status(400).json({ error: 'Provide exactly 2 initials (letters only)' });
  }
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }
  if (!firebaseIdToken) {
    return res.status(400).json({ error: 'firebase_id_token is required' });
  }
  if (!country || String(country).trim().length < 2) {
    return res.status(400).json({ error: 'country is required' });
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
  const disabledMpinHash = hashPin(createSessionToken().slice(0, 6));
  let user = null;
  let registerStage = 'init';
  let joinedFamilyOnRegister = false;
  try {
    registerStage = 'firebase_verify';
    await verifyFirebaseIdToken(cleanMobile, String(firebaseIdToken));
    const tx = db.transaction(() => {
      registerStage = 'insert_user';
      const result = db.prepare(`
        INSERT INTO users (full_name, mobile, mobile_hash, email, mpin_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        encryptString(initials),
        encryptString(cleanMobile),
        mobileHash,
        encryptString(String(email || '').trim()),
        disabledMpinHash,
        nowIso()
      );

      registerStage = 'load_user';
      const insertedUserId = result.lastInsertRowid || db.prepare('SELECT id FROM users WHERE mobile_hash = ?').get(mobileHash)?.id;
      if (!insertedUserId) {
        throw new Error('register_insert_lookup_failed');
      }
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(insertedUserId);
      if (!user) {
        throw new Error('register_user_load_failed');
      }
      const settingsUpsert = db.prepare(`
        INSERT INTO user_settings (user_id, key, value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET
          value=excluded.value,
          updated_at=excluded.updated_at
      `);
      const cleanedCountry = String(country).trim();
      registerStage = 'user_settings';
      settingsUpsert.run(user.id, 'country', cleanedCountry, nowIso());
      settingsUpsert.run(user.id, 'preferred_currency', currencyFromCountry(cleanedCountry), nowIso());

      registerStage = 'pending_invite_lookup';
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
        registerStage = 'pending_invite_apply';
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
            joinedFamilyOnRegister = true;
          }
        }
      }

      registerStage = 'create_session';
      createBoundSession({
        userId: user.id,
        token,
        authMethod: 'register_otp',
        context,
        req,
        createdAt: nowIso()
      });

      registerStage = 'upsert_device';
      upsertUserDevice(user.id, context, req);

      registerStage = 'consent_log';
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

      if (!joinedFamilyOnRegister) {
        registerStage = 'subscription_upsert';
        provisionTrialPremium({
          userId: user.id,
          startedAt: nowIso(),
          updatedAt: nowIso()
        });
      }
    });

    tx();
  } catch (error) {
    console.error('[auth/register] failed stage=%s mobile=%s message=%s', registerStage, cleanMobile, error?.message || error);
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error?.message || 'Registration failed' });
  }
  logAuthEvent({
    userId: user?.id || null,
    mobileHash,
    eventType: 'register_success',
    authMethod: 'register_otp',
    status: 'ok',
    context,
    req
  });
  return res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { mobile, mpin } = req.body || {};
  const context = extractDeviceContext(req, req.body?.device_context);
  const cleanMobile = normalizeMobile(mobile);
  const mobileHash = hashLookup(cleanMobile);

  if (!isValidIndianMobile(cleanMobile) || !mpin) {
    logAuthEvent({
      userId: null,
      mobileHash,
      eventType: 'login_failed_validation',
      authMethod: 'mpin',
      status: 'failed',
      reason: 'missing_mobile_or_mpin',
      context,
      req
    });
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Mobile number and MPIN are required'
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user || !verifyPin(String(mpin), user.mpin_hash)) {
    logAuthEvent({
      userId: user?.id || null,
      mobileHash,
      eventType: 'login_failed_invalid_credentials',
      authMethod: 'mpin',
      status: 'failed',
      reason: 'invalid_credentials',
      context,
      req
    });
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Invalid login credentials'
    });
  }

  const hasDeviceId = Boolean(String(context.device_id || '').trim());
  if (!hasDeviceId) {
    logAuthEvent({
      userId: user.id,
      mobileHash,
      eventType: 'login_failed_missing_device',
      authMethod: 'mpin',
      status: 'failed',
      reason: 'missing_device_id',
      context,
      req
    });
    return res.status(400).json({ error: 'device_id_required', message: 'Device identifier is required.' });
  }

  const trustedCount = countTrustedDevices(user.id);
  const trustedDevice = hasDeviceId ? isTrustedDevice(user.id, context.device_id) : false;
  if (trustedCount > 0 && !trustedDevice) {
    logAuthEvent({
      userId: user.id,
      mobileHash,
      eventType: 'login_rejected_untrusted_device',
      authMethod: 'mpin',
      status: 'blocked',
      reason: hasDeviceId ? 'untrusted_device' : 'missing_device_id',
      context,
      req
    });
    return res.status(403).json({
      error: 'device_not_trusted',
      message: 'This device is not trusted. Login once via OTP to authorize this device.'
    });
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  upsertUserDevice(user.id, context, req);
  const token = createSessionToken();
  createBoundSession({
    userId: user.id,
    token,
    authMethod: 'mpin',
    context,
    req,
    createdAt: nowIso()
  });
  logAuthEvent({
    userId: user.id,
    mobileHash,
    eventType: 'login_success',
    authMethod: 'mpin',
    status: 'ok',
    context,
    req
  });

  return res.json({ token, user: publicUser(user) });
});

router.post('/biometric/login', (req, res) => {
  const { mobile } = req.body || {};
  const context = extractDeviceContext(req, req.body?.device_context);
  const cleanMobile = normalizeMobile(mobile);
  const mobileHash = hashLookup(cleanMobile);

  if (!String(context.device_id || '').trim()) {
    return res.status(400).json({ error: 'device_id_required', message: 'Device identifier is required.' });
  }

  if (!isValidIndianMobile(cleanMobile)) {
    logAuthEvent({
      userId: null,
      mobileHash,
      eventType: 'biometric_login_failed_validation',
      authMethod: 'biometric',
      status: 'failed',
      reason: 'missing_mobile',
      context,
      req
    });
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    logAuthEvent({
      userId: null,
      mobileHash,
      eventType: 'biometric_login_failed_user_not_found',
      authMethod: 'biometric',
      status: 'failed',
      reason: 'user_not_found',
      context,
      req
    });
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }

  if (!isTrustedDevice(user.id, context.device_id)) {
    logAuthEvent({
      userId: user.id,
      mobileHash,
      eventType: 'biometric_login_rejected_untrusted_device',
      authMethod: 'biometric',
      status: 'blocked',
      reason: 'untrusted_device',
      context,
      req
    });
    return res.status(403).json({
      error: 'device_not_trusted',
      message: 'This device is not trusted. Login once via OTP to authorize this device.'
    });
  }

  const biometricEnabled = String(getUserSettingValue(user.id, 'biometric_login_enabled') || '').toLowerCase();
  if (!(biometricEnabled === '1' || biometricEnabled === 'true' || biometricEnabled === 'yes')) {
    logAuthEvent({
      userId: user.id,
      mobileHash,
      eventType: 'biometric_login_failed_not_enabled',
      authMethod: 'biometric',
      status: 'failed',
      reason: 'biometric_not_enabled',
      context,
      req
    });
    return res.status(403).json({
      error: 'biometric_not_enabled',
      message: 'Biometric login is not enabled for this account on this device yet.'
    });
  }

  const nowIsoStr = nowIso();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIsoStr, user.id);
  upsertUserDevice(user.id, context, req);
  const token = createSessionToken();
  createBoundSession({
    userId: user.id,
    token,
    authMethod: 'biometric',
    context,
    req,
    createdAt: nowIsoStr
  });
  logAuthEvent({
    userId: user.id,
    mobileHash,
    eventType: 'biometric_login_success',
    authMethod: 'biometric',
    status: 'ok',
    context,
    req
  });

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
  const otpResp = await sendOtpForPurpose(cleanMobile, mobileHash, OTP_PURPOSE_LOGIN, req.body || {});
  return res.status(otpResp.status).json(otpResp.body);
});

router.post('/otp/verify', async (req, res) => {
  const { mobile, otp, firebase_id_token: firebaseIdToken } = req.body || {};
  const context = extractDeviceContext(req, req.body?.device_context);
  const cleanMobile = normalizeMobile(mobile);
  const mobileHash = hashLookup(cleanMobile);

  if (!String(context.device_id || '').trim()) {
    return res.status(400).json({ error: 'device_id_required', message: 'Device identifier is required.' });
  }

  if (!isValidIndianMobile(cleanMobile) || (!otp && !firebaseIdToken)) {
    logAuthEvent({
      userId: null,
      mobileHash,
      eventType: 'otp_login_failed_validation',
      authMethod: 'otp',
      status: 'failed',
      reason: 'missing_mobile_or_otp_or_firebase_token',
      context,
      req
    });
    return res.status(400).json({ error: 'mobile and otp (or firebase_id_token) are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    logAuthEvent({
      userId: null,
      mobileHash,
      eventType: 'otp_login_failed_user_not_found',
      authMethod: 'otp',
      status: 'failed',
      reason: 'user_not_found',
      context,
      req
    });
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }
  const verified = firebaseIdToken
    ? await (async () => {
        try {
          await verifyFirebaseIdToken(cleanMobile, firebaseIdToken);
          return { ok: true, status: 200 };
        } catch (e) {
          const status = Number(e?.status) || 401;
          return { ok: false, status, error: e?.message || 'Firebase verification failed' };
        }
      })()
    : await verifyOtpForPurpose(cleanMobile, mobileHash, otp, OTP_PURPOSE_LOGIN);
  if (!verified.ok) {
    logAuthEvent({
      userId: user.id,
      mobileHash,
      eventType: 'otp_login_failed',
      authMethod: 'otp',
      status: 'failed',
      reason: String(verified.error || 'otp_verify_failed'),
      context,
      req
    });
    return res.status(verified.status).json({ error: verified.error });
  }

  const nowIsoStr = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIsoStr, user.id);
  upsertUserDevice(user.id, context, req);
  const token = createSessionToken();
  createBoundSession({
    userId: user.id,
    token,
    authMethod: 'otp',
    context,
    req,
    createdAt: nowIsoStr
  });
  logAuthEvent({
    userId: user.id,
    mobileHash,
    eventType: 'otp_login_success',
    authMethod: 'otp',
    status: 'ok',
    context,
    req
  });

  return res.json({ token, user: publicUser(user) });
});

router.post('/mpin/reset/request', async (req, res) => {
  const cleanMobile = normalizeMobile(req.body?.mobile);
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid Indian mobile number is required' });
  }
  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT id, mobile_hash FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }
  if (requireUnlockedReset(res, user.id, 'mpin_reset')) return;

  const otpResp = await sendOtpForPurpose(cleanMobile, mobileHash, OTP_PURPOSE_MPIN_RESET, req.body || {});
  logSecurityEvent({
    userId: user.id,
    mobileHash,
    eventType: 'mpin_reset_otp_requested',
    status: otpResp.ok ? 'ok' : 'error',
    ipAddress: String(req.ip || ''),
    meta: { status: otpResp.status }
  });
  return res.status(otpResp.status).json(otpResp.body);
});

router.post('/mpin/reset/confirm', async (req, res) => {
  const cleanMobile = normalizeMobile(req.body?.mobile);
  const otp = String(req.body?.otp || '');
  const firebaseIdToken = String(req.body?.firebase_id_token || '');
  const newMpin = String(req.body?.new_mpin || '');
  if (!isValidIndianMobile(cleanMobile) || (!otp && !firebaseIdToken) || !/^\d{4,6}$/.test(newMpin)) {
    return res.status(400).json({ error: 'mobile, otp (or firebase_id_token) and new_mpin (4-6 digits) are required' });
  }

  const mobileHash = hashLookup(cleanMobile);
  const user = db.prepare('SELECT id, mobile_hash FROM users WHERE mobile_hash = ?').get(mobileHash);
  if (!user) {
    return res.status(404).json({ error: 'Account not found for this mobile number' });
  }
  if (requireUnlockedReset(res, user.id, 'mpin_reset')) return;

  const verified = firebaseIdToken
    ? await (async () => {
        try {
          await verifyFirebaseIdToken(cleanMobile, firebaseIdToken);
          return { ok: true, status: 200 };
        } catch (e) {
          const status = Number(e?.status) || 401;
          return { ok: false, status, error: e?.message || 'Firebase verification failed' };
        }
      })()
    : await verifyOtpForPurpose(cleanMobile, mobileHash, otp, OTP_PURPOSE_MPIN_RESET);
  if (!verified.ok) {
    if (verified.status === 401) {
      const lockState = registerResetFailure(user.id, 'mpin_reset');
      logSecurityEvent({
        userId: user.id,
        mobileHash,
        eventType: 'mpin_reset_failed_otp',
        status: lockState.locked ? 'locked' : 'failed',
        ipAddress: String(req.ip || '')
      });
      if (lockState.locked) {
        return res.status(429).json({
          error: 'Too many failed attempts. Please try again later.',
          retry_after_seconds: lockState.retryAfterSeconds
        });
      }
    }
    return res.status(verified.status).json({ error: verified.error });
  }

  clearResetFailures(user.id, 'mpin_reset');
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET mpin_hash = ?, last_login_at = ? WHERE id = ?')
      .run(hashPin(newMpin), nowIso(), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  });
  tx();

  logSecurityEvent({
    userId: user.id,
    mobileHash,
    eventType: 'mpin_reset_success',
    status: 'ok',
    ipAddress: String(req.ip || '')
  });
  notifyOwnerAndFamily({
    ownerUserId: user.id,
    type: 'security_event',
    title: 'Login MPIN reset',
    body: 'Login MPIN was reset via OTP. If this was not you, secure your account immediately.',
    payload: { event: 'mpin_reset_success' }
  });

  return res.json({ ok: true, message: 'MPIN reset successful. Please login again.' });
});

router.post('/security-pin/reset/request', requireAuth, async (req, res) => {
  const userId = req.userId;
  if (requireUnlockedReset(res, userId, 'security_pin_reset')) return;

  const cleanMobile = normalizeMobile(req.user?.mobile);
  if (!isValidIndianMobile(cleanMobile)) {
    return res.status(400).json({ error: 'Valid mobile not available for this account' });
  }
  const mobileHash = hashLookup(cleanMobile);
  const otpResp = await sendOtpForPurpose(cleanMobile, mobileHash, OTP_PURPOSE_SECURITY_PIN_RESET, req.body || {});
  logSecurityEvent({
    userId,
    actorUserId: req.userId,
    mobileHash,
    eventType: 'security_pin_reset_otp_requested',
    status: otpResp.ok ? 'ok' : 'error',
    ipAddress: String(req.ip || ''),
    meta: { status: otpResp.status }
  });
  return res.status(otpResp.status).json(otpResp.body);
});

router.post('/security-pin/reset/confirm', requireAuth, async (req, res) => {
  const userId = req.userId;
  const otp = String(req.body?.otp || '');
  const firebaseIdToken = String(req.body?.firebase_id_token || '');
  const newPin = String(req.body?.new_pin || '');
  if ((!otp && !firebaseIdToken) || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'otp (or firebase_id_token) and new_pin (4 digits) are required' });
  }
  if (requireUnlockedReset(res, userId, 'security_pin_reset')) return;

  const cleanMobile = normalizeMobile(req.user?.mobile);
  const mobileHash = hashLookup(cleanMobile);
  const verified = firebaseIdToken
    ? await (async () => {
        try {
          await verifyFirebaseIdToken(cleanMobile, firebaseIdToken);
          return { ok: true, status: 200 };
        } catch (e) {
          const status = Number(e?.status) || 401;
          return { ok: false, status, error: e?.message || 'Firebase verification failed' };
        }
      })()
    : await verifyOtpForPurpose(cleanMobile, mobileHash, otp, OTP_PURPOSE_SECURITY_PIN_RESET);
  if (!verified.ok) {
    if (verified.status === 401) {
      const lockState = registerResetFailure(userId, 'security_pin_reset');
      logSecurityEvent({
        userId,
        actorUserId: req.userId,
        mobileHash,
        eventType: 'security_pin_reset_failed_otp',
        status: lockState.locked ? 'locked' : 'failed',
        ipAddress: String(req.ip || '')
      });
      if (lockState.locked) {
        return res.status(429).json({
          error: 'Too many failed attempts. Please try again later.',
          retry_after_seconds: lockState.retryAfterSeconds
        });
      }
    }
    return res.status(verified.status).json({ error: verified.error });
  }

  clearResetFailures(userId, 'security_pin_reset');
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, 'privacy_pin', ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `).run(userId, encryptString(newPin), nowIso());
  db.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, 'privacy_pin_enabled', '1', ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value='1',
      updated_at=excluded.updated_at
  `).run(userId, nowIso());

  logSecurityEvent({
    userId,
    actorUserId: req.userId,
    mobileHash,
    eventType: 'security_pin_reset_success',
    status: 'ok',
    ipAddress: String(req.ip || '')
  });
  notifyOwnerAndFamily({
    ownerUserId: userId,
    type: 'security_event',
    title: 'Security PIN reset',
    body: 'Security PIN for sensitive details was reset using OTP verification.',
    payload: { event: 'security_pin_reset_success', actor_user_id: req.userId }
  });

  return res.json({ ok: true, message: 'Security PIN reset successful.' });
});

router.post('/security/context', requireAuth, (req, res) => {
  const context = extractDeviceContext(req, req.body?.device_context);
  upsertUserDevice(req.userId, context, req);
  return res.json({ ok: true });
});

router.get('/security/devices', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT id, device_id, platform, os_version, app_version, app_build, device_name, device_model,
             timezone, locale, first_seen_at, last_seen_at, last_seen_ip, trusted, revoked_at
      FROM user_devices
      WHERE user_id = ?
      ORDER BY trusted DESC, last_seen_at DESC
    `
    )
    .all(req.userId);
  return res.json({ items: rows });
});

router.delete('/security/devices/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare('SELECT id, device_id FROM user_devices WHERE id = ? AND user_id = ? LIMIT 1')
    .get(id, req.userId);
  if (!row) return res.status(404).json({ error: 'device_not_found' });

  db.prepare('UPDATE user_devices SET trusted = 0, revoked_at = ? WHERE id = ? AND user_id = ?').run(
    nowIso(),
    id,
    req.userId
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND device_id = ?').run(req.userId, row.device_id);

  logAuthEvent({
    userId: req.userId,
    mobileHash: hashLookup(normalizeMobile(req.user?.mobile || '')),
    eventType: 'device_revoked',
    authMethod: 'session',
    status: 'ok',
    reason: 'manual_revoke',
    context: { device_id: row.device_id },
    req
  });

  return res.json({ ok: true });
});

router.get('/security/login-events', requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const rows = db
    .prepare(
      `
      SELECT id, event_type, auth_method, status, reason, device_id, platform, os_version,
             app_version, app_build, device_name, device_model, timezone, locale,
             geo_lat, geo_lng, geo_accuracy_m, ip_address, user_agent, meta, created_at
      FROM auth_login_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(req.userId, limit);
  return res.json({ items: rows });
});

router.get('/security/incident-report', requireAuth, (req, res) => {
  const limit = Math.max(20, Math.min(1000, Number(req.query.limit || 300)));
  const devices = db
    .prepare(
      `
      SELECT id, device_id, platform, os_version, app_version, app_build,
             device_name, device_model, timezone, locale, first_seen_at, last_seen_at,
             last_seen_ip, trusted, revoked_at
      FROM user_devices
      WHERE user_id = ?
      ORDER BY last_seen_at DESC
    `
    )
    .all(req.userId);

  const loginEvents = db
    .prepare(
      `
      SELECT id, event_type, auth_method, status, reason, device_id, platform, os_version,
             app_version, app_build, device_name, device_model, timezone, locale,
             geo_lat, geo_lng, geo_accuracy_m, ip_address, user_agent, meta, created_at
      FROM auth_login_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(req.userId, limit);

  const securityEvents = db
    .prepare(
      `
      SELECT id, event_type, status, ip_address, meta, created_at
      FROM security_event_log
      WHERE user_id = ? OR actor_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(req.userId, req.userId, limit);

  const sensitiveAccessEvents = db
    .prepare(
      `
      SELECT id, owner_user_id, actor_user_id, entity_type, entity_id, action, ip_address, created_at
      FROM sensitive_access_log
      WHERE owner_user_id = ? OR actor_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(req.userId, req.userId, limit);

  return res.json({
    generated_at: nowIso(),
    user_id: req.userId,
    devices,
    login_events: loginEvents,
    security_events: securityEvents,
    sensitive_access_events: sensitiveAccessEvents
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req, res) => {
  logAuthEvent({
    userId: req.userId,
    mobileHash: hashLookup(normalizeMobile(req.user?.mobile || '')),
    eventType: 'logout',
    authMethod: 'session',
    status: 'ok',
    context: req.deviceContext || extractDeviceContext(req, null),
    req
  });
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  res.status(204).send();
});

export default router;
