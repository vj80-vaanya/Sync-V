import Database from 'better-sqlite3';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export interface UserInput {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'technician' | 'viewer';
}

export class UserModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(user: UserInput): UserRecord {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)
    `);
    stmt.run(user.id, user.username, user.password_hash, user.role);
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
}
