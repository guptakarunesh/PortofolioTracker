function toSafeString(value = '') {
  if (value == null) return '';
  return String(value);
}

function toSafeNumber(value = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

export function sanitizeSubscriptionHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({
      id: row?.id == null ? null : toSafeString(row.id),
      plan: toSafeString(row?.plan),
      amount_inr: toSafeNumber(row?.amount_inr),
      status: toSafeString(row?.status),
      provider: toSafeString(row?.provider),
      purchased_at: toSafeString(row?.purchased_at),
      valid_until: toSafeString(row?.valid_until),
      period: toSafeString(row?.period),
      provider_txn_id: toSafeString(row?.provider_txn_id)
    }));
}
