import { db, nowIso } from './db.js';

const AUTH_TOUCH_MIN_INTERVAL_MS = Math.max(
  1000,
  Number.parseInt(process.env.AUTH_TOUCH_MIN_INTERVAL_MS || '15000', 10)
);
const recentSessionTouches = new Map();
const recentDeviceTouches = new Map();

function clampString(value, maxLen = 120) {
  return String(value || '').trim().slice(0, maxLen);
}

function toNullableNumber(value, digits = null) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (digits == null) return n;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function getClientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  const viaForwarded = fwd.split(',').map((v) => v.trim()).find(Boolean);
  return clampString(viaForwarded || req.ip || '', 128);
}

export function extractDeviceContext(req, bodyContext = null) {
  const body = bodyContext && typeof bodyContext === 'object' ? bodyContext : {};
  const headerDeviceId = String(req.headers['x-device-id'] || '').trim();
  const headerTimezone = String(req.headers['x-client-timezone'] || '').trim();
  const headerLocale = String(req.headers['x-client-locale'] || '').trim();
  const headerPlatform = String(req.headers['x-client-platform'] || '').trim();
  const headerAppVersion = String(req.headers['x-app-version'] || '').trim();
  const headerOsVersion = String(req.headers['x-os-version'] || '').trim();

  const deviceId = clampString(body.device_id || headerDeviceId, 128);
  return {
    device_id: deviceId,
    platform: clampString(body.platform || headerPlatform, 32),
    os_version: clampString(body.os_version || headerOsVersion, 32),
    app_version: clampString(body.app_version || headerAppVersion, 32),
    app_build: clampString(body.app_build, 32),
    device_name: clampString(body.device_name, 80),
    device_model: clampString(body.device_model, 80),
    timezone: clampString(body.timezone || headerTimezone, 64),
    locale: clampString(body.locale || headerLocale, 24),
    geo_lat: toNullableNumber(body.geo_lat, 2),
    geo_lng: toNullableNumber(body.geo_lng, 2),
    geo_accuracy_m: toNullableNumber(body.geo_accuracy_m, 0)
  };
}

function rememberTouch(map, key, nowMs = Date.now()) {
  if (!key) return false;
  const lastSeen = Number(map.get(key) || 0);
  if (lastSeen && nowMs - lastSeen < AUTH_TOUCH_MIN_INTERVAL_MS) {
    return false;
  }
  map.set(key, nowMs);
  if (map.size > 5000) {
    const cutoff = nowMs - AUTH_TOUCH_MIN_INTERVAL_MS * 4;
    for (const [entryKey, ts] of map.entries()) {
      if (ts < cutoff) map.delete(entryKey);
    }
  }
  return true;
}

export function countTrustedDevices(userId) {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM user_devices WHERE user_id = ? AND trusted = 1 AND revoked_at IS NULL')
    .get(userId);
  return Number(row?.c || 0);
}

export function isTrustedDevice(userId, deviceId) {
  if (!deviceId) return false;
  const row = db
    .prepare(
      `
      SELECT id
      FROM user_devices
      WHERE user_id = ? AND device_id = ? AND trusted = 1 AND revoked_at IS NULL
      LIMIT 1
    `
    )
    .get(userId, deviceId);
  return Boolean(row?.id);
}

export function upsertUserDevice(userId, context, req) {
  const deviceId = clampString(context?.device_id, 128);
  if (!deviceId) return null;
  const now = nowIso();
  const ip = getClientIp(req);
  const userAgent = clampString(req.headers['user-agent'] || '', 320);

  db.prepare(
    `
    INSERT INTO user_devices (
      user_id, device_id, platform, os_version, app_version, app_build,
      device_name, device_model, timezone, locale,
      last_lat, last_lng, last_accuracy_m,
      first_seen_at, last_seen_at, last_seen_ip, last_seen_user_agent, trusted, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      platform=excluded.platform,
      os_version=excluded.os_version,
      app_version=excluded.app_version,
      app_build=excluded.app_build,
      device_name=excluded.device_name,
      device_model=excluded.device_model,
      timezone=excluded.timezone,
      locale=excluded.locale,
      last_lat=excluded.last_lat,
      last_lng=excluded.last_lng,
      last_accuracy_m=excluded.last_accuracy_m,
      last_seen_at=excluded.last_seen_at,
      last_seen_ip=excluded.last_seen_ip,
      last_seen_user_agent=excluded.last_seen_user_agent,
      trusted=1,
      revoked_at=NULL
  `
  ).run(
    userId,
    deviceId,
    context?.platform || '',
    context?.os_version || '',
    context?.app_version || '',
    context?.app_build || '',
    context?.device_name || '',
    context?.device_model || '',
    context?.timezone || '',
    context?.locale || '',
    context?.geo_lat,
    context?.geo_lng,
    context?.geo_accuracy_m,
    now,
    now,
    ip,
    userAgent
  );

  return { device_id: deviceId, last_seen_at: now, ip, user_agent: userAgent };
}

export function safeUpsertUserDevice(userId, context, req) {
  try {
    return upsertUserDevice(userId, context, req);
  } catch (error) {
    console.warn('[auth] device upsert skipped', {
      user_id: userId,
      device_id: String(context?.device_id || '').trim(),
      error: String(error?.message || error)
    });
    return null;
  }
}

export function touchSession(sessionTokenHash, req) {
  const now = nowIso();
  db.prepare(
    `
    UPDATE sessions
    SET last_seen_at = ?, last_seen_ip = ?, last_seen_user_agent = ?
    WHERE token_hash = ?
  `
  ).run(now, getClientIp(req), clampString(req.headers['user-agent'] || '', 320), sessionTokenHash);
}

export function safeTouchSession(sessionTokenHash, req) {
  const tokenHash = String(sessionTokenHash || '').trim();
  if (!tokenHash) return false;
  if (!rememberTouch(recentSessionTouches, tokenHash)) return false;
  try {
    touchSession(tokenHash, req);
    return true;
  } catch (error) {
    console.warn('[auth] session touch skipped', {
      error: String(error?.message || error)
    });
    return false;
  }
}

export function touchDeviceForUser(userId, context, req) {
  const deviceId = clampString(context?.device_id, 128);
  if (!deviceId) return;
  db.prepare(
    `
    UPDATE user_devices
    SET last_seen_at = ?, last_seen_ip = ?, last_seen_user_agent = ?,
        timezone = COALESCE(NULLIF(?, ''), timezone),
        locale = COALESCE(NULLIF(?, ''), locale)
    WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL
  `
  ).run(
    nowIso(),
    getClientIp(req),
    clampString(req.headers['user-agent'] || '', 320),
    clampString(context?.timezone || '', 64),
    clampString(context?.locale || '', 24),
    userId,
    deviceId
  );
}

export function safeTouchDeviceForUser(userId, context, req) {
  const deviceId = clampString(context?.device_id, 128);
  if (!deviceId) return false;
  const cacheKey = `${userId}:${deviceId}`;
  if (!rememberTouch(recentDeviceTouches, cacheKey)) return false;
  try {
    touchDeviceForUser(userId, context, req);
    return true;
  } catch (error) {
    console.warn('[auth] device touch skipped', {
      user_id: userId,
      device_id: deviceId,
      error: String(error?.message || error)
    });
    return false;
  }
}

export function logAuthEvent({
  userId = null,
  mobileHash = '',
  eventType,
  authMethod = '',
  status = 'ok',
  reason = '',
  context = {},
  req,
  meta = {}
}) {
  if (!eventType) return;
  db.prepare(
    `
    INSERT INTO auth_login_log (
      user_id, mobile_hash, event_type, auth_method, status, reason,
      device_id, platform, os_version, app_version, app_build, device_name, device_model,
      timezone, locale, geo_lat, geo_lng, geo_accuracy_m,
      ip_address, user_agent, meta, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    userId || null,
    clampString(mobileHash, 140),
    clampString(eventType, 64),
    clampString(authMethod, 32),
    clampString(status, 16),
    clampString(reason, 160),
    clampString(context?.device_id, 128),
    clampString(context?.platform, 32),
    clampString(context?.os_version, 32),
    clampString(context?.app_version, 32),
    clampString(context?.app_build, 32),
    clampString(context?.device_name, 80),
    clampString(context?.device_model, 80),
    clampString(context?.timezone, 64),
    clampString(context?.locale, 24),
    toNullableNumber(context?.geo_lat, 2),
    toNullableNumber(context?.geo_lng, 2),
    toNullableNumber(context?.geo_accuracy_m, 0),
    getClientIp(req),
    clampString(req.headers['user-agent'] || '', 320),
    JSON.stringify(meta || {}),
    nowIso()
  );
}
