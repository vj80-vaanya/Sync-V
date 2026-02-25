import Database from 'better-sqlite3';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export interface UserInput {
  id: string;
  username: string;
  password_hash: string;
  role: 'platform_admin' | 'org_admin' | 'technician' | 'viewer';
  org_id?: string;
}

export class UserModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(user: UserInput): UserRecord {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(user.id, user.username, user.password_hash, user.role, user.org_id || null);
    return this.getById(user.id)!;
  }

  getById(id: string): UserRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as UserRecord | undefined;
  }

  getByUsername(username: string): UserRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as UserRecord | undefined;
  }

  getByOrgId(orgId: string): UserRecord[] {
    const stmt = this.db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY created_at DESC');
    return stmt.all(orgId) as UserRecord[];
  }

  countByOrgId(orgId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM users WHERE org_id = ?').get(orgId) as any;
    return row?.cnt || 0;
  }

  updateRole(userId: string, role: string): boolean {
    const stmt = this.db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?");
    return stmt.run(role, userId).changes > 0;
  }

  delete(userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(userId).changes > 0;
  }

  getAll(): UserRecord[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as UserRecord[];
  }
}
