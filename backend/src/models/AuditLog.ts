import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface AuditEntry {
  id: string;
  org_id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export class AuditLogModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(entry: Omit<AuditEntry, 'id' | 'created_at'>): AuditEntry {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, org_id, actor_id, actor_type, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.org_id || null,
      entry.actor_id,
      entry.actor_type || 'user',
      entry.action,
      entry.target_type || '',
      entry.target_id || '',
      entry.details || '{}',
      entry.ip_address || '',
    );
    return this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as AuditEntry;
  }

  getByOrgId(orgId: string, options?: { from?: string; to?: string; action?: string; limit?: number }): AuditEntry[] {
    let sql = 'SELECT * FROM audit_logs WHERE org_id = ?';
    const params: any[] = [orgId];

    if (options?.from) { sql += ' AND created_at >= ?'; params.push(options.from); }
    if (options?.to) { sql += ' AND created_at <= ?'; params.push(options.to); }
    if (options?.action) { sql += ' AND action = ?'; params.push(options.action); }

    sql += ' ORDER BY created_at DESC';
    if (options?.limit) { sql += ' LIMIT ?'; params.push(options.limit); }

    return this.db.prepare(sql).all(...params) as AuditEntry[];
  }

  getStructuralEvents(options?: { from?: string; to?: string; limit?: number }): AuditEntry[] {
    const structuralActions = [
      'org.create', 'org.update', 'org.suspend', 'org.activate', 'org.plan_change',
      'user.create', 'user.delete', 'user.role_change',
    ];
    const placeholders = structuralActions.map(() => '?').join(',');
    let sql = `SELECT * FROM audit_logs WHERE action IN (${placeholders})`;
    const params: any[] = [...structuralActions];

    if (options?.from) { sql += ' AND created_at >= ?'; params.push(options.from); }
    if (options?.to) { sql += ' AND created_at <= ?'; params.push(options.to); }

    sql += ' ORDER BY created_at DESC';
    if (options?.limit) { sql += ' LIMIT ?'; params.push(options.limit); }

    return this.db.prepare(sql).all(...params) as AuditEntry[];
  }

  deleteOlderThan(days: number): number {
    const stmt = this.db.prepare("DELETE FROM audit_logs WHERE created_at < datetime('now', ? || ' days')");
    return stmt.run(`-${days}`).changes;
  }
}
