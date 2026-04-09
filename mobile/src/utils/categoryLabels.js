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
