import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface AnomalyRecord {
  id: string;
  device_id: string;
  org_id: string;
  type: string;
  severity: string;
  message: string;
  log_id: string;
  details: string;
  resolved: number;
  created_at: string;
}

export interface AnomalyInput {
  device_id: string;
  org_id?: string;
  type: string;
  severity: string;
  message: string;
  log_id?: string;
  details?: object;
}

export class AnomalyModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: AnomalyInput): AnomalyRecord {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO anomalies (id, device_id, org_id, type, severity, message, log_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      input.device_id,
      input.org_id || null,
      input.type,
      input.severity,
      input.message,
      input.log_id || null,
      JSON.stringify(input.details || {}),
    );
    return this.db.prepare('SELECT * FROM anomalies WHERE id = ?').get(id) as AnomalyRecord;
  }

  getById(id: string): AnomalyRecord | undefined {
    return this.db.prepare('SELECT * FROM anomalies WHERE id = ?').get(id) as AnomalyRecord | undefined;
  }

  getByOrgId(orgId: string): AnomalyRecord[] {
    return this.db.prepare(
      'SELECT * FROM anomalies WHERE org_id = ? ORDER BY created_at DESC'
    ).all(orgId) as AnomalyRecord[];
  }

  getByDeviceId(deviceId: string): AnomalyRecord[] {
    return this.db.prepare(
      'SELECT * FROM anomalies WHERE device_id = ? ORDER BY created_at DESC'
    ).all(deviceId) as AnomalyRecord[];
  }

  getUnresolved(orgId: string): AnomalyRecord[] {
    return this.db.prepare(
      'SELECT * FROM anomalies WHERE org_id = ? AND resolved = 0 ORDER BY created_at DESC'
    ).all(orgId) as AnomalyRecord[];
  }

  resolve(id: string): boolean {
    const result = this.db.prepare(
      'UPDATE anomalies SET resolved = 1 WHERE id = ?'
    ).run(id);
    return result.changes > 0;
  }

  countByOrg(orgId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM anomalies WHERE org_id = ?'
    ).get(orgId) as any;
    return row?.cnt || 0;
  }

  countUnresolvedByOrg(orgId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM anomalies WHERE org_id = ? AND resolved = 0'
    ).get(orgId) as any;
    return row?.cnt || 0;
  }

  countUnresolvedByDevice(deviceId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM anomalies WHERE device_id = ? AND resolved = 0'
    ).get(deviceId) as any;
    return row?.cnt || 0;
  }

  getByOrgIdPaginated(orgId: string, offset: number, limit: number): AnomalyRecord[] {
    return this.db.prepare(
      'SELECT * FROM anomalies WHERE org_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(orgId, limit, offset) as AnomalyRecord[];
  }
}
