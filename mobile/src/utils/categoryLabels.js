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

export const ASSET_TYPE_OPTIONS_BY_CATEGORY = {
  'Cash & Bank Accounts': ['Savings Account', 'Current Account', 'Fixed Deposit', 'Recurring Deposit', 'Cash', 'Sweep Account'],
  'Market Stocks & RSUs': ['Direct Stocks', 'Mutual Funds', 'ETFs', 'EGR', 'Bonds / Debentures', 'RSUs', 'ESOPs', 'PMS / AIF'],
  'Retirement Funds': ['EPF', 'PPF', 'VPF', 'NPS', 'Superannuation', 'Pension Plan'],
  'Real Estate': ['Residential Property', 'Commercial Property', 'Land / Plot', 'REIT', 'Under Construction Property'],
  'Vehicles': ['Car', 'Two-Wheeler', 'Commercial Vehicle', 'Boat / Yacht', 'Other Vehicle'],
  'Business Equity': ['Private Company Shares', 'Partnership Stake', 'Startup Equity', 'Founder Equity', 'Private Investment'],
  'Precious Metals': ['Sovereign Gold Bond', 'Gold ETF', 'Gold Coin / Bar', 'Silver Coin / Bar', 'Other Bullion'],
  'Jewelry & Watches': ['Gold Jewelry', 'Diamond Jewelry', 'Gemstones', 'Luxury Watch', 'Other Jewelry'],
  'Collectibles': ['Art', 'Antiques', 'Wine', 'Memorabilia', 'Trading Cards', 'Rare Coins', 'Other Collectible'],
  'Insurance & Other': ['Life Insurance Cash Value', 'Endowment Policy', 'ULIP', 'Crypto', 'Intellectual Property', 'Other Asset']
};

export function getAssetTypeOptions(category = '') {
  return ASSET_TYPE_OPTIONS_BY_CATEGORY[String(category || '').trim()] || [];
}

export function bucketFromAssetCategory(category = '') {
  const c = String(category || '').toLowerCase();
  if (c.includes('cash & bank') || c.includes('banking') || c.includes('deposit') || c.includes('cash')) return 'Cash & Bank Accounts';
  if (c.includes('market stocks') || c.includes('rsu') || c.includes('market') || c.includes('etf') || c.includes('stock') || c.includes('mutual')) return 'Market Stocks & RSUs';
  if (c.includes('retirement') || c.includes('epf') || c.includes('ppf') || c.includes('vpf') || c.includes('nps')) return 'Retirement Funds';
  if (c.includes('real estate') || c.includes('property')) return 'Real Estate';
  if (c.includes('vehicle') || c.includes('car') || c.includes('boat') || c.includes('powersport')) return 'Vehicles';
  if (c.includes('business equity') || c.includes('startup') || c.includes('private ownership')) return 'Business Equity';
  if (c.includes('jewelry') || c.includes('jewellery') || c.includes('watch') || c.includes('gemstone')) return 'Jewelry & Watches';
  if (c.includes('collectible') || c.includes('art') || c.includes('wine') || c.includes('memorabilia') || c.includes('trading card')) return 'Collectibles';
  if (c.includes('precious') || c.includes('gold') || c.includes('silver')) return 'Precious Metals';
  if (c.includes('insurance') || c.includes('crypto') || c.includes('ip')) return 'Insurance & Other';
  return 'Insurance & Other';
}

export function getCategoryDisplayParts(category, t = (value) => value) {
  const base = String(category || '').trim();
  if (!base) return { title: '', detail: '' };
  const detail = CATEGORY_DETAIL_LABELS[base];
  return {
    title: t(base),
    detail: detail ? t(detail) : ''
  };
}

export function getCategoryDisplayLabel(category, t = (value) => value) {
  const { title, detail } = getCategoryDisplayParts(category, t);
  if (!title) return '';
  return detail ? `${title} (${detail})` : title;
}
