import { db, nowIso } from './db.js';
import {
  CURATED_NEWS_CATEGORIES,
  CURATED_NEWS_SOURCES,
  GOLD_SILVER_SOURCE_KEYS,
  NEWS_MAX_AGE_HOURS,
  categoryByKey,
  sourceByKey,
  sourceByName,
  sourceByUrl
} from './newsSources.js';
import { resolveOpenAiApiKey } from './openai.js';

const INGEST_MODEL_FALLBACK = 'gpt-5-nano';
const INSIGHT_MODEL_FALLBACK = 'gpt-5-nano';
const NEWS_RETENTION_DAYS = 7;
const SHARED_CURATED_NEWS_REFRESH_HOURS = Math.max(
  1,
  Number.parseInt(process.env.SHARED_CURATED_NEWS_REFRESH_HOURS || '12', 10)
);
const SHARED_CURATED_NEWS_COUNTRY = String(process.env.SHARED_CURATED_NEWS_COUNTRY || 'IN').trim().toUpperCase() || 'IN';
const SHARED_CURATED_NEWS_BOOTSTRAP_ON_START = (() => {
  const raw = String(process.env.SHARED_CURATED_NEWS_BOOTSTRAP_ON_START || '').trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'off', 'no'].includes(raw);
})();
const INGEST_RETRY_COOLDOWN_MS = Math.max(
  5 * 60 * 1000,
  Number.parseInt(process.env.NEWS_INGEST_RETRY_COOLDOWN_MS || '900000', 10)
);
const SHARED_CURATED_NEWS_JOB_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.SHARED_CURATED_NEWS_JOB_TIMEOUT_MS || '180000', 10)
);

const sharedCuratedNewsMemory = {
  items: [],
  updated_at: '',
  last_run_status: '',
  last_run_message: '',
  last_run_finished_at: '',
  last_run_metadata: {}
};

function resolveSharedNewsModel(fallback = INSIGHT_MODEL_FALLBACK) {
  return String(process.env.OPENAI_NEWS_MODEL || process.env.OPENAI_MODEL || fallback).trim() || fallback;
}

export function resolveNewsIngestModel() {
  return String(process.env.OPENAI_NEWS_INGEST_MODEL || '').trim() || resolveSharedNewsModel(INGEST_MODEL_FALLBACK);
}

export function resolveNewsInsightModel() {
  return resolveSharedNewsModel(INSIGHT_MODEL_FALLBACK);
}

function safeJsonParse(raw, fallback = null) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (_e) {
    return fallback;
  }
}

function extractJsonCandidate(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return String(fenced[1]).trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);

  const arrStart = raw.indexOf('[');
  const arrEnd = raw.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) return `{"items":${raw.slice(arrStart, arrEnd + 1)}}`;

  return raw;
}

function parseStrictOrRecoveredJson(text = '') {
  const direct = safeJsonParse(text, null);
  if (direct && typeof direct === 'object') return direct;

  const candidate = extractJsonCandidate(text);
  const recovered = safeJsonParse(candidate, null);
  if (recovered && typeof recovered === 'object') return recovered;

  throw new Error(`Model output was not valid JSON: ${String(text || '').slice(0, 160)}`);
}

function extractResponseOutputText(parsed = {}) {
  const direct = typeof parsed?.output_text === 'string' ? parsed.output_text.trim() : '';
  if (direct) return direct;
  if (Array.isArray(parsed?.output_text)) {
    const joinedDirect = parsed.output_text
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (joinedDirect) return joinedDirect;
  }

  if (!Array.isArray(parsed?.output)) return '';
  const chunks = parsed.output
    .filter((item) => item?.type === 'message')
    .flatMap((item) => item?.content || []);

  const parts = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    if (chunk.type === 'output_text' || chunk.type === 'text') {
      const textValue =
        (typeof chunk.text === 'string' && chunk.text) ||
        (typeof chunk?.text?.value === 'string' && chunk.text.value) ||
        (Array.isArray(chunk?.text) &&
          chunk.text
            .map((entry) => (typeof entry === 'string' ? entry : entry?.value || entry?.text || ''))
            .filter(Boolean)
            .join('\n')) ||
        (typeof chunk.value === 'string' && chunk.value) ||
        (typeof chunk.output_text === 'string' && chunk.output_text) ||
        '';
      if (textValue) parts.push(textValue);
      continue;
    }
    if (chunk.type === 'json' && chunk.json && typeof chunk.json === 'object') {
      parts.push(JSON.stringify(chunk.json));
      continue;
    }
    if (typeof chunk.arguments === 'string' && chunk.arguments.trim()) {
      parts.push(chunk.arguments.trim());
      continue;
    }
  }
  return parts.join('\n').trim();
}

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCatalogFallbackTitle(title = '') {
  return /latest update feed$/i.test(normalizeWhitespace(title));
}

function isCatalogFallbackItem(item = {}) {
  return isCatalogFallbackTitle(item?.title || '');
}

function countMeaningfulItems(items = []) {
  return Array.isArray(items) ? items.filter((item) => !isCatalogFallbackItem(item)).length : 0;
}

export function isMeaningfulCuratedNewsItem(item = {}) {
  return !isCatalogFallbackItem(item);
}

export function filterMeaningfulCuratedNewsItems(items = []) {
  return Array.isArray(items) ? items.filter((item) => isMeaningfulCuratedNewsItem(item)) : [];
}

function normalizeCategory(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  return CURATED_NEWS_CATEGORIES.find((item) => item.key === raw)?.key || 'other_savings';
}

function normalizeUrl(value = '') {
  const raw = String(value || '')
    .replace(/\u0000/g, '')
    .trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((key) =>
      url.searchParams.delete(key)
    );
    url.hash = '';
    return url.toString();
  } catch (_e) {
    return raw;
  }
}

function titleKey(value = '') {
  return normalizeWhitespace(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' '));
}

function contentHash(item) {
  return `${item.category}|${item.source_key}|${titleKey(item.title)}`.slice(0, 512);
}

function parseIsoDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function withinFreshWindow(dateValue, maxAgeHours = NEWS_MAX_AGE_HOURS) {
  const dt = parseIsoDate(dateValue);
  if (!dt) return false;
  return Date.now() - dt.getTime() <= maxAgeHours * 60 * 60 * 1000;
}

function dedupeItems(items = []) {
  const seen = new Map();
  for (const item of items) {
    const key = item.canonical_url || item.content_hash;
    const current = seen.get(key);
    if (!current) {
      seen.set(key, item);
      continue;
    }
    if ((item.source_priority || 0) > (current.source_priority || 0)) {
      seen.set(key, item);
      continue;
    }
    if ((item.published_at || '') > (current.published_at || '')) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function snapshotCuratedNewsItems(items = []) {
  return dedupeItems((Array.isArray(items) ? items : []).filter(Boolean)).map((item) => ({
    ...item,
    metadata: { ...(item?.metadata || {}) }
  }));
}

function setSharedCuratedNewsMemoryItems(items = []) {
  const nextItems = snapshotCuratedNewsItems(items);
  if (!countMeaningfulItems(nextItems)) return false;
  sharedCuratedNewsMemory.items = nextItems;
  sharedCuratedNewsMemory.updated_at = nowIso();
  return true;
}

function setSharedCuratedNewsMemoryRunMeta({
  status = '',
  message = '',
  metadata = {},
  finishedAt = ''
} = {}) {
  sharedCuratedNewsMemory.last_run_status = String(status || '');
  sharedCuratedNewsMemory.last_run_message = String(message || '');
  sharedCuratedNewsMemory.last_run_finished_at = String(finishedAt || nowIso());
  sharedCuratedNewsMemory.last_run_metadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
}

function buildSharedCuratedNewsState({
  items = [],
  staleAfterHours = SHARED_CURATED_NEWS_REFRESH_HOURS,
  lastRunStatus = '',
  lastRunMessage = '',
  lastRunFinishedAt = '',
  lastRunMetadata = {}
} = {}) {
  const list = snapshotCuratedNewsItems(items);
  const meaningfulItems = filterMeaningfulCuratedNewsItems(list);
  const latestMeaningfulMs = latestFreshTimestamp(meaningfulItems);
  const lastSuccessAt = latestMeaningfulMs ? new Date(latestMeaningfulMs).toISOString() : '';
  const staleAfterMs = Math.max(1, Number(staleAfterHours || SHARED_CURATED_NEWS_REFRESH_HOURS)) * 60 * 60 * 1000;
  const ageMs = latestMeaningfulMs ? Math.max(0, Date.now() - latestMeaningfulMs) : Number.POSITIVE_INFINITY;
  return {
    items: list,
    meaningful_items: meaningfulItems,
    count: list.length,
    meaningful_count: meaningfulItems.length,
    stale: !latestMeaningfulMs || ageMs > staleAfterMs,
    age_hours: Number.isFinite(ageMs) ? Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10 : null,
    last_success_at: lastSuccessAt,
    last_run_status: String(lastRunStatus || ''),
    last_run_message: String(lastRunMessage || ''),
    last_run_finished_at: String(lastRunFinishedAt || ''),
    last_run_metadata: lastRunMetadata && typeof lastRunMetadata === 'object' ? { ...lastRunMetadata } : {}
  };
}

function getSharedCuratedNewsMemoryState({
  staleAfterHours = SHARED_CURATED_NEWS_REFRESH_HOURS,
  limit = 60
} = {}) {
  if (!sharedCuratedNewsMemory.items.length) return null;
  return buildSharedCuratedNewsState({
    items: sharedCuratedNewsMemory.items.slice(0, limit),
    staleAfterHours,
    lastRunStatus: sharedCuratedNewsMemory.last_run_status,
    lastRunMessage: sharedCuratedNewsMemory.last_run_message,
    lastRunFinishedAt: sharedCuratedNewsMemory.last_run_finished_at,
    lastRunMetadata: sharedCuratedNewsMemory.last_run_metadata
  });
}

function pruneOldNews() {
  const cutoff = new Date(Date.now() - NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM news_items WHERE published_at < ?').run(cutoff);
}

function purgeCatalogFallbackItems() {
  db.prepare("DELETE FROM news_items WHERE LOWER(TRIM(title)) LIKE '%latest update feed'").run();
}

function logIngestRun({ status = 'ok', source = 'pipeline', itemCount = 0, message = '', metadata = {}, startedAt, finishedAt }) {
  db.prepare(`
    INSERT INTO news_ingest_runs (status, source, item_count, message, metadata, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    status,
    source,
    Number(itemCount || 0),
    String(message || ''),
    JSON.stringify(metadata || {}),
    String(startedAt || nowIso()),
    String(finishedAt || nowIso())
  );
}

function upsertNewsItem(item) {
  db.prepare(`
    INSERT INTO news_items (
      source_key, source_name, source_domain, category, investment_label, title, summary,
      canonical_url, published_at, fetched_at, trust_score, is_official, source_priority,
      content_hash, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_url) DO UPDATE SET
      source_key = excluded.source_key,
      source_name = excluded.source_name,
      source_domain = excluded.source_domain,
      category = excluded.category,
      investment_label = excluded.investment_label,
      title = excluded.title,
      summary = excluded.summary,
      published_at = excluded.published_at,
      fetched_at = excluded.fetched_at,
      trust_score = excluded.trust_score,
      is_official = excluded.is_official,
      source_priority = excluded.source_priority,
      content_hash = excluded.content_hash,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `).run(
    item.source_key,
    item.source_name,
    item.source_domain,
    item.category,
    item.investment_label,
    item.title,
    item.summary,
    item.canonical_url,
    item.published_at,
    item.fetched_at,
    item.trust_score,
    item.is_official ? 1 : 0,
    item.source_priority,
    item.content_hash,
    JSON.stringify(item.metadata || {}),
    nowIso(),
    nowIso()
  );
}

function newsItemDbValues(item, timestamp = nowIso()) {
  return [
    item.source_key,
    item.source_name,
    item.source_domain,
    item.category,
    item.investment_label,
    item.title,
    item.summary,
    item.canonical_url,
    item.published_at,
    item.fetched_at,
    item.trust_score,
    item.is_official ? 1 : 0,
    item.source_priority,
    item.content_hash,
    JSON.stringify(item.metadata || {}),
    timestamp,
    timestamp
  ];
}

function bulkUpsertNewsItems(items = []) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return { changes: 0, lastInsertRowid: null };

  const placeholders = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const sql = `
    INSERT INTO news_items (
      source_key, source_name, source_domain, category, investment_label, title, summary,
      canonical_url, published_at, fetched_at, trust_score, is_official, source_priority,
      content_hash, metadata, created_at, updated_at
    ) VALUES ${rows.map(() => placeholders).join(', ')}
    ON CONFLICT(canonical_url) DO UPDATE SET
      source_key = excluded.source_key,
      source_name = excluded.source_name,
      source_domain = excluded.source_domain,
      category = excluded.category,
      investment_label = excluded.investment_label,
      title = excluded.title,
      summary = excluded.summary,
      published_at = excluded.published_at,
      fetched_at = excluded.fetched_at,
      trust_score = excluded.trust_score,
      is_official = excluded.is_official,
      source_priority = excluded.source_priority,
      content_hash = excluded.content_hash,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `;

  const values = [];
  for (const item of rows) {
    values.push(...newsItemDbValues(item));
  }
  return db.prepare(sql).run(...values);
}

function truncateForLog(value = '', max = 180) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function traceNews(debugContext, stage, details = {}) {
  if (!debugContext?.trace) return;
  const payload = {
    run_id: Number(debugContext?.run_id || 0) || undefined,
    trigger: String(debugContext?.trigger || '') || undefined,
    stage: String(stage || '').trim() || undefined,
    ...details
  };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') delete payload[key];
  });
  console.log('[news][trace]', payload);
}

function persistCuratedNewsItems(items = []) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return { inserted: 0, failures: [] };
  try {
    bulkUpsertNewsItems(rows);
    return { inserted: rows.length, failures: [] };
  } catch (error) {
    const errorText = String(error?.message || error);
    return {
      inserted: 0,
      failures: rows.slice(0, 3).map((item, index) => ({
        canonical_url: truncateForLog(item?.canonical_url || '', 240),
        title: truncateForLog(item?.title || '', 120),
        error: index === 0 ? errorText : 'skipped_after_bulk_failure'
      }))
    };
  }
}

export function getCuratedNews({ maxAgeHours = NEWS_MAX_AGE_HOURS, limit = 24 } = {}) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `
      SELECT id, source_key, source_name, source_domain, category, investment_label, title, summary,
             canonical_url, published_at, fetched_at, trust_score, is_official, source_priority, metadata
      FROM news_items
      WHERE published_at >= ?
      ORDER BY is_official DESC, source_priority DESC, published_at DESC
      LIMIT ?
    `
    )
    .all(cutoff, limit)
    .map((row) => ({ ...row, metadata: safeJsonParse(row.metadata, {}) }));
}

function latestFreshTimestamp(items = []) {
  let bestMs = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const candidate = parseIsoDate(item?.fetched_at || item?.published_at || '');
    const candidateMs = candidate?.getTime() || 0;
    if (candidateMs > bestMs) bestMs = candidateMs;
  }
  return bestMs;
}

function latestNewsIngestRun() {
  return db
    .prepare(
      `
      SELECT status, source, item_count, message, metadata, started_at, finished_at
      FROM news_ingest_runs
      ORDER BY id DESC
      LIMIT 1
    `
    )
    .get();
}

export function getSharedCuratedNewsState({
  staleAfterHours = SHARED_CURATED_NEWS_REFRESH_HOURS,
  limit = 60
} = {}) {
  const memoryState = getSharedCuratedNewsMemoryState({ staleAfterHours, limit });
  if (memoryState?.meaningful_count > 0) {
    return memoryState;
  }

  const items = getCuratedNews({ limit });
  const lastRun = latestNewsIngestRun();
  const dbState = buildSharedCuratedNewsState({
    items,
    staleAfterHours,
    lastRunStatus: String(lastRun?.status || ''),
    lastRunMessage: String(lastRun?.message || ''),
    lastRunFinishedAt: String(lastRun?.finished_at || ''),
    lastRunMetadata: safeJsonParse(lastRun?.metadata || '', {})
  });
  if (dbState.meaningful_count > 0) {
    sharedCuratedNewsMemory.items = snapshotCuratedNewsItems(dbState.items);
    sharedCuratedNewsMemory.updated_at = nowIso();
    sharedCuratedNewsMemory.last_run_status = dbState.last_run_status;
    sharedCuratedNewsMemory.last_run_message = dbState.last_run_message;
    sharedCuratedNewsMemory.last_run_finished_at = dbState.last_run_finished_at;
    sharedCuratedNewsMemory.last_run_metadata = { ...(dbState.last_run_metadata || {}) };
    return dbState;
  }
  return memoryState || dbState;
}

function buildSourceInstructions() {
  return CURATED_NEWS_SOURCES.map((source) => {
    const officialText = source.official ? 'official/regulatory' : 'publisher';
    return `- ${source.name} (${officialText}, domains: ${source.domains.join(', ')})`;
  }).join('\n');
}

function buildCategoryInstructions() {
  return CURATED_NEWS_CATEGORIES.map((category) => `- ${category.key}: ${category.label}`).join('\n');
}

function buildIngestPrompt({ country = 'IN', maxAgeHours = NEWS_MAX_AGE_HOURS, retryMode = false } = {}) {
  const retryRules = retryMode
    ? [
        '- Retry mode: broaden search within allowlisted sources and categories before returning empty.',
        '- Accept both ISO timestamps and date-only strings; convert date-only values to ISO date-time.',
        '- If no high-signal stories are found, include lower-signal but valid items from the same window.'
      ]
    : [
        '- Prefer high-signal policy, market, and allocation-relevant stories first.'
      ];

  return [
    'Role: Curated India personal-finance news ingestion service.',
    `Task: find fresh, India-relevant items from the last ${maxAgeHours} hours only.`,
    'Return STRICT JSON with key "items" as an array.',
    'Return ONLY valid JSON. Do not add any explanation before or after the JSON.',
    'If live browsing is unavailable or blocked, return {"items":[]} and nothing else.',
    'Each item must contain: source_name, url, title, published_at, category, summary.',
    'Use only these sources:',
    buildSourceInstructions(),
    'Use only these categories:',
    buildCategoryInstructions(),
    'Rules:',
    `- Only include items with a visible publish timestamp in the last ${maxAgeHours} hours.`,
    `- For gold_metals items, use only these sources: ${GOLD_SILVER_SOURCE_KEYS.join(', ')}.`,
    '- Prefer official sources for policy, retirement, compliance, and rule changes.',
    '- Prefer Reuters and major Indian finance publishers for fast market-moving coverage.',
    '- Deduplicate near-identical stories.',
    '- Focus on actionable retail-investor context across bank savings, stocks, gold/metals, retirement, real estate, and other savings.',
    '- Return 12 to 18 items when available.',
    ...retryRules,
    `Country focus: ${country}`
  ].join('\n');
}

function ingestJsonFormat() {
  return {
    type: 'json_schema',
    name: 'curated_news_items',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              source_name: { type: 'string' },
              url: { type: 'string' },
              title: { type: 'string' },
              published_at: { type: 'string' },
              category: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['source_name', 'url', 'title', 'published_at', 'category', 'summary']
          }
        }
      },
      required: ['items']
    }
  };
}

function insightBulletsJsonFormat() {
  return {
    type: 'json_schema',
    name: 'insight_news_bullets',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        bullets: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['bullets']
    }
  };
}

function normalizeIngestedBatch(rawItems = [], { maxAgeHours = NEWS_MAX_AGE_HOURS } = {}) {
  const rejections = {};
  const normalized = dedupeItems(
    (Array.isArray(rawItems) ? rawItems : [])
      .map((item) => normalizeIngestedItem(item, { rejections, maxAgeHours }))
      .filter(Boolean)
  );
  return { normalized, rejections };
}

async function callOpenAIResponses({
  apiKey,
  model,
  useWebSearch,
  promptText,
  country = 'IN',
  searchContextSize = 'low',
  timeoutMs = null,
  responseFormat = null,
  debugContext = null
}) {
  const toolVariants = useWebSearch
    ? [
        {
          name: 'web_search',
          tools: [
            {
              type: 'web_search',
              search_context_size: searchContextSize,
              user_location: { type: 'approximate', country }
            }
          ]
        },
        {
          name: 'web_search_preview_located',
          tools: [
            {
              type: 'web_search_preview',
              search_context_size: searchContextSize,
              user_location: { type: 'approximate', country }
            }
          ]
        },
        {
          name: 'web_search_preview_basic',
          tools: [{ type: 'web_search_preview' }]
        }
      ]
    : [{ name: 'none', tools: [] }];

  const variantAttempts = [];
  const totalTimeoutMs = timeoutMs || (useWebSearch ? 60_000 : 25_000);
  const startedAtMs = Date.now();
  let lastError = null;
  let emptyItemsParsed = null;

  for (let idx = 0; idx < toolVariants.length; idx += 1) {
    const variant = toolVariants[idx];
    const tools = Array.isArray(variant?.tools) ? variant.tools : [];
    const variantName = String(variant?.name || 'unknown');
    const elapsedMs = Date.now() - startedAtMs;
    const remainingMs = totalTimeoutMs - elapsedMs;
    if (remainingMs <= 1_000) {
      variantAttempts.push({
        tool_variant: variantName,
        error: 'timeout_budget_exhausted'
      });
      break;
    }
    const remainingVariants = Math.max(1, toolVariants.length - idx);
    const variantTimeoutMs = Math.max(8_000, Math.floor(remainingMs / remainingVariants));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), variantTimeoutMs);
    traceNews(debugContext, 'openai_variant_begin', {
      tool_variant: variantName,
      variant_index: idx + 1,
      variant_timeout_ms: variantTimeoutMs,
      remaining_budget_ms: remainingMs,
      model,
      use_web_search: Boolean(useWebSearch)
    });
    try {
      const body = {
        model,
        reasoning: { effort: 'low' },
        tools,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: promptText }]
          }
        ]
      };
      if (responseFormat && typeof responseFormat === 'object') {
        body.text = { format: responseFormat };
      }

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const raw = await response.text();
      traceNews(debugContext, 'openai_variant_http', {
        tool_variant: variantName,
        status: Number(response.status || 0),
        ok: Boolean(response.ok),
        raw_chars: raw.length
      });
      if (!response.ok) {
        throw new Error(raw || `OpenAI request failed (${response.status})`);
      }

      const parsed = JSON.parse(raw);
      const outputText = extractResponseOutputText(parsed);
      if (!outputText) {
        throw new Error('OpenAI response missing output text');
      }
      const structured = parseStrictOrRecoveredJson(outputText);
      const items = Array.isArray(structured?.items) ? structured.items : [];
      variantAttempts.push({
        tool_variant: variantName,
        timeout_ms: variantTimeoutMs,
        output_text_chars: outputText.length,
        items: items.length
      });
      traceNews(debugContext, 'openai_variant_parsed', {
        tool_variant: variantName,
        output_text_chars: outputText.length,
        items: items.length
      });

      const withMeta = {
        ...structured,
        _output_text: outputText,
        _debug: {
          tool_variant: variantName,
          tool_attempts: variantAttempts
        }
      };
      if (!useWebSearch) return withMeta;
      if (items.length > 0) return withMeta;
      if (!emptyItemsParsed) emptyItemsParsed = withMeta;
    } catch (error) {
      lastError = error;
      variantAttempts.push({
        tool_variant: variantName,
        timeout_ms: variantTimeoutMs,
        error: String(error?.message || error)
      });
      traceNews(debugContext, 'openai_variant_error', {
        tool_variant: variantName,
        error: truncateForLog(String(error?.message || error), 400)
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (emptyItemsParsed) return emptyItemsParsed;
  if (lastError) {
    const errorText = String(lastError?.message || lastError);
    throw new Error(`${errorText} | tool_attempts=${JSON.stringify(variantAttempts.slice(0, 5))}`);
  }
  throw new Error('OpenAI request failed without response');
}

function normalizeIngestedItem(rawItem = {}, options = {}) {
  const reject = (reason) => {
    if (options && options.rejections && reason) {
      options.rejections[reason] = Number(options.rejections[reason] || 0) + 1;
    }
    return null;
  };

  const url = normalizeUrl(rawItem.url || rawItem.canonical_url || '');
  if (!url) return reject('missing_url');

  const source =
    sourceByKey(rawItem.source_key || '') ||
    sourceByName(rawItem.source_name || '') ||
    sourceByUrl(url);
  if (!source) return reject('unknown_source');

  const category = normalizeCategory(rawItem.category);
  if (category === 'gold_metals' && !GOLD_SILVER_SOURCE_KEYS.includes(source.key)) return reject('gold_source_not_allowed');
  const publishedAt = parseIsoDate(rawItem.published_at);
  if (!publishedAt) return reject('invalid_published_at');
  const maxAgeHours = Number(options?.maxAgeHours || NEWS_MAX_AGE_HOURS);
  if (!withinFreshWindow(publishedAt.toISOString(), maxAgeHours)) return reject('outside_fresh_window');

  const title = normalizeWhitespace(rawItem.title || '');
  if (!title) return reject('missing_title');

  const categoryConfig = categoryByKey(category);
  const summary = normalizeWhitespace(rawItem.summary || rawItem.snippet || rawItem.why_it_matters || '');

  const item = {
    source_key: source.key,
    source_name: source.name,
    source_domain: source.domains[0],
    category,
    investment_label: categoryConfig.investmentLabel,
    title,
    summary,
    canonical_url: url,
    published_at: publishedAt.toISOString(),
    fetched_at: nowIso(),
    trust_score: source.trustScore,
    is_official: source.official,
    source_priority: source.priority,
    metadata: {
      review_prompt: categoryConfig.reviewPrompt,
      guidance: categoryConfig.guidance
    }
  };
  item.content_hash = contentHash(item);
  return item;
}

export async function ingestCuratedNews({
  apiKey,
  ingestModel = resolveNewsIngestModel(),
  country = 'IN',
  forceRefresh = false,
  debugContext = null
} = {}) {
  const effectiveApiKey = String(apiKey || resolveOpenAiApiKey()).trim();
  const startedAt = nowIso();
  traceNews(debugContext, 'ingest_begin', {
    country,
    ingest_model: ingestModel,
    force_refresh: Boolean(forceRefresh),
    api_key_present: Boolean(effectiveApiKey)
  });
  traceNews(debugContext, 'ingest_prune_begin');
  pruneOldNews();
  traceNews(debugContext, 'ingest_prune_end');
  traceNews(debugContext, 'ingest_existing_read_begin');
  const existing = getCuratedNews({ limit: 60 });
  traceNews(debugContext, 'ingest_existing_read_end', {
    existing_count: existing.length
  });
  const existingMeaningfulCount = countMeaningfulItems(existing);
  traceNews(debugContext, 'ingest_existing_summary', {
    existing_count: existing.length,
    existing_meaningful_count: existingMeaningfulCount
  });
  if (!forceRefresh && existingMeaningfulCount >= 10) {
    traceNews(debugContext, 'ingest_skip_fresh_news_present', {
      existing_count: existing.length,
      existing_meaningful_count: existingMeaningfulCount
    });
    logIngestRun({
      status: 'skipped',
      source: 'pipeline',
      itemCount: 0,
      message: 'fresh_news_already_present',
      metadata: { fresh_count: existing.length, meaningful_count: existingMeaningfulCount },
      startedAt,
      finishedAt: nowIso()
    });
    return { ok: true, skipped: true, inserted: 0, total_fresh_items: existing.length };
  }
  if (!effectiveApiKey) {
    traceNews(debugContext, 'ingest_skip_missing_api_key');
    logIngestRun({
      status: 'error',
      source: 'pipeline',
      itemCount: 0,
      message: 'openai_api_key_missing',
      metadata: { fresh_count: existing.length },
      startedAt,
      finishedAt: nowIso()
    });
    return { ok: false, error: 'openai_api_key_missing', inserted: 0, total_fresh_items: existing.length };
  }

  const fallbackCatalog = CURATED_NEWS_SOURCES.flatMap((source) =>
    source.categories.map((categoryKey) => ({
      source_key: source.key,
      source_name: source.name,
      url: `https://${source.domains[0]}`,
      title: `${source.name} latest update feed`,
      published_at: nowIso(),
      category: categoryKey,
      summary: `Use ${source.name} for recent ${categoryByKey(categoryKey).label.toLowerCase()} developments when live article extraction is unavailable.`
    }))
  );

  try {
    const attemptConfigs = [
      {
        name: 'strict_48h',
        maxAgeHours: NEWS_MAX_AGE_HOURS,
        retryMode: false,
        searchContextSize: 'medium',
        timeoutMs: 28_000
      },
      {
        name: 'retry_72h_relaxed',
        maxAgeHours: Math.max(72, NEWS_MAX_AGE_HOURS),
        retryMode: true,
        searchContextSize: 'medium',
        timeoutMs: 36_000
      }
    ];
    const attemptSummary = [];
    let openAiError = '';
    let rawItems = [];
    let normalizationRejections = {};
    let normalized = [];

    for (const attempt of attemptConfigs) {
      traceNews(debugContext, 'ingest_attempt_begin', {
        attempt: attempt.name,
        max_age_hours: attempt.maxAgeHours,
        retry_mode: Boolean(attempt.retryMode),
        timeout_ms: attempt.timeoutMs,
        search_context_size: attempt.searchContextSize
      });
      const prompt = buildIngestPrompt({
        country,
        maxAgeHours: attempt.maxAgeHours,
        retryMode: attempt.retryMode
      });
      try {
        const out = await callOpenAIResponses({
          apiKey: effectiveApiKey,
          model: ingestModel,
          useWebSearch: true,
          promptText: prompt,
          country,
          searchContextSize: attempt.searchContextSize,
          timeoutMs: attempt.timeoutMs,
          responseFormat: ingestJsonFormat(),
          debugContext: {
            ...debugContext,
            attempt: attempt.name
          }
        });

        const currentRawItems = Array.isArray(out?.items) ? out.items : [];
        const { normalized: currentNormalized, rejections: currentRejections } = normalizeIngestedBatch(currentRawItems, {
          maxAgeHours: attempt.maxAgeHours
        });
        traceNews(debugContext, 'ingest_attempt_normalized', {
          attempt: attempt.name,
          model_items_raw: currentRawItems.length,
          model_items_normalized: currentNormalized.length,
          rejection_reasons: Object.keys(currentRejections).length ? currentRejections : undefined
        });
        attemptSummary.push({
          attempt: attempt.name,
          max_age_hours: attempt.maxAgeHours,
          model_items_raw: currentRawItems.length,
          model_items_normalized: currentNormalized.length,
          tool_variant: out?._debug?.tool_variant || undefined,
          tool_attempts: Array.isArray(out?._debug?.tool_attempts) ? out._debug.tool_attempts : undefined,
          rejection_reasons: Object.keys(currentRejections).length ? currentRejections : undefined
        });

        if (currentNormalized.length > normalized.length) {
          rawItems = currentRawItems;
          normalized = currentNormalized;
          normalizationRejections = currentRejections;
        } else if (!rawItems.length && currentRawItems.length) {
          rawItems = currentRawItems;
          normalizationRejections = currentRejections;
        }

        if (normalized.length) break;
      } catch (attemptError) {
        const attemptErrorText = String(attemptError?.message || attemptError);
        openAiError = attemptErrorText;
        traceNews(debugContext, 'ingest_attempt_error', {
          attempt: attempt.name,
          error: truncateForLog(attemptErrorText, 400)
        });
        attemptSummary.push({
          attempt: attempt.name,
          error: attemptErrorText
        });
      }
    }

    const fallbackItems = dedupeItems(fallbackCatalog.map(normalizeIngestedItem).filter(Boolean)).slice(0, 12);
    let effectiveItems = [];
    let message = 'ingest_completed';
    let warning = '';

    if (normalized.length) {
      effectiveItems = normalized;
      traceNews(debugContext, 'ingest_effective_items_model', {
        effective_items: effectiveItems.length
      });
    } else if (existingMeaningfulCount > 0) {
      message = 'ingest_completed_using_existing_after_empty_model_output';
      warning = 'model_output_empty_using_existing';
      traceNews(debugContext, 'ingest_effective_items_existing', {
        existing_meaningful_count: existingMeaningfulCount,
        warning
      });
    } else {
      effectiveItems = fallbackItems;
      message = 'ingest_completed_with_catalog_fallback';
      warning = 'catalog_fallback_used';
      traceNews(debugContext, 'ingest_effective_items_catalog_fallback', {
        fallback_items: fallbackItems.length,
        warning
      });
    }

    const memoryItems = countMeaningfulItems(effectiveItems)
      ? effectiveItems
      : existingMeaningfulCount > 0
        ? existing
        : [];
    if (memoryItems.length && setSharedCuratedNewsMemoryItems(memoryItems)) {
      traceNews(debugContext, 'ingest_memory_snapshot_seeded', {
        items: memoryItems.length,
        meaningful_count: countMeaningfulItems(memoryItems)
      });
    }

    if (normalized.length) {
      traceNews(debugContext, 'ingest_purge_catalog_fallback_begin');
      purgeCatalogFallbackItems();
      traceNews(debugContext, 'ingest_purge_catalog_fallback_end');
    }
    let writeFailures = [];
    let insertedCount = 0;
    if (effectiveItems.length) {
      traceNews(debugContext, 'ingest_persist_begin', {
        effective_items: effectiveItems.length
      });
      const writeResult = persistCuratedNewsItems(effectiveItems);
      insertedCount = writeResult.inserted;
      writeFailures = writeResult.failures;
      traceNews(debugContext, 'ingest_persist_end', {
        inserted_count: insertedCount,
        write_failures_count: writeFailures.length,
        write_failure_sample: writeFailures.length
          ? truncateForLog(
              `${writeFailures[0]?.title || writeFailures[0]?.canonical_url || 'item'} :: ${writeFailures[0]?.error || 'persist_failed'}`,
              240
            )
          : undefined
      });
      if (writeFailures.length) {
        warning = insertedCount > 0 ? (warning || 'partial_write_failures') : 'persist_failed';
      }
    }
    if (!insertedCount && writeFailures.length) {
      const persistError = String(writeFailures[0]?.error || 'persist_failed');
      traceNews(debugContext, 'ingest_persist_failed_return', {
        warning,
        error: truncateForLog(persistError, 320),
        write_failures_count: writeFailures.length
      });
      logIngestRun({
        status: 'warning',
        source: 'pipeline',
        itemCount: 0,
        message: 'ingest_persist_failed',
        metadata: {
          attempted_items: effectiveItems.length,
          persisted_items: 0,
          total_fresh_items: existing.length,
          meaningful_count: existingMeaningfulCount,
          model_items_raw: rawItems.length,
          model_items: normalized.length,
          rejected_items: Math.max(0, rawItems.length - normalized.length),
          rejection_reasons: Object.keys(normalizationRejections).length ? normalizationRejections : undefined,
          write_failures_count: writeFailures.length,
          write_failures: writeFailures.slice(0, 3),
          attempts: attemptSummary,
          openai_error: openAiError || undefined,
          warning: warning || undefined
        },
        startedAt,
        finishedAt: nowIso()
      });
      setSharedCuratedNewsMemoryRunMeta({
        status: 'warning',
        message: 'ingest_persist_failed',
        metadata: {
          attempted_items: effectiveItems.length,
          persisted_items: 0,
          total_fresh_items: existing.length,
          meaningful_count: Math.max(existingMeaningfulCount, countMeaningfulItems(memoryItems)),
          model_items_raw: rawItems.length,
          model_items: normalized.length,
          rejected_items: Math.max(0, rawItems.length - normalized.length),
          rejection_reasons: Object.keys(normalizationRejections).length ? normalizationRejections : undefined,
          write_failures_count: writeFailures.length,
          write_failures: writeFailures.slice(0, 3),
          attempts: attemptSummary,
          openai_error: openAiError || undefined,
          warning: warning || undefined
        },
        finishedAt: nowIso()
      });
      const payload = {
        ok: false,
        inserted: 0,
        total_fresh_items: existing.length,
        model_items_raw: rawItems.length,
        model_items_normalized: normalized.length,
        warning: warning || 'persist_failed',
        error: persistError,
        write_failures: writeFailures.slice(0, 3)
      };
      if (attemptSummary.length) payload.ingest_attempts = attemptSummary;
      if (Object.keys(normalizationRejections).length) payload.normalization_rejections = normalizationRejections;
      return payload;
    }
    traceNews(debugContext, 'ingest_post_persist_prune_begin');
    pruneOldNews();
    traceNews(debugContext, 'ingest_post_persist_prune_end');
    traceNews(debugContext, 'ingest_refreshed_read_begin');
    const refreshed = getCuratedNews({ limit: 60 });
    traceNews(debugContext, 'ingest_refreshed_read_end', {
      refreshed_count: refreshed.length,
      refreshed_meaningful_count: countMeaningfulItems(refreshed)
    });
    const totalFreshItems = refreshed.length;
    logIngestRun({
      status: warning ? 'warning' : 'ok',
      source: 'pipeline',
      itemCount: insertedCount,
      message,
      metadata: {
        attempted_items: effectiveItems.length,
        persisted_items: insertedCount,
        total_fresh_items: totalFreshItems,
        meaningful_count: countMeaningfulItems(refreshed),
        model_items_raw: rawItems.length,
        model_items: normalized.length,
        rejected_items: Math.max(0, rawItems.length - normalized.length),
        rejection_reasons: Object.keys(normalizationRejections).length ? normalizationRejections : undefined,
        write_failures_count: writeFailures.length,
        write_failures: writeFailures.length ? writeFailures.slice(0, 3) : undefined,
        attempts: attemptSummary,
        openai_error: openAiError || undefined,
        warning: warning || undefined
      },
      startedAt,
      finishedAt: nowIso()
    });
    setSharedCuratedNewsMemoryRunMeta({
      status: warning ? 'warning' : 'ok',
      message,
      metadata: {
        attempted_items: effectiveItems.length,
        persisted_items: insertedCount,
        total_fresh_items: totalFreshItems,
        meaningful_count: countMeaningfulItems(refreshed),
        model_items_raw: rawItems.length,
        model_items: normalized.length,
        rejected_items: Math.max(0, rawItems.length - normalized.length),
        rejection_reasons: Object.keys(normalizationRejections).length ? normalizationRejections : undefined,
        write_failures_count: writeFailures.length,
        write_failures: writeFailures.length ? writeFailures.slice(0, 3) : undefined,
        attempts: attemptSummary,
        openai_error: openAiError || undefined,
        warning: warning || undefined
      },
      finishedAt: nowIso()
    });
    const payload = {
      ok: true,
      inserted: insertedCount,
      total_fresh_items: totalFreshItems,
      model_items_raw: rawItems.length,
      model_items_normalized: normalized.length
    };
    if (attemptSummary.length) payload.ingest_attempts = attemptSummary;
    if (warning) payload.warning = warning;
    if (Object.keys(normalizationRejections).length) payload.normalization_rejections = normalizationRejections;
    if (writeFailures.length) payload.write_failures = writeFailures.slice(0, 3);
    if (!openAiError && writeFailures.length) payload.error = writeFailures[0].error;
    if (openAiError) payload.error = openAiError;
    traceNews(debugContext, 'ingest_complete', {
      ok: true,
      inserted: insertedCount,
      total_fresh_items: totalFreshItems,
      warning: warning || undefined,
      error: openAiError || undefined
    });
    return payload;
  } catch (error) {
    const errorText = String(error?.message || error);
    traceNews(debugContext, 'ingest_fatal_error', {
      error: truncateForLog(errorText, 400),
      existing_meaningful_count: existingMeaningfulCount
    });
    if (existingMeaningfulCount > 0) {
      setSharedCuratedNewsMemoryItems(existing);
      setSharedCuratedNewsMemoryRunMeta({
        status: 'error',
        message: 'ingest_error_using_existing',
        metadata: {
          total_fresh_items: existing.length,
          meaningful_count: existingMeaningfulCount,
          error: errorText
        },
        finishedAt: nowIso()
      });
      logIngestRun({
        status: 'error',
        source: 'pipeline',
        itemCount: 0,
        message: 'ingest_error_using_existing',
        metadata: {
          total_fresh_items: existing.length,
          meaningful_count: existingMeaningfulCount,
          error: errorText
        },
        startedAt,
        finishedAt: nowIso()
      });
      return {
        ok: false,
        inserted: 0,
        total_fresh_items: existing.length,
        warning: 'ingest_failed_using_existing',
        error: errorText
      };
    }

    const effectiveItems = dedupeItems(fallbackCatalog.map(normalizeIngestedItem).filter(Boolean)).slice(0, 12);
    traceNews(debugContext, 'ingest_fatal_catalog_fallback_begin', {
      effective_items: effectiveItems.length
    });
    const fallbackWrite = persistCuratedNewsItems(effectiveItems);
    traceNews(debugContext, 'ingest_fatal_catalog_fallback_persisted', {
      inserted: fallbackWrite.inserted,
      write_failures_count: fallbackWrite.failures.length
    });
    pruneOldNews();
    const totalFreshItems = getCuratedNews({ limit: 60 }).length;
    logIngestRun({
      status: 'warning',
      source: 'pipeline',
      itemCount: fallbackWrite.inserted,
      message: 'ingest_completed_with_error_catalog_fallback',
      metadata: {
        attempted_items: effectiveItems.length,
        persisted_items: fallbackWrite.inserted,
        total_fresh_items: totalFreshItems,
        meaningful_count: countMeaningfulItems(getCuratedNews({ limit: 60 })),
        error: errorText,
        write_failures_count: fallbackWrite.failures.length,
        write_failures: fallbackWrite.failures.length ? fallbackWrite.failures.slice(0, 3) : undefined
      },
      startedAt,
      finishedAt: nowIso()
    });
    setSharedCuratedNewsMemoryRunMeta({
      status: 'warning',
      message: 'ingest_completed_with_error_catalog_fallback',
      metadata: {
        attempted_items: effectiveItems.length,
        persisted_items: fallbackWrite.inserted,
        total_fresh_items: totalFreshItems,
        meaningful_count: countMeaningfulItems(getCuratedNews({ limit: 60 })),
        error: errorText,
        write_failures_count: fallbackWrite.failures.length,
        write_failures: fallbackWrite.failures.length ? fallbackWrite.failures.slice(0, 3) : undefined
      },
      finishedAt: nowIso()
    });
    const payload = {
      ok: true,
      inserted: fallbackWrite.inserted,
      total_fresh_items: totalFreshItems,
      warning: 'catalog_fallback_used',
      error: errorText,
      model_items_raw: 0,
      model_items_normalized: 0
    };
    if (fallbackWrite.failures.length) payload.write_failures = fallbackWrite.failures.slice(0, 3);
    return payload;
  }
}

function fallbackBulletForItem(item) {
  const guidance = item?.metadata?.guidance || categoryByKey(item.category).guidance;
  return `[${item.investment_label}] What happened: ${item.title}. Why it matters: ${item.summary || 'recent market or policy context may affect this bucket.'} What to consider: ${guidance}. Source: ${item.source_name} - ${item.canonical_url}.`;
}

function inferCategoryFromBullet(text = '') {
  const value = String(text || '').toLowerCase();
  if (value.includes('gold / silver / metals') || value.includes('gold / silver') || value.includes('gold') || value.includes('silver') || value.includes('metals') || value.includes('commodit')) return 'gold_metals';
  if (value.includes('fds / savings / rds') || value.includes('bank savings') || value.includes('deposit') || value.includes('rates')) return 'bank_savings';
  if (value.includes('epf / nps / retirement') || value.includes('retirement') || value.includes('epf') || value.includes('nps')) return 'retirement';
  if (value.includes('stocks / etfs / mutual funds') || value.includes('stock') || value.includes('mutual fund') || value.includes('etf')) return 'stocks';
  if (value.includes('real estate') || value.includes('property')) return 'real_estate';
  if (value.includes('insurance / bonds / other savings') || value.includes('bond') || value.includes('insurance') || value.includes('other savings')) return 'other_savings';
  return 'other_savings';
}

function bulletMentionsGoldMetals(text = '') {
  const value = String(text || '').toLowerCase();
  return (
    value.includes('gold / silver / metals') ||
    value.includes('gold / silver') ||
    value.includes('gold') ||
    value.includes('silver') ||
    value.includes('metals') ||
    value.includes('commodit')
  );
}

function buildRepresentativeItems(items = []) {
  const byCategory = new Map();
  for (const item of items) {
    if (!item?.category) continue;
    const current = byCategory.get(item.category);
    if (!current) {
      byCategory.set(item.category, item);
      continue;
    }
    const currentIsFallback = isCatalogFallbackItem(current);
    const nextIsFallback = isCatalogFallbackItem(item);
    if (currentIsFallback && !nextIsFallback) {
      byCategory.set(item.category, item);
      continue;
    }
    if (!currentIsFallback && nextIsFallback) {
      continue;
    }
    const currentPriority = Number(current.is_official ? 1000 : 0) + Number(current.source_priority || 0);
    const nextPriority = Number(item.is_official ? 1000 : 0) + Number(item.source_priority || 0);
    if (nextPriority > currentPriority) {
      byCategory.set(item.category, item);
      continue;
    }
    if ((item.published_at || '') > (current.published_at || '')) {
      byCategory.set(item.category, item);
    }
  }

  const representatives = [...byCategory.values()].sort((a, b) => {
    const ap = Number(a.is_official ? 1000 : 0) + Number(a.source_priority || 0) + (isCatalogFallbackItem(a) ? -500 : 0);
    const bp = Number(b.is_official ? 1000 : 0) + Number(b.source_priority || 0) + (isCatalogFallbackItem(b) ? -500 : 0);
    if (bp !== ap) return bp - ap;
    return String(b.published_at || '').localeCompare(String(a.published_at || ''));
  });

  const goldMetals = representatives.find((item) => item.category === 'gold_metals') || null;
  const selected = [];
  if (goldMetals) selected.push(goldMetals);
  for (const item of representatives) {
    if (selected.some((current) => current.category === item.category)) continue;
    selected.push(item);
    if (selected.length === 5) break;
  }
  return selected.slice(0, 5);
}

function buildCategoryFallbackItem(categoryKey = '') {
  const category = categoryByKey(categoryKey);
  const sourceCandidates = CURATED_NEWS_SOURCES.filter((source) => source.categories.includes(category.key)).sort((a, b) => {
    const ap = Number(a.official ? 1000 : 0) + Number(a.priority || 0);
    const bp = Number(b.official ? 1000 : 0) + Number(b.priority || 0);
    return bp - ap;
  });
  const source = sourceCandidates[0];
  if (!source) return null;
  return normalizeIngestedItem({
    source_key: source.key,
    source_name: source.name,
    url: `https://${source.domains[0]}`,
    title: `${source.name} latest update feed`,
    published_at: nowIso(),
    category: category.key,
    summary: `Use ${source.name} for recent ${category.label.toLowerCase()} developments when live category coverage is limited.`
  });
}

function buildFallbackCoverageItems(items = [], maxItems = 5) {
  const selected = buildRepresentativeItems(items);
  const seenCategories = new Set(selected.map((item) => item.category).filter(Boolean));
  for (const category of CURATED_NEWS_CATEGORIES) {
    if (selected.length >= maxItems) break;
    if (seenCategories.has(category.key)) continue;
    const fallbackItem = buildCategoryFallbackItem(category.key);
    if (!fallbackItem) continue;
    selected.push(fallbackItem);
    seenCategories.add(category.key);
  }
  return selected.slice(0, maxItems);
}

function parseBulletsFromText(raw = '') {
  const cleaned = String(raw || '').replace(/\r/g, '\n').trim();
  if (!cleaned) return [];
  const byLines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  if (byLines.length > 1) return byLines.slice(0, 5);

  const bySegments = cleaned
    .split(/\s(?=\[[^\]]+\]\s*What happened:)/)
    .map((part) => part.trim())
    .filter(Boolean);
  return bySegments.slice(0, 5);
}

function mergeBulletsWithFallback(aiBullets = [], fallbackItems = []) {
  const normalizedAi = (Array.isArray(aiBullets) ? aiBullets : [])
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
  const fallbackBullets = fallbackItems.map(fallbackBulletForItem);
  const merged = [];
  const seenCategories = new Set();
  const tryPushUnique = (bullet) => {
    if (!bullet) return;
    const category = inferCategoryFromBullet(bullet);
    if (seenCategories.has(category)) return;
    seenCategories.add(category);
    merged.push(bullet);
  };
  normalizedAi.forEach(tryPushUnique);
  fallbackBullets.forEach(tryPushUnique);
  if (merged.length < 5) {
    [...normalizedAi, ...fallbackBullets].forEach((bullet) => {
      if (merged.length >= 5) return;
      if (bullet) merged.push(bullet);
    });
  }
  return merged.slice(0, 5);
}

export async function buildInsightNewsBullets({
  apiKey,
  items = [],
  country = 'IN',
  currency = 'INR',
  portfolio = {},
  model = resolveNewsInsightModel()
} = {}) {
  const curated = dedupeItems(items).slice(0, 12);
  if (!curated.length) {
    return { bullets: [], source: 'empty' };
  }
  const meaningfulCurated = filterMeaningfulCuratedNewsItems(curated);
  const coverageItems = buildFallbackCoverageItems(meaningfulCurated.length ? meaningfulCurated : curated);
  const representativeItems = buildRepresentativeItems(meaningfulCurated.length ? meaningfulCurated : curated);
  const catalogOnly = !meaningfulCurated.length;
  const goldMetalsItem = representativeItems.find((item) => item.category === 'gold_metals') || null;
  const effectiveApiKey = String(apiKey || resolveOpenAiApiKey()).trim();

  if (!effectiveApiKey) {
    const fallbackBullets = coverageItems.map(fallbackBulletForItem);
    return { bullets: fallbackBullets, source: catalogOnly ? 'rule_based_catalog_only' : 'rule_based' };
  }

  const prompt = [
    'Role: Personal finance explainer for Indian retail investors.',
    'Use only the curated news items provided below. Do not add any external facts.',
    'Use very simple language for a normal middle-class saver or investor.',
    'Never give buy/sell advice. Help the user decide what to review next.',
    'Return STRICT JSON with key "bullets" as an array of exactly 5 strings.',
    'Each bullet must be at most 42 words.',
    'Bullet format: [Investment Type] What happened: short fact. Why it matters: short impact. What to consider: short practical review point. Source: Site Name - URL.',
    'Do not use the words Bullish, Bearish, Neutral, or Wallet Impact.',
    'Use at most one bullet per category. Do not repeat the same category twice.',
    goldMetalsItem
      ? 'Coverage requirement: include exactly one bullet for Gold / Silver / Metals when curated items contain that category.'
      : 'Coverage requirement: do not invent Gold / Silver / Metals coverage unless the curated items include it.',
    `Country: ${country}`,
    `Currency: ${currency}`,
    `Portfolio context: ${JSON.stringify(portfolio)}`,
    `Curated news items: ${JSON.stringify(representativeItems)}`
  ].join('\n');

  const out = await callOpenAIResponses({
    apiKey: effectiveApiKey,
    model,
    useWebSearch: false,
    promptText: prompt,
    country,
    responseFormat: insightBulletsJsonFormat()
  });

  let bullets = Array.isArray(out?.bullets)
    ? out.bullets.map((item) => normalizeWhitespace(item)).filter(Boolean).slice(0, 5)
    : [];
  if (!bullets.length) {
    bullets = parseBulletsFromText(out?._output_text || '');
  }
  const mergedBullets = mergeBulletsWithFallback(bullets, coverageItems);
  const usedFallbackAssist = mergedBullets.length !== bullets.length || mergedBullets.some((line) => !bullets.includes(line));
  bullets = mergedBullets;
  if (!bullets.length) {
    const fallbackBullets = coverageItems.map(fallbackBulletForItem);
    return { bullets: fallbackBullets, source: catalogOnly ? 'rule_based_invalid_ai_catalog_only' : 'rule_based_invalid_ai' };
  }
  const seenCategories = new Set();
  let hasDuplicateCategory = false;
  for (const bullet of bullets) {
    const category = inferCategoryFromBullet(bullet);
    if (seenCategories.has(category)) {
      hasDuplicateCategory = true;
      break;
    }
    seenCategories.add(category);
  }
  if (hasDuplicateCategory) {
    bullets = mergeBulletsWithFallback([], coverageItems);
  }
  if (goldMetalsItem && !bullets.some(bulletMentionsGoldMetals)) {
    const goldFallback = fallbackBulletForItem(goldMetalsItem);
    bullets = [goldFallback, ...bullets.filter((line) => !bulletMentionsGoldMetals(line))].slice(0, 5);
  }
  const source = usedFallbackAssist
    ? catalogOnly
      ? 'ai_from_curated_news_with_fallback_catalog_only'
      : 'ai_from_curated_news_with_fallback'
    : 'ai_from_curated_news';
  return { bullets, source };
}

export async function ensureCuratedNews({
  apiKey,
  country = 'IN',
  forceRefresh = false,
  minFreshItems = 8
} = {}) {
  const effectiveApiKey = String(apiKey || resolveOpenAiApiKey()).trim();
  const current = getCuratedNews({ limit: 60 });
  const meaningfulCurrentCount = countMeaningfulItems(current);
  if (!forceRefresh && meaningfulCurrentCount >= minFreshItems) {
    return { items: current, refreshed: false, count: current.length, meaningful_count: meaningfulCurrentCount };
  }

  if (!forceRefresh && !effectiveApiKey) {
    return {
      items: current,
      refreshed: false,
      count: current.length,
      meaningful_count: meaningfulCurrentCount,
      ingest_ok: false,
      ingest_warning: 'openai_api_key_missing'
    };
  }

  if (!forceRefresh && current.length) {
    const lastRun = db
      .prepare(
        `
        SELECT status, message, finished_at
        FROM news_ingest_runs
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get();
    const finishedAtMs = new Date(String(lastRun?.finished_at || '')).getTime();
    const recentRun = Number.isFinite(finishedAtMs) && Date.now() - finishedAtMs < INGEST_RETRY_COOLDOWN_MS;
    const status = String(lastRun?.status || '').toLowerCase();
    const message = String(lastRun?.message || '').toLowerCase();
    const likelyFailed =
      status === 'error' ||
      status === 'warning' ||
      message.includes('fallback') ||
      message.includes('error') ||
      message.includes('empty');
    if (recentRun && likelyFailed) {
      return {
        items: current,
        refreshed: false,
        count: current.length,
        meaningful_count: meaningfulCurrentCount,
        ingest_ok: false,
        ingest_warning: 'ingest_retry_cooldown_active'
    };
  }
}

  const ingestResult = await ingestCuratedNews({ apiKey: effectiveApiKey, country, forceRefresh });
  const refreshed = getCuratedNews({ limit: 60 });
  return {
    items: refreshed,
    refreshed: true,
    count: refreshed.length,
    meaningful_count: countMeaningfulItems(refreshed),
    ingest_ok: ingestResult?.ok !== false,
    ingest_warning: ingestResult?.warning || '',
    ingest_error: ingestResult?.error || ''
  };
}

export async function ensureSharedCuratedNewsFresh({
  apiKey,
  country = 'IN',
  staleAfterHours = SHARED_CURATED_NEWS_REFRESH_HOURS,
  forceRefresh = false,
  minFreshItems = 8,
  debugContext = null
} = {}) {
  const effectiveApiKey = String(apiKey || resolveOpenAiApiKey()).trim();
  traceNews(debugContext, 'shared_refresh_state_before_begin', {
    country,
    stale_after_hours: staleAfterHours,
    force_refresh: Boolean(forceRefresh),
    min_fresh_items: minFreshItems,
    api_key_present: Boolean(effectiveApiKey)
  });
  const before = getSharedCuratedNewsState({ staleAfterHours });
  traceNews(debugContext, 'shared_refresh_state_before_end', {
    count: before.count,
    meaningful_count: before.meaningful_count,
    stale: Boolean(before.stale),
    last_success_at: before.last_success_at || undefined
  });
  if (!forceRefresh && !before.stale && before.meaningful_count >= minFreshItems) {
    traceNews(debugContext, 'shared_refresh_skip_already_fresh', {
      count: before.count,
      meaningful_count: before.meaningful_count
    });
    return {
      ...before,
      refreshed: false,
      ingest_ok: true
    };
  }

  if (!effectiveApiKey) {
    traceNews(debugContext, 'shared_refresh_skip_missing_api_key');
    return {
      ...before,
      refreshed: false,
      ingest_ok: false,
      ingest_warning: 'openai_api_key_missing'
    };
  }

  traceNews(debugContext, 'shared_refresh_ingest_begin', {
    country
  });
  const ingestResult = await ingestCuratedNews({
    apiKey: effectiveApiKey,
    country,
    forceRefresh: true,
    debugContext
  });
  traceNews(debugContext, 'shared_refresh_ingest_end', {
    ingest_ok: ingestResult?.ok !== false,
    ingest_warning: ingestResult?.warning || undefined,
    ingest_error: ingestResult?.error || undefined,
    inserted: Number(ingestResult?.inserted || 0),
    total_fresh_items: Number(ingestResult?.total_fresh_items || 0)
  });
  traceNews(debugContext, 'shared_refresh_state_after_begin');
  const after = getSharedCuratedNewsState({ staleAfterHours });
  traceNews(debugContext, 'shared_refresh_state_after_end', {
    count: after.count,
    meaningful_count: after.meaningful_count,
    stale: Boolean(after.stale),
    last_success_at: after.last_success_at || undefined
  });
  return {
    ...after,
    refreshed: true,
    ingest_ok: ingestResult?.ok !== false,
    ingest_warning: ingestResult?.warning || '',
    ingest_error: ingestResult?.error || ''
  };
}

const sharedCuratedNewsRefreshJob = {
  run_id: 0,
  running: false,
  trigger: '',
  requested_at: '',
  started_at: '',
  finished_at: '',
  last_error: '',
  last_result: null,
  timeout_handle: null
};

function refreshJobStartedAtMs() {
  const dt = parseIsoDate(sharedCuratedNewsRefreshJob.started_at || sharedCuratedNewsRefreshJob.requested_at || '');
  return dt?.getTime() || 0;
}

function releaseStaleSharedCuratedNewsRefreshJob() {
  if (!sharedCuratedNewsRefreshJob.running) return false;
  const startedAtMs = refreshJobStartedAtMs();
  if (!startedAtMs) return false;
  const ageMs = Date.now() - startedAtMs;
  const staleAfterMs = SHARED_CURATED_NEWS_JOB_TIMEOUT_MS + 15_000;
  if (ageMs <= staleAfterMs) return false;

  const retiredRunId = Number(sharedCuratedNewsRefreshJob.run_id || 0);
  if (sharedCuratedNewsRefreshJob.timeout_handle) {
    clearTimeout(sharedCuratedNewsRefreshJob.timeout_handle);
    sharedCuratedNewsRefreshJob.timeout_handle = null;
  }
  sharedCuratedNewsRefreshJob.run_id = retiredRunId + 1;
  sharedCuratedNewsRefreshJob.running = false;
  sharedCuratedNewsRefreshJob.finished_at = nowIso();
  sharedCuratedNewsRefreshJob.last_error = `stale_shared_curated_news_job_reset_${ageMs}ms`;
  sharedCuratedNewsRefreshJob.last_result = null;
  console.warn('[news] shared curated news refresh reset after stale run', {
    trigger: sharedCuratedNewsRefreshJob.trigger,
    run_id: retiredRunId,
    age_ms: ageMs
  });
  return true;
}

function summarizeRefreshResult(result = null) {
  if (!result || typeof result !== 'object') return null;
  return {
    refreshed: Boolean(result?.refreshed),
    count: Number(result?.count || 0),
    meaningful_count: Number(result?.meaningful_count || 0),
    stale: Boolean(result?.stale),
    ingest_ok: result?.ingest_ok !== false,
    ingest_warning: String(result?.ingest_warning || ''),
    ingest_error: String(result?.ingest_error || '')
  };
}

export function getSharedCuratedNewsRefreshStatus() {
  releaseStaleSharedCuratedNewsRefreshJob();
  return {
    running: Boolean(sharedCuratedNewsRefreshJob.running),
    trigger: String(sharedCuratedNewsRefreshJob.trigger || ''),
    requested_at: String(sharedCuratedNewsRefreshJob.requested_at || ''),
    started_at: String(sharedCuratedNewsRefreshJob.started_at || ''),
    finished_at: String(sharedCuratedNewsRefreshJob.finished_at || ''),
    last_error: String(sharedCuratedNewsRefreshJob.last_error || ''),
    last_result: summarizeRefreshResult(sharedCuratedNewsRefreshJob.last_result)
  };
}

export function triggerSharedCuratedNewsRefresh({
  apiKey,
  country = 'IN',
  staleAfterHours = SHARED_CURATED_NEWS_REFRESH_HOURS,
  forceRefresh = false,
  minFreshItems = 8,
  trigger = 'manual'
} = {}) {
  releaseStaleSharedCuratedNewsRefreshJob();
  if (sharedCuratedNewsRefreshJob.running) {
    return {
      started: false,
      already_running: true,
      status: getSharedCuratedNewsRefreshStatus()
    };
  }

  const requestedAt = nowIso();
  const runId = Number(sharedCuratedNewsRefreshJob.run_id || 0) + 1;
  sharedCuratedNewsRefreshJob.run_id = runId;
  sharedCuratedNewsRefreshJob.running = true;
  sharedCuratedNewsRefreshJob.trigger = String(trigger || 'manual');
  sharedCuratedNewsRefreshJob.requested_at = requestedAt;
  sharedCuratedNewsRefreshJob.started_at = '';
  sharedCuratedNewsRefreshJob.finished_at = '';
  sharedCuratedNewsRefreshJob.last_error = '';
  traceNews({ trace: true, run_id: runId, trigger: sharedCuratedNewsRefreshJob.trigger }, 'shared_refresh_job_queued', {
    country,
    stale_after_hours: staleAfterHours,
    force_refresh: Boolean(forceRefresh),
    min_fresh_items: minFreshItems,
    job_timeout_ms: SHARED_CURATED_NEWS_JOB_TIMEOUT_MS
  });

  setTimeout(() => {
    if (runId !== sharedCuratedNewsRefreshJob.run_id) return;
    sharedCuratedNewsRefreshJob.started_at = nowIso();
    traceNews({ trace: true, run_id: runId, trigger: sharedCuratedNewsRefreshJob.trigger }, 'shared_refresh_job_started', {
      started_at: sharedCuratedNewsRefreshJob.started_at
    });
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`shared_curated_news_job_timeout_${SHARED_CURATED_NEWS_JOB_TIMEOUT_MS}ms`)),
        SHARED_CURATED_NEWS_JOB_TIMEOUT_MS
      );
      sharedCuratedNewsRefreshJob.timeout_handle = timeoutHandle;
    });
    Promise.race([
      ensureSharedCuratedNewsFresh({
        apiKey,
        country,
        staleAfterHours,
        forceRefresh,
        minFreshItems,
        debugContext: {
          trace: true,
          run_id: runId,
          trigger: sharedCuratedNewsRefreshJob.trigger
        }
      }),
      timeoutPromise
    ])
      .then((result) => {
        if (runId !== sharedCuratedNewsRefreshJob.run_id) return;
        sharedCuratedNewsRefreshJob.last_result = summarizeRefreshResult(result);
        console.log('[news] shared curated news refresh finished', {
          trigger: sharedCuratedNewsRefreshJob.trigger,
          ...sharedCuratedNewsRefreshJob.last_result
        });
      })
      .catch((error) => {
        if (runId !== sharedCuratedNewsRefreshJob.run_id) return;
        sharedCuratedNewsRefreshJob.last_error = String(error?.message || error);
        console.error('[news] shared curated news refresh failed', {
          trigger: sharedCuratedNewsRefreshJob.trigger,
          error: sharedCuratedNewsRefreshJob.last_error
        });
      })
      .finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (sharedCuratedNewsRefreshJob.timeout_handle === timeoutHandle) {
          sharedCuratedNewsRefreshJob.timeout_handle = null;
        }
        if (runId !== sharedCuratedNewsRefreshJob.run_id) return;
        sharedCuratedNewsRefreshJob.running = false;
        sharedCuratedNewsRefreshJob.finished_at = nowIso();
      });
  }, 0);

  return {
    started: true,
    already_running: false,
    status: getSharedCuratedNewsRefreshStatus()
  };
}

let sharedCuratedNewsBootstrapStarted = false;

export function startSharedCuratedNewsBootstrap() {
  if (sharedCuratedNewsBootstrapStarted) return;
  sharedCuratedNewsBootstrapStarted = true;
  if (!SHARED_CURATED_NEWS_BOOTSTRAP_ON_START) {
    console.log('[news] shared curated news bootstrap disabled');
    return;
  }

  const runBootstrapRefresh = () => {
    try {
      const state = getSharedCuratedNewsState({ staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS });
      if (!state.stale && state.meaningful_count >= 8) return;
      const apiKey = resolveOpenAiApiKey();
      if (!apiKey) return;
      const out = triggerSharedCuratedNewsRefresh({
        apiKey,
        country: SHARED_CURATED_NEWS_COUNTRY,
        staleAfterHours: SHARED_CURATED_NEWS_REFRESH_HOURS,
        forceRefresh: true,
        trigger: 'startup_bootstrap'
      });
      console.log('[news] shared curated news bootstrap queued', {
        started: Boolean(out?.started),
        already_running: Boolean(out?.already_running)
      });
    } catch (error) {
      console.error('[news] shared curated news bootstrap failed', String(error?.message || error));
    }
  };

  // Defer until after the web process is up so startup stays responsive.
  setTimeout(() => {
    runBootstrapRefresh();
  }, 5_000);
}
