import Database from 'better-sqlite3';

export interface FirmwareRecord {
  id: string;
  version: string;
  device_type: string;
  filename: string;
  size: number;
  sha256: string;
  description: string;
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
}

export class FirmwareModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(firmware: FirmwareInput): FirmwareRecord {
    const stmt = this.db.prepare(`
      INSERT INTO firmware (id, version, device_type, filename, size, sha256, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      firmware.id,
      firmware.version,
      firmware.device_type,
      firmware.filename,
      firmware.size,
      firmware.sha256,
      firmware.description || '',
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

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM firmware WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
