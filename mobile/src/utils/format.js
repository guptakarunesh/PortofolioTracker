const localeForCurrency = (currency = 'INR') => (String(currency || '').toUpperCase() === 'INR' ? 'en-IN' : 'en-US');

export const formatINR = (value, currency = 'INR') =>
  new Intl.NumberFormat(localeForCurrency(currency), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0
  }).format(Number(value || 0));

export const convertFromInr = (value, currency = 'INR', fxRates = {}) => {
  const amount = Number(value || 0);
  if (currency === 'INR') return amount;
  const rate = Number(fxRates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return amount;
  return amount * rate;
};

export const formatAmountFromInr = (value, currency = 'INR', fxRates = {}) =>
  formatINR(convertFromInr(value, currency, fxRates), currency);

export const currencySymbol = (currency = 'INR') => {
  const formatted = new Intl.NumberFormat(localeForCurrency(currency), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(0);
  return formatted.replace(/[0-9,.\s]/g, '') || currency;
};

export const formatPct = (value) => `${Number(value || 0).toFixed(2)}%`;

export const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
