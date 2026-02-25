import Database from 'better-sqlite3';

export interface DeviceKeyRecord {
  device_id: string;
  psk: string;
  created_at: string;
  rotated_at: string;
}

export class DeviceKeyModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  setPsk(deviceId: string, psk: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO device_keys (device_id, psk)
      VALUES (?, ?)
      ON CONFLICT(device_id) DO UPDATE SET psk = excluded.psk, rotated_at = datetime('now')
    `);
    stmt.run(deviceId, psk);
  }

  getPsk(deviceId: string): string | null {
    const stmt = this.db.prepare('SELECT psk FROM device_keys WHERE device_id = ?');
    const row = stmt.get(deviceId) as { psk: string } | undefined;
    return row ? row.psk : null;
  }

  deletePsk(deviceId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM device_keys WHERE device_id = ?');
    const result = stmt.run(deviceId);
    return result.changes > 0;
  }

  hasPsk(deviceId: string): boolean {
    return this.getPsk(deviceId) !== null;
  }
}
