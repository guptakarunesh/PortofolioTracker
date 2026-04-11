export function sanitizeSubscriptionHistory(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
}
