import { Router } from 'express';
import { nowIso } from '../lib/db.js';
import { ensureSharedCuratedNewsFresh, getSharedCuratedNewsState } from '../lib/newsPipeline.js';
import { resolveOpenAiApiKey } from '../lib/openai.js';

const router = Router();

const SHARED_CURATED_NEWS_COUNTRY = String(process.env.SHARED_CURATED_NEWS_COUNTRY || 'IN').trim().toUpperCase() || 'IN';
const SHARED_CURATED_NEWS_REFRESH_HOURS = Math.max(
  1,
  Number.parseInt(process.env.SHARED_CURATED_NEWS_REFRESH_HOURS || '12', 10)
);

function summarizeSharedCuratedNewsState(state = {}) {
  return {
    count: Number(state?.count || 0),
    meaningful_count: Number(state?.meaningful_count || 0),
    stale: Boolean(state?.stale),
    age_hours: state?.age_hours == null ? null : Number(state.age_hours),
    last_success_at: String(state?.last_success_at || ''),
    last_run_status: String(state?.last_run_status || ''),
    last_run_message: String(state?.last_run_message || ''),
    last_run_finished_at: String(state?.last_run_finished_at || '')
  };
}

function extractProvidedSecret(req) {
  const bearer = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const direct = String(req.headers['x-internal-cron-secret'] || '').trim();
  return direct || bearer;
}

function requireInternalCronSecret(req, res, next) {
  const expected = String(process.env.INTERNAL_CRON_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'internal_cron_secret_missing' });
  }
  const provided = extractProvidedSecret(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'unauthorized_internal_cron' });
  }
  return next();
}

router.use('/cron', requireInternalCronSecret);

router.get('/cron/ping', (_req, res) => {
  const state = getSharedCuratedNewsState({ staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS });
  return res.json({
    ok: true,
    now: nowIso(),
    shared_curated_news: summarizeSharedCuratedNewsState(state)
  });
});

router.post('/cron/shared-news/maintenance', async (_req, res, next) => {
  try {
    const before = getSharedCuratedNewsState({ staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS });
    if (!before.stale && before.meaningful_count >= 8) {
      return res.json({
        ok: true,
        action: 'noop',
        now: nowIso(),
        shared_curated_news: summarizeSharedCuratedNewsState(before)
      });
    }

    const refreshed = await ensureSharedCuratedNewsFresh({
      apiKey: resolveOpenAiApiKey(),
      country: SHARED_CURATED_NEWS_COUNTRY,
      staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS,
      forceRefresh: true
    });

    return res.json({
      ok: refreshed.ingest_ok !== false,
      action: 'refresh_attempted',
      now: nowIso(),
      ingest_warning: refreshed.ingest_warning || '',
      ingest_error: refreshed.ingest_error || '',
      shared_curated_news: summarizeSharedCuratedNewsState(refreshed)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/cron/shared-news/refresh', async (_req, res, next) => {
  try {
    const refreshed = await ensureSharedCuratedNewsFresh({
      apiKey: resolveOpenAiApiKey(),
      country: SHARED_CURATED_NEWS_COUNTRY,
      staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS,
      forceRefresh: true
    });

    return res.json({
      ok: refreshed.ingest_ok !== false,
      action: 'force_refresh_attempted',
      now: nowIso(),
      ingest_warning: refreshed.ingest_warning || '',
      ingest_error: refreshed.ingest_error || '',
      shared_curated_news: summarizeSharedCuratedNewsState(refreshed)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
