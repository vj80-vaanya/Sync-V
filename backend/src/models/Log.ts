import Database from 'better-sqlite3';

export interface LogRecord {
  id: string;
  device_id: string;
  filename: string;
  size: number;
  checksum: string;
  raw_path: string;
  raw_data: string;
  vendor: string;
  format: string;
  metadata: string;
  uploaded_at: string;
}

export type LogSummary = Omit<LogRecord, 'raw_data'>;

export interface LogInput {
  id: string;
  device_id: string;
  filename: string;
  size: number;
  checksum: string;
  raw_path?: string;
  raw_data?: string;
  vendor?: string;
  format?: string;
  metadata?: Record<string, string>;
}

export class LogModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(log: LogInput): LogRecord {
    const stmt = this.db.prepare(`
      INSERT INTO logs (id, device_id, filename, size, checksum, raw_path, raw_data, vendor, format, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.id,
      log.device_id,
      log.filename,
      log.size,
      log.checksum,
      log.raw_path || '',
      log.raw_data || '',
      log.vendor || 'unknown',
      log.format || 'text',
      JSON.stringify(log.metadata || {}),
    );

    return this.getById(log.id)!;
  }

  getById(id: string): LogRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM logs WHERE id = ?');
    return stmt.get(id) as LogRecord | undefined;
  }

  getByDeviceId(deviceId: string): LogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM logs WHERE device_id = ? ORDER BY uploaded_at DESC');
    return stmt.all(deviceId) as LogRecord[];
  }

  getAll(): LogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM logs ORDER BY uploaded_at DESC');
    return stmt.all() as LogRecord[];
  }

  getAllSummary(): LogSummary[] {
    const stmt = this.db.prepare(
      'SELECT id, device_id, filename, size, checksum, raw_path, vendor, format, metadata, uploaded_at FROM logs ORDER BY uploaded_at DESC'
    );
    return stmt.all() as LogSummary[];
  }

  getByDeviceIdSummary(deviceId: string): LogSummary[] {
    const stmt = this.db.prepare(
      'SELECT id, device_id, filename, size, checksum, raw_path, vendor, format, metadata, uploaded_at FROM logs WHERE device_id = ? ORDER BY uploaded_at DESC'
    );
    return stmt.all(deviceId) as LogSummary[];
  }

  getByChecksum(checksum: string): LogRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM logs WHERE checksum = ?');
    return stmt.get(checksum) as LogRecord | undefined;
  }

  getDistinctVendors(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT vendor FROM logs ORDER BY vendor').all() as any[];
    return rows.map((r) => r.vendor);
  }

  getDistinctFormats(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT format FROM logs ORDER BY format').all() as any[];
    return rows.map((r) => r.format);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM logs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
