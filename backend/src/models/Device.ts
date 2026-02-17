import Database from 'better-sqlite3';

export interface DeviceRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface DeviceInput {
  id: string;
  name: string;
  type: string;
  status?: string;
  firmware_version?: string;
  metadata?: Record<string, string>;
}

export class DeviceModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  register(device: DeviceInput): DeviceRecord {
    const stmt = this.db.prepare(`
      INSERT INTO devices (id, name, type, status, firmware_version, metadata, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      device.id,
      device.name,
      device.type,
      device.status || 'unknown',
      device.firmware_version || '',
      JSON.stringify(device.metadata || {}),
    );

    return this.getById(device.id)!;
  }

  getById(id: string): DeviceRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
    return stmt.get(id) as DeviceRecord | undefined;
  }

  getAll(): DeviceRecord[] {
    const stmt = this.db.prepare('SELECT * FROM devices ORDER BY created_at DESC');
    return stmt.all() as DeviceRecord[];
  }

  getByType(type: string): DeviceRecord[] {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE type = ?');
    return stmt.all(type) as DeviceRecord[];
  }

  getByStatus(status: string): DeviceRecord[] {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE status = ?');
    return stmt.all(status) as DeviceRecord[];
  }

  updateMetadata(id: string, metadata: Record<string, string>): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    let existingMeta: Record<string, unknown> = {};
    try {
      existingMeta = JSON.parse(existing.metadata);
    } catch {
      // Corrupted metadata — start fresh
    }
    const merged = { ...existingMeta, ...metadata };

    const stmt = this.db.prepare(`
      UPDATE devices SET metadata = ?, updated_at = datetime('now') WHERE id = ?
    `);
    const result = stmt.run(JSON.stringify(merged), id);
    return result.changes > 0;
  }

  updateStatus(id: string, status: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE devices SET status = ?, last_seen = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(status, id);
    return result.changes > 0;
  }

  updateFirmwareVersion(id: string, version: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE devices SET firmware_version = ?, updated_at = datetime('now') WHERE id = ?
    `);
    const result = stmt.run(version, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM devices WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
