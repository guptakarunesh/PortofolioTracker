import Database from 'better-sqlite3';
import pkg from 'pg';
import deasync from 'deasync';
import fs from 'node:fs';
import dns from 'node:dns';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptString, encryptString, hashLookup } from './crypto.js';
import { hashPin } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const usePostgres = Boolean(databaseUrl);
let postgresReady = !usePostgres;
let postgresBootstrapping = false;

if (!usePostgres && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function waitForCallback(register, timeoutMs = 15000, context = 'database operation') {
  let done = false;
  let value;
  let error;
  const startedAt = Date.now();
  register((err, result) => {
    if (err) error = err;
    else value = result;
    done = true;
  });
  deasync.loopWhile(() => {
    if (done) return false;
    if (Date.now() - startedAt > timeoutMs) {
      error = new Error(`${context} timed out after ${timeoutMs}ms`);
      done = true;
      return false;
    }
    return true;
  });
  if (error) throw new Error(`${context} failed: ${String(error?.message || error)}`);
  return value;
}

function createPostgresCompatDb(connectionString) {
  const connectTimeoutMs = Number.parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10);
  const queryTimeoutMs = Math.max(5000, Number.parseInt(process.env.DB_QUERY_TIMEOUT_MS || '15000', 10));
  const url = new URL(connectionString);
  const dbHost = url.hostname;
  const dbPort = Number(url.port || 5432);
  const sslMode = String(url.searchParams.get('sslmode') || '').toLowerCase();
  const sslOverride = String(process.env.DB_SSL || '').trim().toLowerCase();
  const disableSslByHost = dbHost.startsWith('dpg-') && !sslMode;
  const useSsl = sslOverride
    ? !['0', 'false', 'off', 'disable', 'disabled', 'no'].includes(sslOverride)
    : !disableSslByHost && sslMode !== 'disable';
  const { Pool } = pkg;
  const pool = new Pool({
    connectionString,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    connectionTimeoutMillis: connectTimeoutMs,
    family: 4
  });
  console.log(`[db] postgres ssl ${useSsl ? 'enabled' : 'disabled'} host=${dbHost} sslmode=${sslMode || 'none'}`);
  const dnsProbe = waitForCallback(
    (cb) =>
      dns.lookup(dbHost, { all: true }, (err, addresses) => {
        cb(err, addresses || []);
      }),
    7000,
    'database DNS probe'
  );
  const tcpProbe = waitForCallback(
    (cb) => {
      const socket = net.createConnection({ host: dbHost, port: dbPort });
      socket.setTimeout(7000);
      socket.on('connect', () => {
        socket.destroy();
        cb(null, 'ok');
      });
      socket.on('timeout', () => {
        socket.destroy();
        cb(new Error('tcp timeout'));
      });
      socket.on('error', (err) => {
        socket.destroy();
        cb(err);
      });
    },
    9000,
    'database TCP probe'
  );
  console.log(`[db] DNS probe ${dbHost}:`, dnsProbe);
  console.log(`[db] TCP probe ${dbHost}:${dbPort}:`, tcpProbe);

  const connectProbe = () => {
    pool.query('SELECT 1', (err) => {
      if (err) {
        console.error('[db] connect probe error:', err.code || '', err.message || String(err));
        return;
      }
      if (!postgresReady) {
        console.log('[db] postgres connectivity confirmed');
      }
    });
  };
  connectProbe();
  const transactionClients = [];

  const convertPositionalParams = (sql, values) => {
    let idx = 0;
    const text = String(sql).replace(/\?/g, () => {
      idx += 1;
      return `$${idx}`;
    });
    return { text, values };
  };

  const convertNamedParams = (sql, payload) => {
    const names = [];
    const text = String(sql).replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name) => {
      const existing = names.indexOf(name);
      if (existing >= 0) return `$${existing + 1}`;
      names.push(name);
      return `$${names.length}`;
    });
    const values = names.map((name) => payload[name]);
    return { text, values };
  };

  const toPgQuery = (sql, args) => {
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      return convertNamedParams(sql, args[0]);
    }
    return convertPositionalParams(sql, args);
  };

  const activeExecutor = () => transactionClients[transactionClients.length - 1] || pool;

  const querySync = (sql, values = []) =>
    postgresReady || postgresBootstrapping
      ? waitForCallback(
          (cb) =>
            activeExecutor().query(sql, values, (err, result) => {
              cb(err, result);
            }),
          queryTimeoutMs + 2000,
          'database query'
        )
      : (() => {
          throw new Error('database is initializing, please retry');
        })();

  const pgDb = {
    pragma() {
      // no-op for PostgreSQL compatibility with SQLite call sites
    },
    exec(sql) {
      querySync(sql);
    },
    prepare(sql) {
      const baseSql = String(sql);
      return {
        get: (...args) => {
          const q = toPgQuery(baseSql, args);
          const result = querySync(q.text, q.values);
          return result.rows[0];
        },
        all: (...args) => {
          const q = toPgQuery(baseSql, args);
          const result = querySync(q.text, q.values);
          return result.rows;
        },
        run: (...args) => {
          const q = toPgQuery(baseSql, args);
          const isInsert = /^\s*insert\s+/i.test(q.text);
          const result = querySync(q.text, q.values);
          let lastInsertRowid = null;
          if (isInsert) {
            const tableMatch = q.text.match(/^\s*insert\s+into\s+([^\s(]+)/i);
            const tableName = tableMatch?.[1]?.replace(/"/g, '') || null;
            if (tableName) {
              try {
                const hasId = querySync(
                  `
                    SELECT EXISTS (
                      SELECT 1
                      FROM information_schema.columns
                      WHERE table_schema = current_schema()
                        AND table_name = $1
                        AND column_name = 'id'
                    ) AS has_id
                  `,
                  [tableName]
                )?.rows?.[0]?.has_id;
                if (hasId) {
                  const seq = querySync(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [tableName])?.rows?.[0]?.seq;
                  if (seq) {
                    const last = querySync('SELECT currval($1::regclass) AS id', [seq])?.rows?.[0]?.id;
                    if (last != null) lastInsertRowid = Number(last);
                  }
                }
              } catch {
                lastInsertRowid = null;
              }
            }
          }
          return {
            changes: Number(result.rowCount || 0),
            lastInsertRowid
          };
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        const client = waitForCallback(
          (cb) =>
            pool.connect((err, connectedClient, release) => {
              if (err) {
                cb(err);
                return;
              }
              connectedClient.__release = release;
              cb(null, connectedClient);
            }),
          connectTimeoutMs + 5000,
          'database transaction connect'
        );
        transactionClients.push(client);
        try {
          querySync('BEGIN');
          const out = fn(...args);
          querySync('COMMIT');
          return out;
        } catch (err) {
          try {
            querySync('ROLLBACK');
          } catch (_rollbackErr) {
            // Preserve the original error.
          }
          throw err;
        } finally {
          transactionClients.pop();
          if (typeof client.__release === 'function') {
            client.__release();
          }
        }
      };
    }
  };

  return pgDb;
}

const sqliteDb = (() => {
  if (usePostgres) return null;
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'portfolio.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  return instance;
})();

export const db = usePostgres ? createPostgresCompatDb(databaseUrl) : sqliteDb;
console.log(`[db] using ${usePostgres ? 'postgres' : 'sqlite'} backend`);

function normalizeSchemaForPostgres(sql) {
  return String(sql)
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/g, 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
    .replace(
      /CREATE TABLE IF NOT EXISTS legal_documents \(\s*id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\s*id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,/m,
      'CREATE TABLE IF NOT EXISTS legal_documents (\n  id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,'
    );
}

const schemaSql = `
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
  device_id TEXT,
  auth_method TEXT,
  created_ip TEXT,
  created_user_agent TEXT,
  last_seen_at TEXT,
  last_seen_ip TEXT,
  last_seen_user_agent TEXT,
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
  purpose TEXT NOT NULL DEFAULT 'login',
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
  holder_type TEXT DEFAULT 'Self',
  reach_via TEXT DEFAULT 'Branch',
  relationship_mobile TEXT,
  account_ref TEXT,
  quantity REAL DEFAULT 0,
  invested_amount REAL DEFAULT 0,
  current_value REAL DEFAULT 0,
  notes TEXT,
  metadata TEXT,
  tracking_url TEXT,
  updated_by_initials TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS liabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  loan_type TEXT NOT NULL,
  lender TEXT NOT NULL,
  holder_type TEXT DEFAULT 'Self',
  reach_via TEXT DEFAULT 'Branch',
  relationship_mobile TEXT,
  account_ref TEXT,
  original_amount REAL DEFAULT 0,
  outstanding_amount REAL DEFAULT 0,
  interest_rate REAL DEFAULT 0,
  emi_amount REAL DEFAULT 0,
  emi_day TEXT,
  tenure_remaining TEXT,
  end_date TEXT,
  notes TEXT,
  updated_by_initials TEXT,
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

CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  category TEXT NOT NULL,
  investment_label TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  canonical_url TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  trust_score INTEGER NOT NULL DEFAULT 0,
  is_official INTEGER NOT NULL DEFAULT 0,
  source_priority INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'ok',
  source TEXT NOT NULL DEFAULT 'pipeline',
  item_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  metadata TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS payment_checkout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  starts_at TEXT,
  valid_until TEXT,
  mode TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS store_subscription_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  provider TEXT NOT NULL,
  package_name TEXT,
  plan TEXT,
  product_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL UNIQUE,
  linked_purchase_token TEXT,
  latest_order_id TEXT,
  subscription_state TEXT,
  local_status TEXT,
  acknowledgement_state TEXT,
  auto_renew_enabled INTEGER,
  expiry_time TEXT,
  started_at TEXT,
  cancellation_reason TEXT,
  is_test_purchase INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  line_item_payload TEXT,
  last_verified_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensitive_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor_user_id INTEGER,
  mobile_hash TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  ip_address TEXT,
  meta TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminder_notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id INTEGER NOT NULL,
  recipient_user_id INTEGER NOT NULL,
  notify_date TEXT NOT NULL,
  phase TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reminder_id, recipient_user_id, notify_date, phase),
  FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT,
  os_version TEXT,
  app_version TEXT,
  app_build TEXT,
  device_name TEXT,
  device_model TEXT,
  timezone TEXT,
  locale TEXT,
  last_lat REAL,
  last_lng REAL,
  last_accuracy_m REAL,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_ip TEXT,
  last_seen_user_agent TEXT,
  trusted INTEGER NOT NULL DEFAULT 1,
  revoked_at TEXT,
  UNIQUE(user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  mobile_hash TEXT,
  event_type TEXT NOT NULL,
  auth_method TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  reason TEXT,
  device_id TEXT,
  platform TEXT,
  os_version TEXT,
  app_version TEXT,
  app_build TEXT,
  device_name TEXT,
  device_model TEXT,
  timezone TEXT,
  locale TEXT,
  geo_lat REAL,
  geo_lng REAL,
  geo_accuracy_m REAL,
  ip_address TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ok',
  reason TEXT,
  meta TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_reset_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  support_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (support_user_id) REFERENCES support_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  support_user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (support_user_id) REFERENCES support_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

function initializeDatabase() {
  db.exec(usePostgres ? normalizeSchemaForPostgres(schemaSql) : schemaSql);

function ensureColumn(table, column, typeDef) {
  if (usePostgres) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${typeDef}`);
    return;
  }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
}

ensureColumn('assets', 'user_id', 'INTEGER');
ensureColumn('liabilities', 'user_id', 'INTEGER');
ensureColumn('transactions', 'user_id', 'INTEGER');
ensureColumn('reminders', 'user_id', 'INTEGER');
ensureColumn('assets', 'tracking_url', 'TEXT');
ensureColumn('assets', 'holder_type', "TEXT DEFAULT 'Self'");
ensureColumn('assets', 'reach_via', "TEXT DEFAULT 'Branch'");
ensureColumn('assets', 'relationship_mobile', 'TEXT');
ensureColumn('assets', 'updated_by_initials', 'TEXT');
ensureColumn('liabilities', 'holder_type', "TEXT DEFAULT 'Self'");
ensureColumn('liabilities', 'reach_via', "TEXT DEFAULT 'Branch'");
ensureColumn('liabilities', 'relationship_mobile', 'TEXT');
ensureColumn('liabilities', 'updated_by_initials', 'TEXT');
ensureColumn('users', 'mobile_hash', 'TEXT');
ensureColumn('otp_requests', 'purpose', "TEXT DEFAULT 'login'");
ensureColumn('sessions', 'device_id', 'TEXT');
ensureColumn('sessions', 'auth_method', 'TEXT');
ensureColumn('sessions', 'created_ip', 'TEXT');
ensureColumn('sessions', 'created_user_agent', 'TEXT');
ensureColumn('sessions', 'last_seen_at', 'TEXT');
ensureColumn('sessions', 'last_seen_ip', 'TEXT');
ensureColumn('sessions', 'last_seen_user_agent', 'TEXT');

db.exec(`
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_user_id ON liabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_trackers_user_id ON asset_trackers(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_user_q ON performance_snapshots(user_id, quarter_start);
CREATE INDEX IF NOT EXISTS idx_news_items_published_at ON news_items(published_at);
CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_items_source_key ON news_items(source_key);
CREATE INDEX IF NOT EXISTS idx_news_items_content_hash ON news_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_news_ingest_runs_started_at ON news_ingest_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id ON consent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_time ON consent_log(consented_at);
CREATE INDEX IF NOT EXISTS idx_account_deletion_time ON account_deletion_log(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_mobile_hash ON users(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_time ON payment_history(purchased_at);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id ON payment_checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_order_id ON payment_checkout_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_store_receipts_user_id ON store_subscription_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_receipts_provider ON store_subscription_receipts(provider);
CREATE INDEX IF NOT EXISTS idx_store_receipts_product_id ON store_subscription_receipts(product_id);
CREATE INDEX IF NOT EXISTS idx_store_receipts_order_id ON store_subscription_receipts(latest_order_id);
CREATE INDEX IF NOT EXISTS idx_store_receipts_verified_at ON store_subscription_receipts(last_verified_at);
CREATE INDEX IF NOT EXISTS idx_family_owner_user_id ON family_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_family_member_user_id ON family_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_owner_user_id ON family_invites(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_mobile_hash ON family_invites(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_family_invites_status ON family_invites(status);
CREATE INDEX IF NOT EXISTS idx_family_audit_owner_user_id ON family_audit(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_id ON app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_read_at ON app_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_owner ON sensitive_access_log(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_actor ON sensitive_access_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile_hash ON otp_requests(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_otp_requests_purpose ON otp_requests(purpose);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires_at ON otp_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_security_event_user ON security_event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_event_mobile_hash ON security_event_log(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_security_event_type ON security_event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_id ON device_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_token ON device_push_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reminder_notification_log_lookup
  ON reminder_notification_log(reminder_id, recipient_user_id, notify_date, phase);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_seen ON user_devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_auth_login_log_user_id ON auth_login_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_login_log_mobile_hash ON auth_login_log(mobile_hash);
CREATE INDEX IF NOT EXISTS idx_auth_login_log_event_type ON auth_login_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_login_log_created_at ON auth_login_log(created_at);
CREATE INDEX IF NOT EXISTS idx_support_action_log_actor ON support_action_log(actor);
CREATE INDEX IF NOT EXISTS idx_support_action_log_target_user ON support_action_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_support_action_log_created_at ON support_action_log(created_at);
CREATE INDEX IF NOT EXISTS idx_support_users_username ON support_users(username);
CREATE INDEX IF NOT EXISTS idx_support_sessions_user ON support_sessions(support_user_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_expires ON support_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_support_password_resets_user ON support_password_resets(support_user_id);
CREATE INDEX IF NOT EXISTS idx_support_password_resets_expires ON support_password_resets(expires_at);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_user ON support_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_created ON support_chat_messages(created_at);
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
      const plainName = decryptString(row.full_name || '');
      const plainMobile = decryptString(row.mobile || '');
      const initials = initialsFromName(plainName);
      stmt.run({
        id: row.id,
        full_name: maybeEncrypt(initials || 'NA'),
        mobile: maybeEncrypt(row.mobile),
        email: maybeEncrypt(row.email),
        mobile_hash: hashLookup(plainMobile)
      });
    });
  });

  tx();
}

function initialsFromName(name = '') {
  const compact = String(name || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{1,2}$/.test(compact)) return compact;
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'NA';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function backfillUpdatedByInitials() {
  const users = db.prepare('SELECT id, full_name FROM users').all();
  const updateAssets = db.prepare(`
    UPDATE assets
    SET updated_by_initials = @initials
    WHERE user_id = @user_id
      AND (updated_by_initials IS NULL OR TRIM(updated_by_initials) = '' OR UPPER(updated_by_initials) = 'NA')
  `);
  const updateLiabilities = db.prepare(`
    UPDATE liabilities
    SET updated_by_initials = @initials
    WHERE user_id = @user_id
      AND (updated_by_initials IS NULL OR TRIM(updated_by_initials) = '' OR UPPER(updated_by_initials) = 'NA')
  `);

  const tx = db.transaction(() => {
    users.forEach((row) => {
      const initials = initialsFromName(decryptString(row.full_name || ''));
      if (!initials || initials === 'NA') return;
      updateAssets.run({ initials, user_id: row.id });
      updateLiabilities.run({ initials, user_id: row.id });
    });
  });
  tx();
}

function seedSupportUsers() {
  const defaults = [
    { username: 'Admin1', password: 'Pass1' },
    { username: 'Admin2', password: 'Pass2' },
    { username: 'Admin3', password: 'Pass3' }
  ];
  const selectStmt = db.prepare('SELECT id FROM support_users WHERE LOWER(username) = LOWER(?) LIMIT 1');
  const insertStmt = db.prepare(`
    INSERT INTO support_users (username, password_hash, must_reset_password, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
  `);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    defaults.forEach((item) => {
      const exists = selectStmt.get(item.username);
      if (exists) return;
      insertStmt.run(item.username, hashPin(item.password), now, now);
    });
  });
  tx();
}

migrateUsersPii();
migrateEncryptedColumns('assets', 'id', ['name', 'institution', 'account_ref', 'notes']);
migrateEncryptedColumns('assets', 'id', ['relationship_mobile']);
migrateEncryptedColumns('liabilities', 'id', ['lender', 'account_ref', 'notes', 'relationship_mobile']);
migrateEncryptedColumns('transactions', 'id', ['asset_name', 'account_ref', 'remarks']);
migrateEncryptedColumns('reminders', 'id', ['description']);
migrateEncryptedColumns('asset_trackers', 'id', ['asset_name', 'login_id', 'login_password', 'notes']);
backfillUpdatedByInitials();
seedSupportUsers();
}

function startPostgresBootstrap() {
  const maxAttempts = Math.max(1, Number.parseInt(process.env.DB_BOOTSTRAP_MAX_ATTEMPTS || '20', 10));
  const retryDelayMs = Math.max(1000, Number.parseInt(process.env.DB_BOOTSTRAP_RETRY_MS || '5000', 10));
  let attempts = 0;

  const attempt = () => {
    attempts += 1;
    postgresBootstrapping = true;
    try {
      initializeDatabase();
      postgresReady = true;
      postgresBootstrapping = false;
      console.log(`[db] postgres bootstrap ready (attempt ${attempts}/${maxAttempts})`);
    } catch (error) {
      postgresReady = false;
      postgresBootstrapping = false;
      const message = String(error?.message || error);
      console.error(`[db] postgres bootstrap failed (attempt ${attempts}/${maxAttempts}): ${message}`);
      if (attempts < maxAttempts) {
        setTimeout(attempt, retryDelayMs);
      } else {
        console.error('[db] postgres bootstrap exhausted retries; service stays up and will return temporary DB errors');
      }
    }
  };

  attempt();
}

if (usePostgres) {
  startPostgresBootstrap();
} else {
  initializeDatabase();
}

export const nowIso = () => new Date().toISOString();
