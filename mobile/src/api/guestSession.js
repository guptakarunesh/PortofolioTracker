const ASSET_CATEGORIES = [
  'Cash & Bank Accounts',
  'Market Stocks & RSUs',
  'Retirement Funds',
  'Real Estate',
  'Vehicles',
  'Business Equity',
  'Precious Metals',
  'Jewelry & Watches',
  'Collectibles',
  'Insurance & Other'
];

const TARGETS_LAST_UPDATED_KEY = 'targets_last_updated_at';

const clone = (value) => JSON.parse(JSON.stringify(value));

const nowIso = () => new Date().toISOString();

const isoDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysIso = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
};

const addDaysDate = (baseValue, days = 0) => {
  const date = new Date(baseValue);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};

const targetSettingKey = (category) =>
  `yearly_target_${String(category || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`;

const toInitials = (value = '') => {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  if (parts.length) return parts.join('');
  const letters = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return letters || 'NA';
};

function createTargetSettings() {
  return {
    [targetSettingKey('Cash & Bank Accounts')]: '1200000',
    [targetSettingKey('Market Stocks & RSUs')]: '1800000',
    [targetSettingKey('Retirement Funds')]: '900000',
    [targetSettingKey('Real Estate')]: '3500000',
    [targetSettingKey('Vehicles')]: '600000',
    [targetSettingKey('Business Equity')]: '800000',
    [targetSettingKey('Precious Metals')]: '300000',
    [targetSettingKey('Jewelry & Watches')]: '150000',
    [targetSettingKey('Collectibles')]: '100000',
    [targetSettingKey('Insurance & Other')]: '250000'
  };
}

function computeAllocation(assets = []) {
  const byCategory = new Map(ASSET_CATEGORIES.map((category) => [category, 0]));
  assets.forEach((asset) => {
    const category = ASSET_CATEGORIES.includes(asset?.category) ? asset.category : 'Insurance & Other';
    byCategory.set(category, Number(byCategory.get(category) || 0) + Number(asset?.current_value || 0));
  });
  const totalAssets = Array.from(byCategory.values()).reduce((sum, value) => sum + Number(value || 0), 0);
  return ASSET_CATEGORIES.map((category) => {
    const currentValue = Number(byCategory.get(category) || 0);
    return {
      category,
      currentValue,
      pctOfTotal: totalAssets > 0 ? (currentValue / totalAssets) * 100 : 0
    };
  });
}

function computeSummary(state) {
  const allocation = computeAllocation(state.assets);
  const totalAssets = allocation.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const totalLiabilities = state.liabilities.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0);
  return {
    lastUpdated: nowIso(),
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    allocation,
    performance: computePerformanceSnapshots(state)
  };
}

function computePerformanceSnapshots(state) {
  const summary = {
    totalAssets: state.assets.reduce((sum, item) => sum + Number(item.current_value || 0), 0),
    totalLiabilities: state.liabilities.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0)
  };
  const assetFactors = [0.74, 0.79, 0.84, 0.9, 0.96, 1];
  const liabilityFactors = [1.08, 1.05, 1.03, 1.01, 1, 1];
  return assetFactors.map((assetFactor, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (assetFactors.length - index - 1));
    date.setDate(1);
    const totalAssets = Math.round(summary.totalAssets * assetFactor);
    const totalLiabilities = Math.round(summary.totalLiabilities * liabilityFactors[index]);
    return {
      quarterStart: date.toISOString(),
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities
    };
  });
}

function computeAiScore(state) {
  const summary = computeSummary(state);
  const totalAssets = Number(summary.totalAssets || 0);
  const totalLiabilities = Number(summary.totalLiabilities || 0);
  const netWorth = Number(summary.netWorth || 0);
  const allocation = summary.allocation || [];
  const liquidAssets = allocation
    .filter((item) =>
      ['Cash & Bank Accounts', 'Market Stocks & RSUs', 'Retirement Funds'].includes(String(item?.category || ''))
    )
    .reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 1;
  const liquidityCoverage = totalLiabilities > 0 ? liquidAssets / totalLiabilities : liquidAssets > 0 ? 3 : 0;
  const diversificationCount = allocation.filter((item) => Number(item.currentValue || 0) > 0).length;
  const rawScore =
    100 -
    Math.min(42, debtRatio * 58) +
    Math.min(18, liquidityCoverage * 6) +
    Math.min(14, diversificationCount * 2.4) +
    (netWorth > 0 ? 6 : 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));
  const label = score >= 80 ? 'Strong Financial Position' : score >= 65 ? 'Stable Financial Position' : 'Building Financial Position';
  const drivers = [
    {
      key: 'debt_to_assets',
      label: 'Debt-to-Asset Ratio',
      value_label: `${Math.round(debtRatio * 100)}%`,
      detail:
        debtRatio <= 0.3
          ? 'Liabilities are well contained relative to assets.'
          : 'Reducing liabilities or growing assets further can improve this balance.'
    },
    {
      key: 'liquidity',
      label: 'Liquidity Coverage',
      value_label: `${liquidityCoverage.toFixed(1)}x`,
      detail:
        liquidityCoverage >= 1
          ? 'Liquid assets can comfortably support near-term obligations.'
          : 'Increasing liquid holdings can improve short-term flexibility.'
    },
    {
      key: 'diversification',
      label: 'Asset Diversity',
      value_label: `${diversificationCount} active categories`,
      detail:
        diversificationCount >= 5
          ? 'Your assets are spread across multiple categories.'
          : 'Adding variety across asset types can improve resilience.'
    }
  ];
  const nextSteps = [];
  if (debtRatio > 0.35) nextSteps.push('Reduce high-cost liabilities or increase assets to improve the debt-to-asset ratio.');
  if (liquidityCoverage < 1) nextSteps.push('Build a stronger liquid buffer using cash, bank balances, or market investments.');
  if (diversificationCount < 5) nextSteps.push('Add or rebalance holdings across more asset categories to reduce concentration.');
  if (!nextSteps.length) nextSteps.push('Keep updating values regularly so the score reflects your latest financial position.');
  return {
    score,
    label,
    summary:
      score >= 80
        ? 'Your preview portfolio looks well balanced with manageable leverage and healthy liquidity.'
        : score >= 65
          ? 'Your preview portfolio is in a good place, with a few areas that could improve resilience.'
          : 'Your preview portfolio has room to improve across leverage, liquidity, or diversification.',
    disclaimer:
      'This preview score is based on the sample assets and liabilities inside guest mode. It is for awareness only and not investment, tax, or legal advice.',
    totals: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth
    },
    drivers,
    next_steps: nextSteps,
    as_of: nowIso()
  };
}

function createReceipt(paymentId = 1) {
  return {
    id: paymentId,
    invoice_number: `WRTH-${String(paymentId).padStart(4, '0')}`,
    invoice_date: isoDate(new Date()),
    supplier: {
      legal_name: 'Nexra Labs Tech Pvt Ltd',
      gstin: '27ABCDE1234F1Z5',
      address: 'Bengaluru, India'
    },
    customer: {
      initials: 'GP'
    },
    line_item: {
      plan: 'premium_yearly',
      period: 'yearly',
      sac_code: '998314',
      description: 'Worthio Premium Annual Preview Subscription'
    },
    taxes: {
      taxable_value: 1270.34,
      cgst_amount: 114.33,
      sgst_amount: 114.33,
      gst_total: 228.66
    },
    total_amount_inr: 1499,
    payment: {
      provider: 'preview',
      transaction_id: `preview-${paymentId}`,
      status: 'paid'
    }
  };
}

function createGuestState() {
  const timestamp = nowIso();
  const settings = {
    preferred_currency: 'INR',
    language: 'en',
    privacy_pin: '1234',
    privacy_pin_enabled: '1',
    biometric_login_enabled: '0',
    ui_theme: 'worthio',
    target_date: `${new Date().getFullYear()}-12-31`,
    risk_profile: 'moderate',
    [TARGETS_LAST_UPDATED_KEY]: timestamp,
    ...createTargetSettings()
  };
  const user = {
    id: 'guest-preview-user',
    full_name: 'Guest Preview',
    mobile: '9999999999',
    email: 'preview@worthio.app',
    country: 'India',
    created_at: timestamp,
    last_login_at: timestamp
  };
  const assets = [
    {
      id: 1,
      category: 'Cash & Bank Accounts',
      name: 'HDFC Bank Emergency Fund',
      institution: 'HDFC Bank Emergency Fund',
      reach_via: 'Branch',
      account_ref: 'HDFC-1042',
      tracking_url: 'https://www.hdfcbank.com',
      current_value: 850000,
      invested_amount: 800000,
      notes_for_family: 'Primary liquidity buffer and bill-paying account.',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 2,
      category: 'Market Stocks & RSUs',
      name: 'Zerodha Equity Portfolio',
      institution: 'Zerodha Equity Portfolio',
      reach_via: 'Portal',
      account_ref: 'DEMAT-9918',
      tracking_url: 'https://kite.zerodha.com',
      current_value: 1250000,
      invested_amount: 980000,
      notes_for_family: 'Core long-term investing account.',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 3,
      category: 'Retirement Funds',
      name: 'EPF and NPS',
      institution: 'EPF and NPS',
      reach_via: 'Portal',
      account_ref: 'RET-4421',
      tracking_url: 'https://www.cra-nsdl.com',
      current_value: 540000,
      invested_amount: 420000,
      notes_for_family: 'Retirement-linked holdings.',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 4,
      category: 'Real Estate',
      name: 'Pune Apartment',
      institution: 'Pune Apartment',
      reach_via: 'Branch',
      account_ref: 'PROP-22A',
      tracking_url: '',
      current_value: 3200000,
      invested_amount: 2750000,
      notes_for_family: 'Self-occupied property.',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 5,
      category: 'Precious Metals',
      name: 'Sovereign Gold Bonds',
      institution: 'Sovereign Gold Bonds',
      reach_via: 'Portal',
      account_ref: 'SGB-7012',
      tracking_url: 'https://www.rbi.org.in',
      current_value: 210000,
      invested_amount: 180000,
      notes_for_family: 'Diversification holding.',
      created_at: timestamp,
      updated_at: timestamp
    }
  ];
  const liabilities = [
    {
      id: 1,
      loan_type: 'Home Loan',
      lender: 'HDFC Bank',
      holder_type: 'Self',
      reach_via: 'Branch',
      account_ref: 'HL-8842',
      outstanding_amount: 1450000,
      notes_for_family: 'Main housing loan.',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 2,
      loan_type: 'Credit Card',
      lender: 'Axis Bank',
      holder_type: 'Self',
      reach_via: 'Portal',
      account_ref: 'CC-1129',
      outstanding_amount: 48000,
      notes_for_family: 'Statement due next cycle.',
      created_at: timestamp,
      updated_at: timestamp
    }
  ];
  const reminders = [
    {
      id: 1,
      due_date: isoDate(addDaysDate(new Date(), 3)),
      category: 'EMI',
      description: 'Home loan EMI',
      amount: 32500,
      alert_days_before: 3,
      repeat_type: 'monthly',
      repeat_every_days: null,
      status: 'Pending',
      created_at: timestamp,
      updated_at: timestamp
    },
    {
      id: 2,
      due_date: isoDate(addDaysDate(new Date(), 14)),
      category: 'Insurance',
      description: 'Health insurance renewal',
      amount: 18500,
      alert_days_before: 7,
      repeat_type: 'yearly',
      repeat_every_days: null,
      status: 'Pending',
      created_at: timestamp,
      updated_at: timestamp
    }
  ];
  const owner = {
    id: user.id,
    full_name: user.full_name,
    mobile: user.mobile,
    email: user.email
  };
  const familyMembers = [
    {
      id: 1,
      role: 'write',
      created_at: timestamp,
      updated_at: timestamp,
      member: {
        id: 'guest-family-1',
        full_name: 'AK',
        mobile: '9812345678',
        email: 'ak@example.com'
      }
    }
  ];
  const familyInvites = [
    {
      id: 1,
      role: 'read',
      status: 'pending',
      expires_at: addDaysIso(7),
      created_at: timestamp,
      updated_at: timestamp,
      mobile: '9123456789'
    }
  ];
  const familyAudit = [
    {
      id: 1,
      action: 'member_added',
      meta: { role: 'write' },
      created_at: timestamp,
      actor: owner
    },
    {
      id: 2,
      action: 'invite_created',
      meta: { role: 'read' },
      created_at: timestamp,
      actor: owner
    }
  ];
  const recentActivity = [
    {
      id: 1,
      kind: 'asset_updated',
      label: 'Zerodha Equity Portfolio',
      actor_initials: toInitials(user.full_name),
      created_at: timestamp
    },
    {
      id: 2,
      kind: 'liability_updated',
      label: 'HDFC Bank',
      actor_initials: toInitials(user.full_name),
      created_at: timestamp
    },
    {
      id: 3,
      kind: 'family_invite_created',
      label: 'Family Invite',
      actor_initials: toInitials(user.full_name),
      created_at: timestamp
    }
  ];
  return {
    user,
    settings,
    assets,
    liabilities,
    reminders,
    owner,
    familyMembers,
    familyInvites,
    familyAudit,
    recentActivity,
    subscriptionStatus: {
      plan: 'premium_yearly',
      status: 'active',
      provider: 'preview',
      started_at: timestamp,
      current_period_end: addDaysIso(365),
      now: timestamp,
      limits: {}
    },
    subscriptionHistory: [
      {
        id: 1,
        plan: 'premium_yearly',
        amount_inr: 1499,
        status: 'paid',
        provider: 'preview',
        purchased_at: timestamp
      }
    ],
    consents: [
      {
        privacy_policy_version: 'v1.1',
        terms_version: 'v1.1',
        consented_at: timestamp,
        consent_source: 'guest_preview'
      }
    ],
    counters: {
      asset: 6,
      liability: 3,
      reminder: 3,
      familyMember: 2,
      invite: 2,
      audit: 3,
      activity: 4
    }
  };
}

let guestSessionActive = false;
let guestState = createGuestState();

function ensureGuestState() {
  if (!guestSessionActive) {
    throw new Error('Guest preview session is not active.');
  }
  return guestState;
}

function nextId(key) {
  guestState.counters[key] = Number(guestState.counters[key] || 1);
  const id = guestState.counters[key];
  guestState.counters[key] += 1;
  return id;
}

function recordRecentActivity(kind, label = '') {
  const state = ensureGuestState();
  state.recentActivity.unshift({
    id: nextId('activity'),
    kind,
    label,
    actor_initials: toInitials(state.user.full_name),
    created_at: nowIso()
  });
  state.recentActivity = state.recentActivity.slice(0, 30);
}

function recordFamilyAudit(action, meta = {}) {
  const state = ensureGuestState();
  state.familyAudit.unshift({
    id: nextId('audit'),
    action,
    meta,
    created_at: nowIso(),
    actor: clone(state.owner)
  });
  state.familyAudit = state.familyAudit.slice(0, 50);
}

function normalizeReminderStatus(status = '') {
  const value = String(status || '').trim();
  if (!value) return 'Pending';
  const lower = value.toLowerCase();
  if (lower === 'completed') return 'Completed';
  return 'Pending';
}

function advanceRecurringReminder(reminder) {
  const next = { ...reminder };
  const dueDate = new Date(`${String(reminder?.due_date || '').slice(0, 10)}T09:00:00`);
  if (Number.isNaN(dueDate.getTime())) return next;
  const type = String(reminder?.repeat_type || 'one_time');
  if (type === 'daily') dueDate.setDate(dueDate.getDate() + 1);
  if (type === 'weekly') dueDate.setDate(dueDate.getDate() + 7);
  if (type === 'every_x_days') dueDate.setDate(dueDate.getDate() + Math.max(2, Number(reminder?.repeat_every_days || 2)));
  if (type === 'monthly') dueDate.setMonth(dueDate.getMonth() + 1);
  if (type === 'yearly') dueDate.setFullYear(dueDate.getFullYear() + 1);
  next.due_date = isoDate(dueDate);
  next.status = 'Pending';
  next.updated_at = nowIso();
  return next;
}

export function startGuestSession() {
  guestState = createGuestState();
  guestSessionActive = true;
  return clone(guestState.user);
}

export function clearGuestSession() {
  guestSessionActive = false;
  guestState = createGuestState();
}

export function isGuestSessionActive() {
  return guestSessionActive;
}

export const guestApi = {
  me() {
    const state = ensureGuestState();
    return clone(state.user);
  },
  logout() {
    return { ok: true };
  },
  postSecurityContext() {
    return { ok: true };
  },
  getNotifications() {
    return { items: [] };
  },
  registerPushToken() {
    return { ok: true };
  },
  unregisterPushToken() {
    return { ok: true };
  },
  markNotificationRead() {
    return { ok: true };
  },
  markAllNotificationsRead() {
    return { ok: true };
  },
  getSummary() {
    return computeSummary(ensureGuestState());
  },
  getPerformanceLastSix() {
    return { snapshots: computePerformanceSnapshots(ensureGuestState()) };
  },
  getAssets() {
    const state = ensureGuestState();
    return clone(state.assets);
  },
  revealAssetSensitive(id, pin) {
    const state = ensureGuestState();
    if (String(pin || '').trim() !== String(state.settings.privacy_pin || '')) {
      throw new Error('Incorrect security PIN.');
    }
    const item = state.assets.find((asset) => Number(asset.id) === Number(id));
    if (!item) throw new Error('Asset not found.');
    return {
      account_ref: item.account_ref || '',
      tracking_url: item.tracking_url || '',
      notes: item.notes_for_family || ''
    };
  },
  createAsset(payload = {}) {
    const state = ensureGuestState();
    const timestamp = nowIso();
    const item = {
      id: nextId('asset'),
      category: ASSET_CATEGORIES.includes(payload.category) ? payload.category : 'Insurance & Other',
      name: String(payload.name || payload.institution || 'Preview Asset').trim(),
      institution: String(payload.institution || payload.name || 'Preview Asset').trim(),
      reach_via: String(payload.reach_via || 'Branch').trim() || 'Branch',
      account_ref: String(payload.account_ref || '').trim(),
      tracking_url: String(payload.tracking_url || '').trim(),
      current_value: Number(payload.current_value || 0),
      invested_amount: Number(payload.invested_amount || 0),
      notes_for_family: String(payload.notes_for_family || '').trim(),
      created_at: timestamp,
      updated_at: timestamp
    };
    state.assets.unshift(item);
    recordRecentActivity('asset_updated', item.institution);
    return clone(item);
  },
  updateAsset(id, payload = {}) {
    const state = ensureGuestState();
    const index = state.assets.findIndex((asset) => Number(asset.id) === Number(id));
    if (index === -1) throw new Error('Asset not found.');
    state.assets[index] = {
      ...state.assets[index],
      ...payload,
      category: ASSET_CATEGORIES.includes(payload.category) ? payload.category : state.assets[index].category,
      name: String(payload.name || payload.institution || state.assets[index].name || '').trim(),
      institution: String(payload.institution || payload.name || state.assets[index].institution || '').trim(),
      current_value: Number(payload.current_value ?? state.assets[index].current_value ?? 0),
      invested_amount: Number(payload.invested_amount ?? state.assets[index].invested_amount ?? 0),
      updated_at: nowIso()
    };
    recordRecentActivity('asset_updated', state.assets[index].institution);
    return clone(state.assets[index]);
  },
  deleteAsset(id) {
    const state = ensureGuestState();
    state.assets = state.assets.filter((asset) => Number(asset.id) !== Number(id));
    recordRecentActivity('asset_updated', 'Asset removed');
    return { ok: true };
  },
  getLiabilities() {
    const state = ensureGuestState();
    return clone(state.liabilities);
  },
  revealLiabilitySensitive(id, pin) {
    const state = ensureGuestState();
    if (String(pin || '').trim() !== String(state.settings.privacy_pin || '')) {
      throw new Error('Incorrect security PIN.');
    }
    const item = state.liabilities.find((liability) => Number(liability.id) === Number(id));
    if (!item) throw new Error('Liability not found.');
    return {
      account_ref: item.account_ref || '',
      notes: item.notes_for_family || ''
    };
  },
  createLiability(payload = {}) {
    const state = ensureGuestState();
    const timestamp = nowIso();
    const item = {
      id: nextId('liability'),
      loan_type: String(payload.loan_type || 'Other').trim() || 'Other',
      lender: String(payload.lender || 'Preview Lender').trim(),
      holder_type: String(payload.holder_type || 'Self').trim() || 'Self',
      reach_via: String(payload.reach_via || 'Branch').trim() || 'Branch',
      account_ref: String(payload.account_ref || '').trim(),
      outstanding_amount: Number(payload.outstanding_amount || 0),
      notes_for_family: String(payload.notes_for_family || '').trim(),
      created_at: timestamp,
      updated_at: timestamp
    };
    state.liabilities.unshift(item);
    recordRecentActivity('liability_updated', item.lender);
    return clone(item);
  },
  updateLiability(id, payload = {}) {
    const state = ensureGuestState();
    const index = state.liabilities.findIndex((liability) => Number(liability.id) === Number(id));
    if (index === -1) throw new Error('Liability not found.');
    state.liabilities[index] = {
      ...state.liabilities[index],
      ...payload,
      outstanding_amount: Number(payload.outstanding_amount ?? state.liabilities[index].outstanding_amount ?? 0),
      updated_at: nowIso()
    };
    recordRecentActivity('liability_updated', state.liabilities[index].lender);
    return clone(state.liabilities[index]);
  },
  deleteLiability(id) {
    const state = ensureGuestState();
    state.liabilities = state.liabilities.filter((liability) => Number(liability.id) !== Number(id));
    recordRecentActivity('liability_updated', 'Liability removed');
    return { ok: true };
  },
  getReminders() {
    const state = ensureGuestState();
    return clone(state.reminders);
  },
  createReminder(payload = {}) {
    const state = ensureGuestState();
    const timestamp = nowIso();
    const item = {
      id: nextId('reminder'),
      due_date: String(payload.due_date || isoDate(addDaysDate(new Date(), 1))).slice(0, 10),
      category: String(payload.category || 'Other'),
      description: String(payload.description || 'Preview reminder').trim(),
      amount: Number(payload.amount || 0),
      alert_days_before: Number(payload.alert_days_before || 7),
      repeat_type: String(payload.repeat_type || 'one_time'),
      repeat_every_days: payload.repeat_type === 'every_x_days' ? Number(payload.repeat_every_days || 2) : null,
      status: normalizeReminderStatus(payload.status),
      created_at: timestamp,
      updated_at: timestamp
    };
    state.reminders.unshift(item);
    return clone(item);
  },
  updateReminder(id, payload = {}) {
    const state = ensureGuestState();
    const index = state.reminders.findIndex((reminder) => Number(reminder.id) === Number(id));
    if (index === -1) throw new Error('Reminder not found.');
    state.reminders[index] = {
      ...state.reminders[index],
      ...payload,
      amount: Number(payload.amount ?? state.reminders[index].amount ?? 0),
      alert_days_before: Number(payload.alert_days_before ?? state.reminders[index].alert_days_before ?? 7),
      repeat_every_days:
        String(payload.repeat_type || state.reminders[index].repeat_type || '') === 'every_x_days'
          ? Number(payload.repeat_every_days ?? state.reminders[index].repeat_every_days ?? 2)
          : null,
      status: normalizeReminderStatus(payload.status ?? state.reminders[index].status),
      updated_at: nowIso()
    };
    return clone(state.reminders[index]);
  },
  updateReminderStatus(id, status) {
    const state = ensureGuestState();
    const index = state.reminders.findIndex((reminder) => Number(reminder.id) === Number(id));
    if (index === -1) throw new Error('Reminder not found.');
    const current = state.reminders[index];
    if (normalizeReminderStatus(status) === 'Completed' && String(current.repeat_type || 'one_time') !== 'one_time') {
      state.reminders[index] = advanceRecurringReminder(current);
    } else {
      state.reminders[index] = {
        ...current,
        status: normalizeReminderStatus(status),
        updated_at: nowIso()
      };
    }
    return clone(state.reminders[index]);
  },
  snoozeReminder(id, days = 1) {
    const state = ensureGuestState();
    const index = state.reminders.findIndex((reminder) => Number(reminder.id) === Number(id));
    if (index === -1) throw new Error('Reminder not found.');
    const currentDate = new Date(`${String(state.reminders[index].due_date || '').slice(0, 10)}T09:00:00`);
    if (Number.isNaN(currentDate.getTime())) throw new Error('Reminder date is invalid.');
    currentDate.setDate(currentDate.getDate() + Math.max(1, Number(days || 1)));
    state.reminders[index] = {
      ...state.reminders[index],
      due_date: isoDate(currentDate),
      updated_at: nowIso()
    };
    return clone(state.reminders[index]);
  },
  getSettings() {
    const state = ensureGuestState();
    return clone(state.settings);
  },
  upsertSettings(payload = {}) {
    const state = ensureGuestState();
    const next = { ...state.settings };
    Object.entries(payload || {}).forEach(([key, value]) => {
      next[key] = value == null ? '' : String(value);
    });
    if (
      Object.keys(payload || {}).some(
        (key) => key === 'target_date' || key === TARGETS_LAST_UPDATED_KEY || key.startsWith('yearly_target_')
      )
    ) {
      next[TARGETS_LAST_UPDATED_KEY] = nowIso();
    }
    state.settings = next;
    return clone(state.settings);
  },
  getFamilyMembers() {
    const state = ensureGuestState();
    return {
      owner: clone(state.owner),
      members: clone(state.familyMembers),
      invites: clone(state.familyInvites)
    };
  },
  getFamilyAccess() {
    const state = ensureGuestState();
    return {
      role: 'admin',
      is_owner: true,
      can_manage_subscription: true,
      admin_initials: [toInitials(state.user.full_name)],
      owner: clone(state.owner)
    };
  },
  getRecentActivity() {
    const state = ensureGuestState();
    return {
      items: clone(state.recentActivity.slice(0, 12))
    };
  },
  addFamilyMember(payload = {}) {
    const state = ensureGuestState();
    const timestamp = nowIso();
    const row = {
      id: nextId('familyMember'),
      role: String(payload.role || 'read'),
      created_at: timestamp,
      updated_at: timestamp,
      member: {
        id: `guest-member-${Date.now().toString(36)}`,
        full_name: `P${String(payload.mobile || '').slice(-1) || 'M'}`,
        mobile: String(payload.mobile || '').replace(/\D/g, '').slice(0, 10),
        email: ''
      }
    };
    state.familyMembers.push(row);
    recordFamilyAudit('member_added', { role: row.role });
    recordRecentActivity('family_member_added', 'Family member');
    return clone(row);
  },
  updateFamilyMember(id, payload = {}) {
    const state = ensureGuestState();
    const index = state.familyMembers.findIndex((member) => Number(member.id) === Number(id));
    if (index === -1) throw new Error('Family member not found.');
    state.familyMembers[index] = {
      ...state.familyMembers[index],
      role: String(payload.role || state.familyMembers[index].role || 'read'),
      updated_at: nowIso()
    };
    recordFamilyAudit('member_role_updated', { role: state.familyMembers[index].role });
    recordRecentActivity('family_role_updated', 'Family role');
    return clone(state.familyMembers[index]);
  },
  removeFamilyMember(id) {
    const state = ensureGuestState();
    state.familyMembers = state.familyMembers.filter((member) => Number(member.id) !== Number(id));
    recordFamilyAudit('member_removed');
    recordRecentActivity('family_member_removed', 'Family member');
    return { ok: true };
  },
  leaveFamilyAccess() {
    return { ok: true };
  },
  cancelFamilyInvite(id) {
    const state = ensureGuestState();
    state.familyInvites = state.familyInvites.filter((invite) => Number(invite.id) !== Number(id));
    recordFamilyAudit('invite_canceled');
    recordRecentActivity('family_invite_canceled', 'Family invite');
    return { ok: true };
  },
  resendFamilyInvite(id) {
    const state = ensureGuestState();
    const index = state.familyInvites.findIndex((invite) => Number(invite.id) === Number(id));
    if (index === -1) throw new Error('Invite not found.');
    const expiresAt = addDaysIso(7);
    state.familyInvites[index] = {
      ...state.familyInvites[index],
      expires_at: expiresAt,
      updated_at: nowIso()
    };
    recordFamilyAudit('invite_resent');
    recordRecentActivity('family_invite_resent', 'Family invite');
    return { ok: true, expires_at: expiresAt };
  },
  getFamilyAudit() {
    const state = ensureGuestState();
    return { audit: clone(state.familyAudit) };
  },
  getSubscriptionStatus() {
    const state = ensureGuestState();
    return clone(state.subscriptionStatus);
  },
  getSubscriptionHistory() {
    const state = ensureGuestState();
    return clone(state.subscriptionHistory);
  },
  getSubscriptionReceipt(id) {
    ensureGuestState();
    return createReceipt(Number(id) || 1);
  },
  exportUserData() {
    const state = ensureGuestState();
    return {
      exportedAt: nowIso(),
      user: clone(state.user),
      assets: clone(state.assets),
      liabilities: clone(state.liabilities),
      reminders: clone(state.reminders),
      settings: Object.entries(state.settings).map(([key, value]) => ({
        key,
        value,
        updated_at: state.settings[TARGETS_LAST_UPDATED_KEY] || nowIso()
      })),
      consents: clone(state.consents)
    };
  },
  deleteAccount() {
    return { ok: true };
  },
  requestSecurityPinResetOtp() {
    return { retry_after_seconds: 30 };
  },
  confirmSecurityPinReset(payload = {}) {
    const state = ensureGuestState();
    const nextPin = String(payload.new_pin || '').trim();
    if (!/^\d{4}$/.test(nextPin)) throw new Error('New PIN must be exactly 4 digits.');
    state.settings.privacy_pin = nextPin;
    state.settings.privacy_pin_enabled = '1';
    return { ok: true };
  },
  getAiHealthScore() {
    return computeAiScore(ensureGuestState());
  },
  explainAiHealthScore() {
    const payload = computeAiScore(ensureGuestState());
    return {
      explanation: {
        headline: `Your preview score is ${payload.score.toFixed(1)} out of 100.`,
        body:
          'This preview score weighs your debt level against assets, the liquidity available for near-term obligations, and how diversified the sample portfolio is across categories.'
      }
    };
  },
  chatSupportAgent() {
    return {
      reply:
        'You are in guest preview mode. Try editing assets, liabilities, targets, reminders, and family access to explore how Worthio works in a session-only sandbox.'
    };
  },
  getSupportChatHistory() {
    return {
      items: [
        {
          role: 'assistant',
          text:
            'You are in guest preview mode. Ask about assets, reminders, targets, family access, or how the preview works.'
        }
      ]
    };
  }
};
