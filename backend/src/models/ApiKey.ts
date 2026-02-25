import Database from 'better-sqlite3';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface ApiKeyRecord {
  id: string;
  org_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string;
  last_used_at: string;
  created_by: string;
  created_at: string;
}

export class ApiKeyModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: { org_id: string; name: string; permissions: string[]; created_by: string }): { record: ApiKeyRecord; rawKey: string } {
    const id = uuidv4();
    const rawKey = `svk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const stmt = this.db.prepare(`
      INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, permissions, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.org_id, input.name, keyHash, keyPrefix, JSON.stringify(input.permissions), input.created_by);

    const record = this.db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKeyRecord;
    return { record, rawKey };
  }

  getByKeyHash(hash: string): ApiKeyRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?');
    return stmt.get(hash) as ApiKeyRecord | undefined;
  }

  getByOrgId(orgId: string): Omit<ApiKeyRecord, 'key_hash'>[] {
    const stmt = this.db.prepare(
      'SELECT id, org_id, name, key_prefix, permissions, last_used_at, created_by, created_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(orgId) as Omit<ApiKeyRecord, 'key_hash'>[];
  }

  updateLastUsed(id: string): void {
    this.db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  getById(id: string): ApiKeyRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
    return stmt.get(id) as ApiKeyRecord | undefined;
  }
}
