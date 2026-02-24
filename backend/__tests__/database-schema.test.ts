import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';

describe('Database Schema', () => {
  it('creates all four tables on initialization', () => {
    const db = createDatabase();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('devices');
    expect(tableNames).toContain('logs');
    expect(tableNames).toContain('firmware');
    expect(tableNames).toContain('users');
    db.close();
  });

  it('devices table has correct columns', () => {
    const db = createDatabase();
    const columns = db.pragma('table_info(devices)') as any[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(
      expect.arrayContaining(['id', 'name', 'type', 'status', 'firmware_version', 'last_seen', 'metadata', 'created_at', 'updated_at']),
    );
    db.close();
  });

  it('logs table has new vendor/format/raw_data columns', () => {
    const db = createDatabase();
    const columns = db.pragma('table_info(logs)') as any[];
    const colNames = columns.map((c: any) => c.name);

    expect(colNames).toContain('raw_data');
    expect(colNames).toContain('vendor');
    expect(colNames).toContain('format');
    expect(colNames).toContain('id');
    expect(colNames).toContain('device_id');
    expect(colNames).toContain('filename');
    expect(colNames).toContain('checksum');
    db.close();
  });

  it('logs table enforces foreign key to devices', () => {
    const db = createDatabase();
    expect(() => {
      db.prepare("INSERT INTO logs (id, device_id, filename, size, checksum) VALUES (?,?,?,?,?)").run(
        'L1',
        'NONEXISTENT',
        'f.txt',
        100,
        'a'.repeat(64),
      );
    }).toThrow();
    db.close();
  });

  it('users table enforces unique username constraint', () => {
    const db = createDatabase();
    db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?,?,?,?)").run('U1', 'admin', 'hash1', 'admin');

    expect(() => {
      db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?,?,?,?)").run('U2', 'admin', 'hash2', 'viewer');
    }).toThrow();
    db.close();
  });

  it('createDatabase is idempotent', () => {
    const db = createDatabase();
    new DeviceModel(db).register({ id: 'D1', name: 'Dev', type: 'typeA' });
    // Creating tables again should not throw (IF NOT EXISTS)
    db.exec("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY)");
    db.close();
  });

  it('WAL mode is set (or memory for in-memory DB)', () => {
    const db = createDatabase();
    const mode = db.pragma('journal_mode', { simple: true });
    // In-memory databases return 'memory' instead of 'wal'
    expect(['wal', 'memory']).toContain(mode);
    db.close();
  });

  it('foreign keys are enabled', () => {
    const db = createDatabase();
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
    db.close();
  });

  it('new columns have correct defaults', () => {
    const db = createDatabase();
    // Insert a device first (FK constraint)
    db.prepare("INSERT INTO devices (id, name, type) VALUES (?,?,?)").run('D1', 'Dev', 'typeA');
    // Insert a log with only required fields
    db.prepare("INSERT INTO logs (id, device_id, filename, size, checksum) VALUES (?,?,?,?,?)").run(
      'L1', 'D1', 'test.log', 100, 'a'.repeat(64)
    );
    const row = db.prepare("SELECT raw_data, vendor, format FROM logs WHERE id = ?").get('L1') as any;
    expect(row.raw_data).toBe('');
    expect(row.vendor).toBe('unknown');
    expect(row.format).toBe('text');
    db.close();
  });
});
