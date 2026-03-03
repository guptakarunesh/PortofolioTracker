import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptString, encryptString, hashLookup } from './crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'portfolio.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  mobile_hash TEXT,
  email TEXT,
  mpin_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  member_user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'read',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, member_user_id),
  UNIQUE(member_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  mobile_hash TEXT NOT NULL,
  mobile_encrypted TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_user_id INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS family_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  meta TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  otp_hash TEXT,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  category TEXT NOT NULL,
  sub_category TEXT,
  name TEXT NOT NULL,
  institution TEXT,
  account_ref TEXT,
  quantity REAL DEFAULT 0,
  invested_amount REAL DEFAULT 0,
  current_value REAL DEFAULT 0,
  notes TEXT,
  metadata TEXT,
  tracking_url TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  loan_type TEXT NOT NULL,
  lender TEXT NOT NULL,
  account_ref TEXT,
  original_amount REAL DEFAULT 0,
  outstanding_amount REAL DEFAULT 0,
  interest_rate REAL DEFAULT 0,
  emi_amount REAL DEFAULT 0,
  emi_day TEXT,
  tenure_remaining TEXT,
  end_date TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  tx_date TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  tx_type TEXT NOT NULL,
  asset_name TEXT,
  amount REAL NOT NULL,
  units REAL,
  price REAL,
  account_ref TEXT,
  remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  due_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  alert_days_before INTEGER DEFAULT 7,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_trackers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset_name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  login_id TEXT NOT NULL,
  login_password TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  quarter_start TEXT NOT NULL,
  total_assets REAL NOT NULL DEFAULT 0,
  total_liabilities REAL NOT NULL DEFAULT 0,
  net_worth REAL NOT NULL DEFAULT 0,
  captured_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, quarter_start),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legal_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,
  version TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doc_type, version)
);

CREATE TABLE IF NOT EXISTS consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  privacy_policy_version TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  consent_source TEXT NOT NULL DEFAULT 'mobile_app',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  mobile_hash TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'expired',
  started_at TEXT,
  current_period_end TEXT,
  provider TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  provider TEXT,
  provider_txn_id TEXT,
  purchased_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'succeeded',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function ensureColumn(table, column, typeDef) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
  }
}

ensureColumn('assets', 'user_id', 'INTEGER');
ensureColumn('liabilities', 'user_id', 'INTEGER');
ensureColumn('transactions', 'user_id', 'INTEGER');
ensureColumn('reminders', 'user_id', 'INTEGER');
ensureColumn('assets', 'tracking_url', 'TEXT');
ensureColumn('users', 'mobile_hash', 'TEXT');

db.exec(`
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_user_id ON liabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_trackers_user_id ON asset_trackers(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_user_q ON performance_snapshots(user_id, quarter_start);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id ON consent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_time ON consent_log(consented_at);
CREATE INDEX IF NOT EXISTS idx_account_deletion_time ON account_deletion_log(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_mobile_hash ON users(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_time ON payment_history(purchased_at);
CREATE INDEX IF NOT EXISTS idx_family_owner_user_id ON family_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_family_member_user_id ON family_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_owner_user_id ON family_invites(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_mobile_hash ON family_invites(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_family_invites_status ON family_invites(status);
CREATE INDEX IF NOT EXISTS idx_family_audit_owner_user_id ON family_audit(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile_hash ON otp_requests(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires_at ON otp_requests(expires_at);
`);

function maybeEncrypt(value) {
  if (value == null || value === '') return value;
  return encryptString(value);
}

function migrateEncryptedColumns(table, idColumn, columns) {
  const selectColumns = [idColumn, ...columns].join(', ');
  const rows = db.prepare(`SELECT ${selectColumns} FROM ${table}`).all();
  const setClause = columns.map((c) => `${c} = @${c}`).join(', ');
  const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${idColumn} = @id`);

  const tx = db.transaction(() => {
    rows.forEach((row) => {
      const payload = { id: row[idColumn] };
      columns.forEach((column) => {
        payload[column] = maybeEncrypt(row[column]);
      });
      stmt.run(payload);
    });
  });
  tx();
}

function migrateUsersPii() {
  const rows = db.prepare('SELECT id, full_name, mobile, email, mobile_hash FROM users').all();
  const stmt = db.prepare(`
    UPDATE users SET
      full_name = @full_name,
      mobile = @mobile,
      email = @email,
      mobile_hash = @mobile_hash
    WHERE id = @id
  `);

  const tx = db.transaction(() => {
    rows.forEach((row) => {
      const plainMobile = decryptString(row.mobile || '');
      stmt.run({
        id: row.id,
        full_name: maybeEncrypt(row.full_name),
        mobile: maybeEncrypt(row.mobile),
        email: maybeEncrypt(row.email),
        mobile_hash: hashLookup(plainMobile)
      });
    });
  });

  tx();
}

migrateUsersPii();
migrateEncryptedColumns('assets', 'id', ['name', 'institution', 'account_ref', 'notes']);
migrateEncryptedColumns('liabilities', 'id', ['lender', 'account_ref', 'notes']);
migrateEncryptedColumns('transactions', 'id', ['asset_name', 'account_ref', 'remarks']);
migrateEncryptedColumns('reminders', 'id', ['description']);
migrateEncryptedColumns('asset_trackers', 'id', ['asset_name', 'login_id', 'login_password', 'notes']);

export const nowIso = () => new Date().toISOString();
