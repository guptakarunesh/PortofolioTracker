import { Router } from 'express';
import { nowIso } from '../lib/db.js';
import {
  getSharedCuratedNewsRefreshStatus,
  getSharedCuratedNewsState,
  triggerSharedCuratedNewsRefresh
} from '../lib/newsPipeline.js';
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

function summarizeRefreshJobState(state = {}) {
  return {
    running: Boolean(state?.running),
    trigger: String(state?.trigger || ''),
    requested_at: String(state?.requested_at || ''),
    started_at: String(state?.started_at || ''),
    finished_at: String(state?.finished_at || ''),
    last_error: String(state?.last_error || ''),
    last_result: state?.last_result
      ? {
          refreshed: Boolean(state.last_result.refreshed),
          count: Number(state.last_result.count || 0),
          meaningful_count: Number(state.last_result.meaningful_count || 0),
          stale: Boolean(state.last_result.stale),
          ingest_ok: state.last_result.ingest_ok !== false,
          ingest_warning: String(state.last_result.ingest_warning || ''),
          ingest_error: String(state.last_result.ingest_error || '')
        }
      : null
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

router.get('/cron/ping', (req, res) => {
  const includeDbState = String(req.query.include_db_state || '') === '1';
  let state = null;
  let stateError = '';
  if (includeDbState) {
    try {
      state = getSharedCuratedNewsState({ staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS });
    } catch (error) {
      stateError = String(error?.message || error);
    }
  }
  return res.json({
    ok: true,
    now: nowIso(),
    shared_curated_news: state ? summarizeSharedCuratedNewsState(state) : null,
    shared_curated_news_error: stateError,
    refresh_job: summarizeRefreshJobState(getSharedCuratedNewsRefreshStatus())
  });
});

router.post('/cron/shared-news/maintenance', (_req, res, next) => {
  try {
    const refresh = triggerSharedCuratedNewsRefresh({
      apiKey: resolveOpenAiApiKey(),
      country: SHARED_CURATED_NEWS_COUNTRY,
      staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS,
      forceRefresh: false,
      trigger: 'maintenance'
    });

    return res.status(202).json({
      ok: true,
      action: refresh.already_running ? 'refresh_already_running' : 'refresh_started',
      now: nowIso(),
      refresh_job: summarizeRefreshJobState(refresh.status)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/cron/shared-news/refresh', (_req, res, next) => {
  try {
    const refresh = triggerSharedCuratedNewsRefresh({
      apiKey: resolveOpenAiApiKey(),
      country: SHARED_CURATED_NEWS_COUNTRY,
      staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS,
      forceRefresh: true,
      trigger: 'force_refresh'
    });

    return res.status(202).json({
      ok: true,
      action: refresh.already_running ? 'force_refresh_already_running' : 'force_refresh_started',
      now: nowIso(),
      refresh_job: summarizeRefreshJobState(refresh.status)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
