import { Router } from 'express';

const router = Router();

const IOS_BUNDLE_ID = String(process.env.IOS_BUNDLE_ID || 'com.networthmanager.app').trim();
const ANDROID_PACKAGE_ID = String(process.env.ANDROID_PACKAGE_ID || 'com.networthmanager.app').trim();

function normalizeVersion(value = '') {
  return String(value || '').trim();
}

function compareVersions(left = '', right = '') {
  const leftParts = normalizeVersion(left).split(/[^\d]+/).filter(Boolean).map(Number);
  const rightParts = normalizeVersion(right).split(/[^\d]+/).filter(Boolean).map(Number);
  const max = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < max; index += 1) {
    const a = Number(leftParts[index] || 0);
    const b = Number(rightParts[index] || 0);
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function fetchIosStoreVersion() {
  if (!IOS_BUNDLE_ID) return null;
  try {
    const response = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(IOS_BUNDLE_ID)}`);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const result = Array.isArray(payload?.results) ? payload.results[0] : null;
    const latestVersion = normalizeVersion(result?.version);
    if (!latestVersion) return null;
    return {
      latestVersion,
      storeUrl: normalizeVersion(result?.trackViewUrl),
      source: 'app_store'
    };
  } catch (_error) {
    return null;
  }
}

async function fetchAndroidStoreVersion() {
  if (!ANDROID_PACKAGE_ID) return null;
  const storeUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PACKAGE_ID)}&hl=en&gl=us`;
  try {
    const response = await fetch(storeUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'
      }
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html || /requested url was not found/i.test(html)) return null;
    const latestVersion =
      normalizeVersion(html.match(/"softwareVersion":"([^"]+)"/i)?.[1]) ||
      normalizeVersion(html.match(/itemprop="softwareVersion"[^>]*>\s*([^<]+)\s*</i)?.[1]) ||
      normalizeVersion(html.match(/Current Version[^0-9A-Za-z]*([0-9][0-9A-Za-z._-]*)/i)?.[1]);
    if (!latestVersion) return null;
    return {
      latestVersion,
      storeUrl,
      source: 'play_store'
    };
  } catch (_error) {
    return null;
  }
}

function envFallback(platform = '') {
  if (platform === 'ios') {
    return {
      latestVersion: normalizeVersion(process.env.IOS_LATEST_VERSION),
      storeUrl: normalizeVersion(process.env.IOS_APP_STORE_URL),
      source: 'env'
    };
  }
  return {
    latestVersion: normalizeVersion(process.env.ANDROID_LATEST_VERSION),
    storeUrl:
      normalizeVersion(process.env.ANDROID_PLAY_STORE_URL) ||
      (ANDROID_PACKAGE_ID ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PACKAGE_ID)}` : ''),
    source: 'env'
  };
}

router.get('/version-check', async (req, res) => {
  const platform = String(req.query?.platform || '').trim().toLowerCase();
  const currentVersion = normalizeVersion(req.query?.current_version);
  if (platform !== 'ios' && platform !== 'android') {
    return res.status(400).json({ error: 'platform must be ios or android' });
  }

  const liveInfo = platform === 'ios' ? await fetchIosStoreVersion() : await fetchAndroidStoreVersion();
  const fallback = envFallback(platform);
  const latestVersion = normalizeVersion(liveInfo?.latestVersion || fallback.latestVersion);
  const storeUrl = normalizeVersion(liveInfo?.storeUrl || fallback.storeUrl);
  const updateAvailable = Boolean(latestVersion && currentVersion && compareVersions(currentVersion, latestVersion) < 0);

  return res.json({
    platform,
    current_version: currentVersion || null,
    latest_version: latestVersion || null,
    store_url: storeUrl || null,
    source: liveInfo?.source || fallback.source || null,
    update_available: updateAvailable
  });
});

export default router;
