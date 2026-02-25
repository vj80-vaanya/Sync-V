import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export function createDatabase(dbPath?: string): Database.Database {
  if (dbPath && dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath || ':memory:');

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      max_devices INTEGER NOT NULL DEFAULT 5,
      max_storage_bytes INTEGER NOT NULL DEFAULT 104857600,
      max_users INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      firmware_version TEXT DEFAULT '',
      last_seen TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      org_id TEXT REFERENCES organizations(id),
      cluster_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      raw_path TEXT DEFAULT '',
      raw_data TEXT DEFAULT '',
      vendor TEXT DEFAULT 'unknown',
      format TEXT DEFAULT 'text',
      metadata TEXT DEFAULT '{}',
      org_id TEXT REFERENCES organizations(id),
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS firmware (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      device_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      description TEXT DEFAULT '',
      org_id TEXT REFERENCES organizations(id),
      release_date TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      org_id TEXT REFERENCES organizations(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_keys (
      device_id TEXT PRIMARY KEY REFERENCES devices(id),
      psk TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      rotated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES organizations(id),
      actor_id TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'user',
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      last_used_at TEXT DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_triggered_at TEXT DEFAULT '',
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      org_id TEXT REFERENCES organizations(id),
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      log_id TEXT,
      details TEXT DEFAULT '{}',
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_health (
      device_id TEXT PRIMARY KEY REFERENCES devices(id),
      score INTEGER NOT NULL DEFAULT 100,
      factors TEXT DEFAULT '{}',
      trend TEXT DEFAULT 'stable',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_health_history (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_devices_org_id ON devices(org_id);
    CREATE INDEX IF NOT EXISTS idx_logs_device_id ON logs(device_id);
    CREATE INDEX IF NOT EXISTS idx_logs_org_id ON logs(org_id);
    CREATE INDEX IF NOT EXISTS idx_logs_uploaded_at ON logs(uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_firmware_org_id ON firmware(org_id);
    CREATE INDEX IF NOT EXISTS idx_firmware_device_type_org ON firmware(device_type, org_id);
    CREATE INDEX IF NOT EXISTS idx_anomalies_org_id ON anomalies(org_id);
    CREATE INDEX IF NOT EXISTS idx_anomalies_device_id ON anomalies(device_id);
    CREATE INDEX IF NOT EXISTS idx_anomalies_resolved ON anomalies(org_id, resolved);
    CREATE INDEX IF NOT EXISTS idx_device_health_history_device ON device_health_history(device_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
    CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
  `);

  // Migration: add new columns to existing tables
  function addColumnIfMissing(table: string, column: string, definition: string) {
    const cols = db.pragma(`table_info(${table})`) as any[];
    if (!cols.some((c: any) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // Logs migrations
  addColumnIfMissing('logs', 'raw_data', "TEXT DEFAULT ''");
  addColumnIfMissing('logs', 'vendor', "TEXT DEFAULT 'unknown'");
  addColumnIfMissing('logs', 'format', "TEXT DEFAULT 'text'");
  addColumnIfMissing('logs', 'org_id', 'TEXT REFERENCES organizations(id)');

  // Devices migrations
  addColumnIfMissing('devices', 'org_id', 'TEXT REFERENCES organizations(id)');
  addColumnIfMissing('devices', 'cluster_id', 'TEXT');

  // Users migrations
  addColumnIfMissing('users', 'org_id', 'TEXT REFERENCES organizations(id)');
  addColumnIfMissing('users', 'updated_at', "TEXT DEFAULT ''");

  // Firmware migrations
  addColumnIfMissing('firmware', 'org_id', 'TEXT REFERENCES organizations(id)');

  return db;
}
