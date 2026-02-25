import Database from 'better-sqlite3';

export interface FirmwareRecord {
  id: string;
  version: string;
  device_type: string;
  filename: string;
  size: number;
  sha256: string;
  description: string;
  org_id: string;
  release_date: string;
  created_at: string;
}

export interface FirmwareInput {
  id: string;
  version: string;
  device_type: string;
  filename: string;
  size: number;
  sha256: string;
  description?: string;
  org_id?: string;
}

export class FirmwareModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(firmware: FirmwareInput): FirmwareRecord {
    const stmt = this.db.prepare(`
      INSERT INTO firmware (id, version, device_type, filename, size, sha256, description, org_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      firmware.id,
      firmware.version,
      firmware.device_type,
      firmware.filename,
      firmware.size,
      firmware.sha256,
      firmware.description || '',
      firmware.org_id || null,
    );

    return this.getById(firmware.id)!;
  }

  getById(id: string): FirmwareRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM firmware WHERE id = ?');
    return stmt.get(id) as FirmwareRecord | undefined;
  }

  getByDeviceType(deviceType: string): FirmwareRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM firmware WHERE device_type = ? ORDER BY release_date DESC'
    );
    return stmt.all(deviceType) as FirmwareRecord[];
  }

  getLatestForDeviceType(deviceType: string): FirmwareRecord | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM firmware WHERE device_type = ? ORDER BY release_date DESC, rowid DESC LIMIT 1'
    );
    return stmt.get(deviceType) as FirmwareRecord | undefined;
  }

  getAll(): FirmwareRecord[] {
    const stmt = this.db.prepare('SELECT * FROM firmware ORDER BY release_date DESC');
    return stmt.all() as FirmwareRecord[];
  }

  getAllByOrg(orgId: string): FirmwareRecord[] {
    const stmt = this.db.prepare('SELECT * FROM firmware WHERE org_id = ? ORDER BY release_date DESC');
    return stmt.all(orgId) as FirmwareRecord[];
  }

  getByDeviceTypeAndOrg(deviceType: string, orgId: string): FirmwareRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM firmware WHERE device_type = ? AND org_id = ? ORDER BY release_date DESC'
    );
    return stmt.all(deviceType, orgId) as FirmwareRecord[];
  }

  getLatestByOrg(deviceType: string, orgId: string): FirmwareRecord | undefined {
    const stmt = this.db.prepare(
      'SELECT * FROM firmware WHERE device_type = ? AND org_id = ? ORDER BY release_date DESC, rowid DESC LIMIT 1'
    );
    return stmt.get(deviceType, orgId) as FirmwareRecord | undefined;
  }

  countByOrg(orgId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM firmware WHERE org_id = ?').get(orgId) as any;
    return row?.cnt || 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM firmware WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
