import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '../src/lib/legal.js';

const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const DEFAULT_TIMEOUT_MS = Math.max(30_000, Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '120000', 10) || 120_000);
const DEFAULT_FORCE_REFRESH = process.env.FORCE_REFRESH === '0' ? false : true;
const DEFAULT_EXPECT_AI = process.env.EXPECT_AI_SOURCE === '1';

function usage() {
  console.log(`Usage:
  npm run test:ai:live -- [options]

Options:
  --base-url <url>        Backend URL. Default: ${DEFAULT_BASE_URL}
  --auth-token <token>    Use an existing bearer token instead of auto-registering a mock user.
  --payload-file <path>   JSON file with register/assets/liabilities overrides.
  --mobile <10 digits>    Mobile number for auto-registration.
  --device-id <id>        Device id header/body value.
  --timeout-ms <number>   Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --expect-ai             Exit non-zero unless news_source starts with "ai_".
  --no-force-refresh      Call /api/ai/insights without force_refresh=1.
  --help                  Show this help.

Notes:
  - Auto-registration uses firebase_id_token=mock:<mobile>, so your local backend should run with OTP_PROVIDER=mock.
  - If your backend already has a usable session token, pass --auth-token instead.
  - The backend itself must have a valid OpenAI key configured for a true OpenAI-backed run.
`);
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    authToken: process.env.AUTH_TOKEN || '',
    payloadFile: process.env.PAYLOAD_FILE || '',
    mobile: process.env.SMOKE_MOBILE || '',
    deviceId: process.env.SMOKE_DEVICE_ID || `ai-live-smoke-${randomUUID()}`,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    forceRefresh: DEFAULT_FORCE_REFRESH,
    expectAi: DEFAULT_EXPECT_AI
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--expect-ai') {
      options.expectAi = true;
      continue;
    }
    if (arg === '--no-force-refresh') {
      options.forceRefresh = false;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
      continue;
    }
    if (arg.startsWith('--auth-token=')) {
      options.authToken = arg.slice('--auth-token='.length);
      continue;
    }
    if (arg.startsWith('--payload-file=')) {
      options.payloadFile = arg.slice('--payload-file='.length);
      continue;
    }
    if (arg.startsWith('--mobile=')) {
      options.mobile = arg.slice('--mobile='.length);
      continue;
    }
    if (arg.startsWith('--device-id=')) {
      options.deviceId = arg.slice('--device-id='.length);
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number.parseInt(arg.slice('--timeout-ms='.length), 10) || DEFAULT_TIMEOUT_MS;
      continue;
    }
    if (arg === '--base-url' || arg === '--auth-token' || arg === '--payload-file' || arg === '--mobile' || arg === '--device-id' || arg === '--timeout-ms') {
      const nextValue = argv[idx + 1];
      if (!nextValue) {
        throw new Error(`Missing value for ${arg}`);
      }
      idx += 1;
      if (arg === '--base-url') options.baseUrl = nextValue;
      if (arg === '--auth-token') options.authToken = nextValue;
      if (arg === '--payload-file') options.payloadFile = nextValue;
      if (arg === '--mobile') options.mobile = nextValue;
      if (arg === '--device-id') options.deviceId = nextValue;
      if (arg === '--timeout-ms') options.timeoutMs = Number.parseInt(nextValue, 10) || DEFAULT_TIMEOUT_MS;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildMobile() {
  const digits = String(Date.now()).replace(/\D/g, '');
  return `9${digits.slice(-9).padStart(9, '0')}`;
}

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return overrideValue != null ? overrideValue : baseValue;
  }
  if (baseValue && typeof baseValue === 'object' && overrideValue && typeof overrideValue === 'object') {
    const merged = { ...baseValue };
    for (const [key, value] of Object.entries(overrideValue)) {
      merged[key] = deepMerge(baseValue[key], value);
    }
    return merged;
  }
  return overrideValue != null ? overrideValue : baseValue;
}

function buildDefaultPayload(mobile, deviceId) {
  return {
    register: {
      full_name: 'AI',
      mobile,
      email: `${mobile}@example.com`,
      country: 'India',
      firebase_id_token: `mock:${mobile}`,
      consent_privacy: true,
      consent_terms: true,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      terms_version: TERMS_VERSION,
      device_context: { device_id: deviceId }
    },
    assets: [
      {
        category: 'Precious Metals',
        name: 'Gold Coins',
        current_value: 180000,
        invested_amount: 150000,
        account_ref: 'GOLD-LOCAL-1'
      },
      {
        category: 'Stocks',
        name: 'Nifty 50 ETF',
        current_value: 240000,
        invested_amount: 210000,
        account_ref: 'ETF-LOCAL-1'
      },
      {
        category: 'EPF',
        name: 'EPF Account',
        current_value: 320000,
        invested_amount: 280000,
        account_ref: 'EPF-LOCAL-1'
      },
      {
        category: 'Fixed Deposit',
        name: 'Emergency FD',
        current_value: 150000,
        invested_amount: 150000,
        account_ref: 'FD-LOCAL-1'
      }
    ],
    liabilities: [
      {
        loan_type: 'Home Loan',
        lender: 'Sample Bank',
        outstanding_amount: 850000,
        original_amount: 1200000,
        interest_rate: 8.6,
        emi_amount: 25000,
        account_ref: 'HL-LOCAL-1'
      }
    ]
  };
}

function loadPayload(options) {
  const mobile = String(options.mobile || buildMobile()).trim();
  const defaultPayload = buildDefaultPayload(mobile, options.deviceId);
  if (!options.payloadFile) {
    return defaultPayload;
  }
  const raw = readFileSync(options.payloadFile, 'utf8');
  const parsed = JSON.parse(raw);
  const merged = deepMerge(defaultPayload, parsed);
  if (merged?.register?.mobile) {
    merged.register.firebase_id_token = parsed?.register?.firebase_id_token || `mock:${merged.register.mobile}`;
  }
  if (!merged?.register?.device_context?.device_id) {
    merged.register = {
      ...merged.register,
      device_context: { ...(merged.register?.device_context || {}), device_id: options.deviceId }
    };
  }
  return merged;
}

async function requestJson(baseUrl, path, { method = 'GET', body, token, deviceId, timeoutMs } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        'content-type': 'application/json',
        'x-device-id': deviceId,
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }

    if (!response.ok) {
      const error = new Error(`${method} ${path} failed with ${response.status}`);
      error.status = response.status;
      error.payload = parsed;
      throw error;
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function printPayloadSummary(payload) {
  console.log(`Payload: ${payload.assets.length} assets, ${payload.liabilities.length} liabilities`);
  for (const asset of payload.assets) {
    console.log(`  asset: ${asset.category} | ${asset.name} | current=${asset.current_value}`);
  }
  for (const liability of payload.liabilities) {
    console.log(`  liability: ${liability.loan_type} | ${liability.lender} | outstanding=${liability.outstanding_amount}`);
  }
}

function printInsightsSummary(insights) {
  const bullets = Array.isArray(insights?.news_bullets) ? insights.news_bullets : [];
  console.log(`news_source: ${insights?.news_source || 'n/a'}`);
  if (insights?.warning) console.log(`warning: ${insights.warning}`);
  if (insights?.ingest_warning) console.log(`ingest_warning: ${insights.ingest_warning}`);
  if (insights?.ingest_error) console.log(`ingest_error: ${insights.ingest_error}`);
  if (insights?.error) console.log(`error: ${insights.error}`);
  console.log(`as_of: ${insights?.as_of || 'n/a'}`);
  console.log(`news_bullets: ${bullets.length}`);
  bullets.forEach((bullet, idx) => {
    console.log(`${idx + 1}. ${bullet}`);
  });
}

async function ensureHealth(options) {
  console.log(`Checking ${options.baseUrl}/health ...`);
  const health = await requestJson(options.baseUrl, '/health', {
    deviceId: options.deviceId,
    timeoutMs: options.timeoutMs
  });
  console.log(`Health OK: users=${health?.counts?.users ?? 'n/a'}, assets=${health?.counts?.assets ?? 'n/a'}, liabilities=${health?.counts?.liabilities ?? 'n/a'}`);
}

async function registerIfNeeded(options, payload) {
  if (options.authToken) {
    console.log('Using existing auth token.');
    return options.authToken;
  }

  console.log(`Registering disposable user ${payload.register.mobile} ...`);
  try {
    const register = await requestJson(options.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: payload.register,
      deviceId: options.deviceId,
      timeoutMs: options.timeoutMs
    });
    if (!register?.token) {
      throw new Error('Registration succeeded but no token was returned.');
    }
    console.log(`Registered user id=${register?.user?.id || 'n/a'}`);
    return register.token;
  } catch (error) {
    const hint =
      error?.status === 401 || error?.status === 400
        ? 'Hint: if you are auto-registering, run the backend locally with OTP_PROVIDER=mock or pass --auth-token.'
        : '';
    throw new Error([
      `Could not auto-register a disposable user.`,
      hint,
      error.message,
      typeof error?.payload === 'string' ? error.payload : JSON.stringify(error?.payload || {})
    ].filter(Boolean).join('\n'));
  }
}

async function seedPortfolio(options, token, payload) {
  for (const asset of payload.assets) {
    await requestJson(options.baseUrl, '/api/assets', {
      method: 'POST',
      body: asset,
      token,
      deviceId: options.deviceId,
      timeoutMs: options.timeoutMs
    });
  }
  for (const liability of payload.liabilities) {
    await requestJson(options.baseUrl, '/api/liabilities', {
      method: 'POST',
      body: liability,
      token,
      deviceId: options.deviceId,
      timeoutMs: options.timeoutMs
    });
  }
  console.log('Sample portfolio seeded.');
}

async function fetchInsights(options, token) {
  const query = options.forceRefresh ? '?force_refresh=1' : '';
  console.log(`Requesting /api/ai/insights${query} ...`);
  return requestJson(options.baseUrl, `/api/ai/insights${query}`, {
    method: 'GET',
    token,
    deviceId: options.deviceId,
    timeoutMs: options.timeoutMs
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const payload = loadPayload(options);
  await ensureHealth(options);
  printPayloadSummary(payload);
  const token = await registerIfNeeded(options, payload);
  await seedPortfolio(options, token, payload);
  const insights = await fetchInsights(options, token);
  printInsightsSummary(insights);

  const bullets = Array.isArray(insights?.news_bullets) ? insights.news_bullets : [];
  const source = String(insights?.news_source || '');
  if (bullets.length !== 5) {
    throw new Error(`Expected 5 news bullets but received ${bullets.length}.`);
  }
  if (options.expectAi && !source.startsWith('ai_')) {
    throw new Error(`Expected an OpenAI-backed source, but received "${source || 'n/a'}".`);
  }

  console.log(options.expectAi ? 'Live AI smoke passed.' : 'AI insights smoke completed.');
}

main().catch((error) => {
  console.error('AI insights smoke failed.');
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
