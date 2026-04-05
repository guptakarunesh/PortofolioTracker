export function errorText(error) {
  return String(error?.message || error || '').trim();
}

export function isTransientDatabaseError(error) {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  return (
    text.includes('database query failed') ||
    text.includes('database is initializing') ||
    text.includes('database query timed out') ||
    text.includes('connection terminated due to connection timeout') ||
    text.includes('database transaction connect failed') ||
    text.includes('database dns probe failed') ||
    text.includes('database tcp probe failed')
  );
}

export function serviceUnavailableBody(message = 'Service is temporarily unavailable. Please try again in a few seconds.') {
  return {
    error: 'service_temporarily_unavailable',
    message
  };
}

export function handleTransientDatabaseError(res, error, options = {}) {
  if (!isTransientDatabaseError(error)) return false;
  const {
    logLabel = 'server',
    message = 'Service is temporarily unavailable. Please try again in a few seconds.'
  } = options;
  console.error(`[${logLabel}] transient database error`, errorText(error));
  res.status(503).json(serviceUnavailableBody(message));
  return true;
}
