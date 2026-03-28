import { db, nowIso } from './lib/db.js';
import { hashPin, normalizeMobile } from './lib/auth.js';

const clear = () => {
  db.exec(`
    DELETE FROM sessions;
    DELETE FROM assets;
    DELETE FROM liabilities;
    DELETE FROM transactions;
    DELETE FROM reminders;
    DELETE FROM user_settings;
    DELETE FROM settings;
    DELETE FROM users;
  `);
};

const insertUser = db.prepare(`
  INSERT INTO users (full_name, mobile, email, mpin_hash, created_at)
  VALUES (@full_name, @mobile, @email, @mpin_hash, @created_at)
`);

const insertAssets = db.prepare(`
  INSERT INTO assets (
    user_id, category, sub_category, name, institution, account_ref,
    quantity, invested_amount, current_value, notes, metadata, updated_at
  ) VALUES (
    @user_id, @category, @sub_category, @name, @institution, @account_ref,
    @quantity, @invested_amount, @current_value, @notes, @metadata, @updated_at
  )
`);

const insertLiability = db.prepare(`
  INSERT INTO liabilities (
    user_id, loan_type, lender, account_ref, original_amount, outstanding_amount,
    interest_rate, emi_amount, emi_day, tenure_remaining, end_date, notes, updated_at
  ) VALUES (
    @user_id, @loan_type, @lender, @account_ref, @original_amount, @outstanding_amount,
    @interest_rate, @emi_amount, @emi_day, @tenure_remaining, @end_date, @notes, @updated_at
  )
`);

const insertTransaction = db.prepare(`
  INSERT INTO transactions (
    user_id, tx_date, category, sub_category, tx_type, asset_name,
    amount, units, price, account_ref, remarks
  ) VALUES (
    @user_id, @tx_date, @category, @sub_category, @tx_type, @asset_name,
    @amount, @units, @price, @account_ref, @remarks
  )
`);

const insertReminder = db.prepare(`
  INSERT INTO reminders (
    user_id, due_date, category, description, amount, status, alert_days_before
  ) VALUES (
    @user_id, @due_date, @category, @description, @amount, @status, @alert_days_before
  )
`);

const upsertUserSetting = db.prepare(`
  INSERT INTO user_settings (user_id, key, value, updated_at)
  VALUES (@user_id, @key, @value, @updated_at)
  ON CONFLICT(user_id, key) DO UPDATE SET
    value=excluded.value,
    updated_at=excluded.updated_at
`);

const run = db.transaction(() => {
  clear();

  const t = nowIso();
  const mobile = normalizeMobile('9999999999');

  const userRes = insertUser.run({
    full_name: 'Demo User',
    mobile,
    email: 'demo@example.com',
    mpin_hash: hashPin('1234'),
    created_at: t
  });
  const userId = Number(userRes.lastInsertRowid);

  [
    { user_id: userId, category: 'Cash & Bank Accounts', sub_category: 'Savings', name: 'HDFC Savings', institution: 'HDFC Bank', account_ref: 'XXXX1234', quantity: 1, invested_amount: 50000, current_value: 50000, notes: 'Primary Account', metadata: JSON.stringify({ interestRate: 3.5 }), updated_at: t },
    { user_id: userId, category: 'Cash & Bank Accounts', sub_category: 'FD', name: 'SBI FD', institution: 'SBI', account_ref: 'XXXX5678', quantity: 1, invested_amount: 200000, current_value: 200000, notes: 'Maturity 15-Aug-2026', metadata: JSON.stringify({ interestRate: 7.1 }), updated_at: t },
    { user_id: userId, category: 'Retirement Funds', sub_category: 'PPF', name: 'PPF Account', institution: 'SBI', account_ref: 'XXXX3456', quantity: 1, invested_amount: 500000, current_value: 500000, notes: 'Annual Contribution', metadata: JSON.stringify({ interestRate: 7.1 }), updated_at: t },
    { user_id: userId, category: 'Market Stocks & RSUs', sub_category: 'Mutual Funds', name: 'HDFC Flexi Cap', institution: 'HDFC MF', account_ref: '12345/67', quantity: 1000.5, invested_amount: 750000, current_value: 850675.13, notes: 'SIP 10,000', metadata: JSON.stringify({ nav: 850.25 }), updated_at: t },
    { user_id: userId, category: 'Market Stocks & RSUs', sub_category: 'Stocks', name: 'RELIANCE', institution: 'NSE', account_ref: 'ZERODHA', quantity: 50, invested_amount: 120000, current_value: 142500, notes: 'Direct equity', metadata: JSON.stringify({ currentPrice: 2850 }), updated_at: t },
    { user_id: userId, category: 'Jewelry & Watches', sub_category: 'Gold', name: 'Physical Jewelry', institution: 'Personal', account_ref: 'HOME_LOCKER', quantity: 50, invested_amount: 225000, current_value: 325000, notes: 'Home Locker', metadata: JSON.stringify({ ratePerGram: 6500 }), updated_at: t },
    { user_id: userId, category: 'Real Estate', sub_category: 'Residential', name: 'Noida Flat', institution: 'Self', account_ref: 'SECTOR62', quantity: 1, invested_amount: 7500000, current_value: 9500000, notes: 'Self-occupied', metadata: '{}', updated_at: t },
    { user_id: userId, category: 'Retirement Funds', sub_category: 'EPF', name: 'EPF Account', institution: 'EPFO', account_ref: 'PF/XX/12345', quantity: 1, invested_amount: 800000, current_value: 800000, notes: 'Auto-deducted', metadata: '{}', updated_at: t },
    { user_id: userId, category: 'Insurance & Other', sub_category: 'Endowment', name: 'LIC Endowment', institution: 'LIC', account_ref: 'LIC987654', quantity: 1, invested_amount: 350000, current_value: 350000, notes: 'Cash/Surrender Value', metadata: '{}', updated_at: t },
    { user_id: userId, category: 'Vehicles', sub_category: 'Vehicle', name: 'Honda City 2022', institution: 'Self', account_ref: 'DL-XX-XXXX', quantity: 1, invested_amount: 1200000, current_value: 800000, notes: 'Depreciating asset', metadata: '{}', updated_at: t }
  ].forEach((row) => insertAssets.run(row));

  [
    { user_id: userId, loan_type: 'Home Loan', lender: 'HDFC Bank', account_ref: 'HL123456', original_amount: 5000000, outstanding_amount: 3000000, interest_rate: 8.5, emi_amount: 45000, emi_day: '5th', tenure_remaining: '120 months', end_date: '2036-02-05', notes: '', updated_at: t },
    { user_id: userId, loan_type: 'Car Loan', lender: 'ICICI Bank', account_ref: 'CL789012', original_amount: 800000, outstanding_amount: 350000, interest_rate: 9.2, emi_amount: 18000, emi_day: '10th', tenure_remaining: '24 months', end_date: '2028-02-10', notes: '', updated_at: t }
  ].forEach((row) => insertLiability.run(row));

  [
    { user_id: userId, tx_date: '2026-02-01', category: 'Mutual Funds', sub_category: 'Equity', tx_type: 'Buy', asset_name: 'HDFC Flexi Cap', amount: 10000, units: 11.75, price: 851.06, account_ref: '12345/67', remarks: 'SIP' },
    { user_id: userId, tx_date: '2026-02-05', category: 'Banking', sub_category: 'FD', tx_type: 'Maturity', asset_name: 'SBI FD', amount: 210500, units: null, price: null, account_ref: 'XXXX5678', remarks: 'Reinvested' },
    { user_id: userId, tx_date: '2026-02-10', category: 'Gold', sub_category: 'Physical', tx_type: 'Buy', asset_name: '24K Coin', amount: 55000, units: 10, price: 5500, account_ref: 'Bank Locker', remarks: '-' }
  ].forEach((row) => insertTransaction.run(row));

  [
    { user_id: userId, due_date: '2026-04-01', category: 'Insurance', description: 'HDFC Term Premium', amount: 15000, status: 'Pending', alert_days_before: 15 },
    { user_id: userId, due_date: '2026-04-05', category: 'Investment', description: 'PPF Contribution', amount: 150000, status: 'Pending', alert_days_before: 30 },
    { user_id: userId, due_date: '2026-08-15', category: 'Banking', description: 'SBI FD Maturity', amount: 200000, status: 'Pending', alert_days_before: 30 }
  ].forEach((row) => insertReminder.run(row));

  [
    { user_id: userId, key: 'gold_24k_per_gram', value: '6500', updated_at: t },
    { user_id: userId, key: 'gold_22k_per_gram', value: '5950', updated_at: t },
    { user_id: userId, key: 'silver_per_gram', value: '75', updated_at: t },
    { user_id: userId, key: 'usd_inr', value: '83.5', updated_at: t },
    { user_id: userId, key: 'financial_year', value: '2025-26', updated_at: t },
    { user_id: userId, key: 'risk_profile', value: 'Moderate', updated_at: t },
    { user_id: userId, key: 'target_net_worth', value: '20000000', updated_at: t },
    { user_id: userId, key: 'target_date', value: '2030-12-31', updated_at: t }
  ].forEach((row) => upsertUserSetting.run(row));
});

run();
console.log('Database seeded with demo user and starter portfolio data.');
console.log('Demo login: mobile=9999999999, mpin=1234');
