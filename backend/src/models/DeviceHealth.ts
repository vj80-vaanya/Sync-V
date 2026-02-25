import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface DeviceHealthRecord {
  device_id: string;
  score: number;
  factors: string;
  trend: string;
  updated_at: string;
}

export interface DeviceHealthHistoryRecord {
  id: string;
  device_id: string;
  score: number;
  created_at: string;
}

export class DeviceHealthModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(deviceId: string, score: number, factors: object, trend: string): DeviceHealthRecord {
    const stmt = this.db.prepare(`
      INSERT INTO device_health (device_id, score, factors, trend, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(device_id) DO UPDATE SET
        score = excluded.score,
        factors = excluded.factors,
        trend = excluded.trend,
        updated_at = excluded.updated_at
    `);
    stmt.run(deviceId, score, JSON.stringify(factors), trend);
    return this.getByDeviceId(deviceId)!;
  }

  getByDeviceId(deviceId: string): DeviceHealthRecord | undefined {
    return this.db.prepare(
      'SELECT * FROM device_health WHERE device_id = ?'
    ).get(deviceId) as DeviceHealthRecord | undefined;
  }

  getAllByOrg(orgId: string): DeviceHealthRecord[] {
    return this.db.prepare(`
      SELECT dh.* FROM device_health dh
      JOIN devices d ON dh.device_id = d.id
      WHERE d.org_id = ?
      ORDER BY dh.score ASC
    `).all(orgId) as DeviceHealthRecord[];
  }

  addHistory(deviceId: string, score: number): DeviceHealthHistoryRecord {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO device_health_history (id, device_id, score)
      VALUES (?, ?, ?)
    `).run(id, deviceId, score);
    return this.db.prepare(
      'SELECT * FROM device_health_history WHERE id = ?'
    ).get(id) as DeviceHealthHistoryRecord;
  }

  getHistory(deviceId: string, limit?: number): DeviceHealthHistoryRecord[] {
    let sql = 'SELECT * FROM device_health_history WHERE device_id = ? ORDER BY created_at DESC';
    const params: any[] = [deviceId];
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    return this.db.prepare(sql).all(...params) as DeviceHealthHistoryRecord[];
  }

  getScoreFromAgo(deviceId: string, hoursAgo: number): number | undefined {
    const row = this.db.prepare(`
      SELECT score FROM device_health_history
      WHERE device_id = ? AND created_at <= datetime('now', ? || ' hours')
      ORDER BY created_at DESC LIMIT 1
    `).get(deviceId, `-${hoursAgo}`) as any;
    return row?.score;
  }

  getAllByOrgPaginated(orgId: string, offset: number, limit: number): DeviceHealthRecord[] {
    return this.db.prepare(`
      SELECT dh.* FROM device_health dh
      JOIN devices d ON dh.device_id = d.id
      WHERE d.org_id = ?
      ORDER BY dh.score ASC
      LIMIT ? OFFSET ?
    `).all(orgId, limit, offset) as DeviceHealthRecord[];
  }

  countByOrg(orgId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM device_health dh
      JOIN devices d ON dh.device_id = d.id
      WHERE d.org_id = ?
    `).get(orgId) as any;
    return row?.cnt || 0;
  }
}
