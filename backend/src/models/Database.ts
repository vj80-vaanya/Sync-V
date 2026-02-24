import Database from 'better-sqlite3';

export function createDatabase(dbPath?: string): Database.Database {
  const db = new Database(dbPath || ':memory:');

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      firmware_version TEXT DEFAULT '',
      last_seen TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
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
      release_date TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add new columns to existing logs tables
  const logCols = db.pragma('table_info(logs)') as any[];
  const colNames = logCols.map((c: any) => c.name);
  if (!colNames.includes('raw_data')) {
    db.exec("ALTER TABLE logs ADD COLUMN raw_data TEXT DEFAULT ''");
  }
  if (!colNames.includes('vendor')) {
    db.exec("ALTER TABLE logs ADD COLUMN vendor TEXT DEFAULT 'unknown'");
  }
  if (!colNames.includes('format')) {
    db.exec("ALTER TABLE logs ADD COLUMN format TEXT DEFAULT 'text'");
  }

  return db;
}
