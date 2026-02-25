import Database from 'better-sqlite3';
import { DeviceRecord } from './Device';

export interface ClusterRecord {
  id: string;
  org_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ClusterInput {
  id: string;
  org_id: string;
  name: string;
  description?: string;
}

export class ClusterModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: ClusterInput): ClusterRecord {
    const stmt = this.db.prepare(`
      INSERT INTO clusters (id, org_id, name, description) VALUES (?, ?, ?, ?)
    `);
    stmt.run(input.id, input.org_id, input.name, input.description || '');
    return this.getById(input.id)!;
  }

  getById(id: string): ClusterRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM clusters WHERE id = ?');
    return stmt.get(id) as ClusterRecord | undefined;
  }

  getByOrgId(orgId: string): ClusterRecord[] {
    const stmt = this.db.prepare('SELECT * FROM clusters WHERE org_id = ? ORDER BY created_at DESC');
    return stmt.all(orgId) as ClusterRecord[];
  }

  update(id: string, fields: Partial<Pick<ClusterInput, 'name' | 'description'>>): ClusterRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const sets: string[] = [];
    const values: any[] = [];

    if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name); }
    if (fields.description !== undefined) { sets.push('description = ?'); values.push(fields.description); }

    if (sets.length === 0) return existing;

    sets.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE clusters SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    // Unassign devices first
    this.db.prepare('UPDATE devices SET cluster_id = NULL WHERE cluster_id = ?').run(id);
    const stmt = this.db.prepare('DELETE FROM clusters WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  assignDevice(clusterId: string, deviceId: string): boolean {
    const stmt = this.db.prepare("UPDATE devices SET cluster_id = ?, updated_at = datetime('now') WHERE id = ?");
    return stmt.run(clusterId, deviceId).changes > 0;
  }

  removeDevice(deviceId: string): boolean {
    const stmt = this.db.prepare("UPDATE devices SET cluster_id = NULL, updated_at = datetime('now') WHERE id = ?");
    return stmt.run(deviceId).changes > 0;
  }

  getDevices(clusterId: string): DeviceRecord[] {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE cluster_id = ? ORDER BY created_at DESC');
    return stmt.all(clusterId) as DeviceRecord[];
  }
}
