const OPENAI_KEY_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPEN_AI_API_KEY',
  'OPENAI_KEY',
  'OPENAI_APIKEY'
];

function normalizeEnvValue(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  // Handle keys pasted with wrapping quotes in env dashboards.
  return trimmed.replace(/^['"]|['"]$/g, '').trim();
}

export function resolveOpenAiApiKey(env = process.env) {
  for (const key of OPENAI_KEY_ENV_KEYS) {
    const value = normalizeEnvValue(env?.[key] || '');
    if (value) return value;
  }
  return '';
}
