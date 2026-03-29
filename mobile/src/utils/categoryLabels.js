const CATEGORY_DETAIL_LABELS = {
  'Cash & Bank Accounts': 'Savings, Current, Fixed Deposits',
  'Market Stocks & RSUs': 'Listed Stocks, ETFs, Vested RSUs',
  'Retirement Funds': 'EPF / NPS / VPF / PPF',
  'Real Estate': 'Home, Land, Investment Property',
  'Vehicles': 'Cars, Two-Wheelers, EVs',
  'Business Equity': 'Private Ownership, Startups',
  'Precious Metals': 'Gold, Silver Bullion / Coins',
  'Jewelry & Watches': 'Jewellery, Luxury Watches, Gemstones',
  'Collectibles': 'Art, Memorabilia, Trading Cards'
};

export function getCategoryDisplayLabel(category, t = (value) => value) {
  const base = String(category || '').trim();
  if (!base) return '';
  const detail = CATEGORY_DETAIL_LABELS[base];
  if (!detail) return t(base);
  return `${t(base)} (${t(detail)})`;
}

