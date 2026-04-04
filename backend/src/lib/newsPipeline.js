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

const INGEST_MODEL_FALLBACK = 'gpt-5-nano';
const INSIGHT_MODEL_FALLBACK = 'gpt-5-nano';
const NEWS_RETENTION_DAYS = 7;

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
        (typeof chunk.value === 'string' && chunk.value) ||
        '';
      if (textValue) parts.push(textValue);
      continue;
    }
    if (chunk.type === 'json' && chunk.json && typeof chunk.json === 'object') {
      parts.push(JSON.stringify(chunk.json));
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

function truncateForLog(value = '', max = 180) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function persistCuratedNewsItems(items = []) {
  let inserted = 0;
  const failures = [];
  for (const item of Array.isArray(items) ? items : []) {
    try {
      upsertNewsItem(item);
      inserted += 1;
    } catch (error) {
      failures.push({
        canonical_url: truncateForLog(item?.canonical_url || '', 240),
        title: truncateForLog(item?.title || '', 120),
        error: String(error?.message || error)
      });
    }
  }
  return { inserted, failures };
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
  timeoutMs = null
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
  let lastError = null;
  let emptyItemsParsed = null;

  for (const variant of toolVariants) {
    const tools = Array.isArray(variant?.tools) ? variant.tools : [];
    const variantName = String(variant?.name || 'unknown');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || (useWebSearch ? 60_000 : 25_000));
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
        output_text_chars: outputText.length,
        items: items.length
      });

      const withMeta = {
        ...structured,
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
        error: String(error?.message || error)
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
  ingestModel = process.env.OPENAI_NEWS_INGEST_MODEL || process.env.OPENAI_NEWS_MODEL || INGEST_MODEL_FALLBACK,
  country = 'IN',
  forceRefresh = false
} = {}) {
  const startedAt = nowIso();
  pruneOldNews();
  const existing = getCuratedNews({ limit: 60 });
  const existingMeaningfulCount = countMeaningfulItems(existing);
  if (!forceRefresh && existingMeaningfulCount >= 10) {
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
  if (!apiKey) {
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
        timeoutMs: 75_000
      },
      {
        name: 'retry_72h_relaxed',
        maxAgeHours: Math.max(72, NEWS_MAX_AGE_HOURS),
        retryMode: true,
        searchContextSize: 'medium',
        timeoutMs: 90_000
      }
    ];
    const attemptSummary = [];
    let openAiError = '';
    let rawItems = [];
    let normalizationRejections = {};
    let normalized = [];

    for (const attempt of attemptConfigs) {
      const prompt = buildIngestPrompt({
        country,
        maxAgeHours: attempt.maxAgeHours,
        retryMode: attempt.retryMode
      });
      try {
        const out = await callOpenAIResponses({
          apiKey,
          model: ingestModel,
          useWebSearch: true,
          promptText: prompt,
          country,
          searchContextSize: attempt.searchContextSize,
          timeoutMs: attempt.timeoutMs
        });

        const currentRawItems = Array.isArray(out?.items) ? out.items : [];
        const { normalized: currentNormalized, rejections: currentRejections } = normalizeIngestedBatch(currentRawItems, {
          maxAgeHours: attempt.maxAgeHours
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
    } else if (existingMeaningfulCount > 0) {
      message = 'ingest_completed_using_existing_after_empty_model_output';
      warning = 'model_output_empty_using_existing';
    } else {
      effectiveItems = fallbackItems;
      message = 'ingest_completed_with_catalog_fallback';
      warning = 'catalog_fallback_used';
    }

    if (normalized.length) {
      purgeCatalogFallbackItems();
    }
    let writeFailures = [];
    let insertedCount = 0;
    if (effectiveItems.length) {
      const writeResult = persistCuratedNewsItems(effectiveItems);
      insertedCount = writeResult.inserted;
      writeFailures = writeResult.failures;
      if (!warning && writeFailures.length) {
        warning = insertedCount > 0 ? 'partial_write_failures' : 'persist_failed';
      }
    }
    pruneOldNews();
    const refreshed = getCuratedNews({ limit: 60 });
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
    return payload;
  } catch (error) {
    const errorText = String(error?.message || error);
    if (existingMeaningfulCount > 0) {
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
    const fallbackWrite = persistCuratedNewsItems(effectiveItems);
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

export async function buildInsightNewsBullets({
  apiKey,
  items = [],
  country = 'IN',
  currency = 'INR',
  portfolio = {},
  model = process.env.OPENAI_NEWS_MODEL || process.env.OPENAI_MODEL || INSIGHT_MODEL_FALLBACK
} = {}) {
  const curated = dedupeItems(items).slice(0, 12);
  if (!curated.length) {
    return { bullets: [], source: 'empty' };
  }
  const meaningfulCurated = filterMeaningfulCuratedNewsItems(curated);
  const representativeItems = buildRepresentativeItems(meaningfulCurated.length ? meaningfulCurated : curated);
  const catalogOnly = !meaningfulCurated.length;
  const goldMetalsItem = representativeItems.find((item) => item.category === 'gold_metals') || null;

  if (!apiKey) {
    const fallbackBullets = representativeItems.map(fallbackBulletForItem);
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
    apiKey,
    model,
    useWebSearch: false,
    promptText: prompt,
    country
  });

  const bullets = Array.isArray(out?.bullets) ? out.bullets.map((item) => normalizeWhitespace(item)).filter(Boolean).slice(0, 5) : [];
  if (bullets.length !== 5) {
    const fallbackBullets = representativeItems.map(fallbackBulletForItem);
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
    return {
      bullets: representativeItems.map(fallbackBulletForItem),
      source: catalogOnly ? 'rule_based_duplicate_category_rejected_catalog_only' : 'rule_based_duplicate_category_rejected'
    };
  }
  if (goldMetalsItem && !bullets.some(bulletMentionsGoldMetals)) {
    return {
      bullets: representativeItems.map(fallbackBulletForItem),
      source: catalogOnly ? 'rule_based_missing_gold_metals_rejected_catalog_only' : 'rule_based_missing_gold_metals_rejected'
    };
  }
  return { bullets, source: 'ai_from_curated_news' };
}

export async function ensureCuratedNews({
  apiKey,
  country = 'IN',
  forceRefresh = false,
  minFreshItems = 8
} = {}) {
  const current = getCuratedNews({ limit: 60 });
  const meaningfulCurrentCount = countMeaningfulItems(current);
  if (!forceRefresh && meaningfulCurrentCount >= minFreshItems) {
    return { items: current, refreshed: false, count: current.length, meaningful_count: meaningfulCurrentCount };
  }

  const ingestResult = await ingestCuratedNews({ apiKey, country, forceRefresh });
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
