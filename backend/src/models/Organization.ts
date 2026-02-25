import Database from 'better-sqlite3';

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_devices: number;
  max_storage_bytes: number;
  max_users: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrgInput {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  max_devices?: number;
  max_storage_bytes?: number;
  max_users?: number;
}

export class OrganizationModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(org: OrgInput): OrgRecord {
    const stmt = this.db.prepare(`
      INSERT INTO organizations (id, name, slug, plan, max_devices, max_storage_bytes, max_users)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      org.id,
      org.name,
      org.slug,
      org.plan || 'free',
      org.max_devices ?? 5,
      org.max_storage_bytes ?? 104857600,
      org.max_users ?? 3,
    );
    return this.getById(org.id)!;
  }

  getById(id: string): OrgRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM organizations WHERE id = ?');
    return stmt.get(id) as OrgRecord | undefined;
  }

  getBySlug(slug: string): OrgRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM organizations WHERE slug = ?');
    return stmt.get(slug) as OrgRecord | undefined;
  }

  getAll(): OrgRecord[] {
    const stmt = this.db.prepare('SELECT * FROM organizations ORDER BY created_at DESC');
    return stmt.all() as OrgRecord[];
  }

  update(id: string, fields: Partial<OrgInput>): OrgRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const sets: string[] = [];
    const values: any[] = [];

    if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name); }
    if (fields.slug !== undefined) { sets.push('slug = ?'); values.push(fields.slug); }
    if (fields.plan !== undefined) { sets.push('plan = ?'); values.push(fields.plan); }
    if (fields.max_devices !== undefined) { sets.push('max_devices = ?'); values.push(fields.max_devices); }
    if (fields.max_storage_bytes !== undefined) { sets.push('max_storage_bytes = ?'); values.push(fields.max_storage_bytes); }
    if (fields.max_users !== undefined) { sets.push('max_users = ?'); values.push(fields.max_users); }

    if (sets.length === 0) return existing;

    sets.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  suspend(id: string): boolean {
    const stmt = this.db.prepare("UPDATE organizations SET status = 'suspended', updated_at = datetime('now') WHERE id = ?");
    return stmt.run(id).changes > 0;
  }

  activate(id: string): boolean {
    const stmt = this.db.prepare("UPDATE organizations SET status = 'active', updated_at = datetime('now') WHERE id = ?");
    return stmt.run(id).changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM organizations WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  getUsageStats(id: string): { deviceCount: number; logCount: number; storageBytes: number; userCount: number } {
    const deviceCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM devices WHERE org_id = ?').get(id) as any)?.cnt || 0;
    const logCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM logs WHERE org_id = ?').get(id) as any)?.cnt || 0;
    const storageBytes = (this.db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM logs WHERE org_id = ?').get(id) as any)?.total || 0;
    const userCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM users WHERE org_id = ?').get(id) as any)?.cnt || 0;
    return { deviceCount, logCount, storageBytes, userCount };
  }
}
