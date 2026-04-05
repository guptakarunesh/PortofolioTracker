import process from 'node:process';

const TASKS = {
  ping: { method: 'GET', path: '/internal/cron/ping' },
  maintenance: { method: 'POST', path: '/internal/cron/shared-news/maintenance' },
  refresh: { method: 'POST', path: '/internal/cron/shared-news/refresh' }
};

function resolveBaseUrl() {
  const explicitBaseUrl = String(process.env.CRON_BASE_URL || '').trim();
  if (explicitBaseUrl) return explicitBaseUrl;
  const hostport = String(process.env.CRON_TARGET_HOSTPORT || '').trim();
  if (!hostport) {
    throw new Error('Set CRON_BASE_URL or CRON_TARGET_HOSTPORT for the cron runner.');
  }
  return `http://${hostport}`;
}

async function main() {
  const taskName = String(process.argv[2] || process.env.CRON_TASK || 'ping').trim().toLowerCase();
  const task = TASKS[taskName];
  if (!task) {
    throw new Error(`Unknown cron task "${taskName}". Supported: ${Object.keys(TASKS).join(', ')}`);
  }

  const baseUrl = resolveBaseUrl();
  const timeoutMs = Math.max(10_000, Number.parseInt(process.env.CRON_TIMEOUT_MS || '180000', 10) || 180_000);
  const secret = String(process.env.INTERNAL_CRON_SECRET || '').trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(task.path, baseUrl), {
      method: task.method,
      headers: {
        Accept: 'application/json',
        ...(secret ? { 'x-internal-cron-secret': secret } : {})
      },
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`${task.method} ${task.path} failed with ${response.status}: ${raw}`);
    }
    console.log(raw || `${taskName} ok`);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
