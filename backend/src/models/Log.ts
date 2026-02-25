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
  org_id: string;
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
  org_id?: string;
}

const SUMMARY_COLS = 'id, device_id, filename, size, checksum, raw_path, vendor, format, metadata, org_id, uploaded_at';

export class LogModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(log: LogInput): LogRecord {
    const stmt = this.db.prepare(`
      INSERT INTO logs (id, device_id, filename, size, checksum, raw_path, raw_data, vendor, format, metadata, org_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      log.org_id || null,
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

  getRecentByDeviceId(deviceId: string, limit: number): LogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM logs WHERE device_id = ? ORDER BY uploaded_at DESC LIMIT ?');
    return stmt.all(deviceId, limit) as LogRecord[];
  }

  getAll(): LogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM logs ORDER BY uploaded_at DESC');
    return stmt.all() as LogRecord[];
  }

  getAllSummary(): LogSummary[] {
    const stmt = this.db.prepare(`SELECT ${SUMMARY_COLS} FROM logs ORDER BY uploaded_at DESC`);
    return stmt.all() as LogSummary[];
  }

  getByDeviceIdSummary(deviceId: string): LogSummary[] {
    const stmt = this.db.prepare(
      `SELECT ${SUMMARY_COLS} FROM logs WHERE device_id = ? ORDER BY uploaded_at DESC`
    );
    return stmt.all(deviceId) as LogSummary[];
  }

  getAllSummaryByOrg(orgId: string): LogSummary[] {
    const stmt = this.db.prepare(`SELECT ${SUMMARY_COLS} FROM logs WHERE org_id = ? ORDER BY uploaded_at DESC`);
    return stmt.all(orgId) as LogSummary[];
  }

  getByDeviceIdSummaryAndOrg(deviceId: string, orgId: string): LogSummary[] {
    const stmt = this.db.prepare(
      `SELECT ${SUMMARY_COLS} FROM logs WHERE device_id = ? AND org_id = ? ORDER BY uploaded_at DESC`
    );
    return stmt.all(deviceId, orgId) as LogSummary[];
  }

  countByOrg(orgId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM logs WHERE org_id = ?').get(orgId) as any;
    return row?.cnt || 0;
  }

  storageSizeByOrg(orgId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM logs WHERE org_id = ?').get(orgId) as any;
    return row?.total || 0;
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

  updateMetadata(id: string, metadata: string): boolean {
    const result = this.db.prepare('UPDATE logs SET metadata = ? WHERE id = ?').run(metadata, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM logs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
