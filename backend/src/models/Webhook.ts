import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookRecord {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: string;
  is_active: number;
  last_triggered_at: string;
  failure_count: number;
  created_at: string;
}

export class WebhookModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: { org_id: string; url: string; secret: string; events: string[] }): WebhookRecord {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO webhooks (id, org_id, url, secret, events) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.org_id, input.url, input.secret, JSON.stringify(input.events));
    return this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRecord;
  }

  getById(id: string): WebhookRecord | undefined {
    return this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRecord | undefined;
  }

  getByOrgId(orgId: string): WebhookRecord[] {
    return this.db.prepare('SELECT * FROM webhooks WHERE org_id = ? ORDER BY created_at DESC').all(orgId) as WebhookRecord[];
  }

  getByEvent(orgId: string, event: string): WebhookRecord[] {
    const all = this.getByOrgId(orgId);
    return all.filter(w => {
      if (!w.is_active) return false;
      try {
        const events: string[] = JSON.parse(w.events);
        return events.includes(event);
      } catch {
        return false;
      }
    });
  }

  update(id: string, fields: { url?: string; events?: string[]; is_active?: number }): WebhookRecord | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const sets: string[] = [];
    const values: any[] = [];

    if (fields.url !== undefined) { sets.push('url = ?'); values.push(fields.url); }
    if (fields.events !== undefined) { sets.push('events = ?'); values.push(JSON.stringify(fields.events)); }
    if (fields.is_active !== undefined) { sets.push('is_active = ?'); values.push(fields.is_active); }

    if (sets.length === 0) return existing;
    values.push(id);

    this.db.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id).changes > 0;
  }

  recordSuccess(id: string): void {
    this.db.prepare("UPDATE webhooks SET failure_count = 0, last_triggered_at = datetime('now') WHERE id = ?").run(id);
  }

  recordFailure(id: string): void {
    this.db.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(id);
    // Disable after 10 consecutive failures
    this.db.prepare('UPDATE webhooks SET is_active = 0 WHERE id = ? AND failure_count >= 10').run(id);
  }
}
