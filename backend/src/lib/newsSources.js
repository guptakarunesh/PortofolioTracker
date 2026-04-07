export const NEWS_MAX_AGE_HOURS = 48;

export const CURATED_NEWS_SOURCES = [
  {
    key: 'economic_times',
    name: 'The Economic Times',
    domains: ['economictimes.indiatimes.com', 'm.economictimes.com', 'economictimes.com'],
    trustScore: 90,
    official: false,
    priority: 84,
    categories: ['bank_savings', 'stocks', 'retirement', 'gold_metals', 'real_estate', 'other_savings']
  },
  {
    key: 'moneycontrol',
    name: 'Moneycontrol',
    domains: ['moneycontrol.com'],
    trustScore: 88,
    official: false,
    priority: 82,
    categories: ['bank_savings', 'stocks', 'retirement', 'gold_metals', 'real_estate', 'other_savings']
  },
  {
    key: 'mint',
    name: 'LiveMint',
    domains: ['livemint.com'],
    trustScore: 87,
    official: false,
    priority: 80,
    categories: ['bank_savings', 'stocks', 'retirement', 'gold_metals', 'real_estate', 'other_savings']
  }
];

export const CURATED_NEWS_CATEGORIES = [
  {
    key: 'bank_savings',
    label: 'Bank savings / FDs / rates',
    investmentLabel: 'FDs / Savings / RDs',
    reviewPrompt: 'review deposit rates, savings yields, and bank-linked cash allocation',
    guidance: 'compare bank deposit rates, liquidity needs, and cash allocation before changing savings decisions'
  },
  {
    key: 'gold_metals',
    label: 'Gold / silver / metals',
    investmentLabel: 'Gold / Silver / Metals',
    reviewPrompt: 'review gold, silver, and metals exposure',
    guidance: 'check whether gold or metals exposure still matches your hedging and diversification needs'
  },
  {
    key: 'retirement',
    label: 'Retirement / EPF / NPS',
    investmentLabel: 'EPF / NPS / Retirement',
    reviewPrompt: 'review retirement accounts, contributions, and rule changes',
    guidance: 'review retirement contribution plans, account servicing, and rule updates before making changes'
  },
  {
    key: 'stocks',
    label: 'Stocks / mutual funds / ETFs',
    investmentLabel: 'Stocks / ETFs / Mutual Funds',
    reviewPrompt: 'review market-linked investments and fund allocation',
    guidance: 'review stock, ETF, and fund exposure instead of reacting to price moves alone'
  },
  {
    key: 'real_estate',
    label: 'Real estate',
    investmentLabel: 'Real Estate',
    reviewPrompt: 'review real-estate allocation and financing assumptions',
    guidance: 'recheck property demand, rates, and financing assumptions before committing fresh capital'
  },
  {
    key: 'other_savings',
    label: 'Other savings / insurance / bonds',
    investmentLabel: 'Insurance / Bonds / Other Savings',
    reviewPrompt: 'review insurance, bonds, and non-equity savings buckets',
    guidance: 'review bond, insurance, and other savings products for yield, policy, or servicing changes'
  }
];

export function categoryByKey(key = '') {
  return CURATED_NEWS_CATEGORIES.find((item) => item.key === key) || CURATED_NEWS_CATEGORIES[CURATED_NEWS_CATEGORIES.length - 1];
}

export function sourceByKey(key = '') {
  return CURATED_NEWS_SOURCES.find((item) => item.key === key) || null;
}

export function sourceByName(value = '') {
  const text = String(value || '').trim().toLowerCase();
  return CURATED_NEWS_SOURCES.find((item) => item.name.toLowerCase() === text) || null;
}

export function sourceByUrl(value = '') {
  const url = String(value || '').toLowerCase();
  return CURATED_NEWS_SOURCES.find((item) => item.domains.some((domain) => url.includes(domain))) || null;
}

export const GOLD_SILVER_SOURCE_KEYS = ['economic_times', 'moneycontrol', 'mint'];
