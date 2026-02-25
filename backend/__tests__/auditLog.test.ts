import { createDatabase } from '../src/models/Database';
import { AuditLogModel } from '../src/models/AuditLog';
import { OrganizationModel } from '../src/models/Organization';
import Database from 'better-sqlite3';

describe('AuditLogModel', () => {
  let db: Database.Database;
  let auditModel: AuditLogModel;

  beforeEach(() => {
    db = createDatabase();
    auditModel = new AuditLogModel(db);

    // Create orgs for FK references
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: 'org-1', name: 'Acme', slug: 'acme' });
    orgModel.create({ id: 'org-2', name: 'Other', slug: 'other' });
  });

  afterEach(() => {
    db.close();
  });

  // --- create ---

  test('creates an audit entry with auto-generated id and created_at', () => {
    const entry = auditModel.create({
      org_id: 'org-1',
      actor_id: 'user-1',
      actor_type: 'user',
      action: 'org.create',
      target_type: 'organization',
      target_id: 'org-1',
      details: '{"name":"Acme"}',
      ip_address: '192.168.1.1',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.created_at).toBeTruthy();
    expect(entry.org_id).toBe('org-1');
    expect(entry.actor_id).toBe('user-1');
    expect(entry.action).toBe('org.create');
  });

  test('create uses defaults for optional fields', () => {
    const entry = auditModel.create({
      org_id: 'org-1',
      actor_id: 'user-1',
      actor_type: '',
      action: 'device.register',
      target_type: '',
      target_id: '',
      details: '',
      ip_address: '',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.action).toBe('device.register');
  });

  // --- getByOrgId ---

  test('getByOrgId returns entries for specific org', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'user.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-2', actor_id: 'u2', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const entries = auditModel.getByOrgId('org-1');
    expect(entries).toHaveLength(2);
    entries.forEach(e => expect(e.org_id).toBe('org-1'));
  });

  test('getByOrgId with action filter', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'user.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'device.register', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const entries = auditModel.getByOrgId('org-1', { action: 'user.create' });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('user.create');
  });

  test('getByOrgId with limit', () => {
    for (let i = 0; i < 5; i++) {
      auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: `action.${i}`, target_type: '', target_id: '', details: '{}', ip_address: '' });
    }

    const entries = auditModel.getByOrgId('org-1', { limit: 3 });
    expect(entries).toHaveLength(3);
  });

  test('getByOrgId returns empty array for org with no entries', () => {
    const entries = auditModel.getByOrgId('org-1');
    expect(entries).toHaveLength(0);
  });

  // --- getStructuralEvents ---

  test('getStructuralEvents returns only structural actions', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'user.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.suspend', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'user.role_change', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const events = auditModel.getStructuralEvents();
    expect(events).toHaveLength(4);
    const actions = events.map(e => e.action);
    expect(actions).toContain('org.create');
    expect(actions).toContain('user.create');
    expect(actions).toContain('org.suspend');
    expect(actions).toContain('user.role_change');
  });

  test('getStructuralEvents excludes non-structural actions', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'device.register', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'log.upload', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'firmware.deploy', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const events = auditModel.getStructuralEvents();
    expect(events).toHaveLength(0);
  });

  test('getStructuralEvents with limit', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'user.create', target_type: '', target_id: '', details: '{}', ip_address: '' });
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.update', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const events = auditModel.getStructuralEvents({ limit: 2 });
    expect(events).toHaveLength(2);
  });

  // --- deleteOlderThan ---

  test('deleteOlderThan removes old entries and returns count', () => {
    // Insert entries with manually set old timestamps
    db.prepare(`
      INSERT INTO audit_logs (id, org_id, actor_id, actor_type, action, target_type, target_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-100 days'))
    `).run('old-1', 'org-1', 'u1', 'user', 'org.create', '', '', '{}', '');

    db.prepare(`
      INSERT INTO audit_logs (id, org_id, actor_id, actor_type, action, target_type, target_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-100 days'))
    `).run('old-2', 'org-1', 'u1', 'user', 'user.create', '', '', '{}', '');

    // Insert a recent entry
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.update', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const deleted = auditModel.deleteOlderThan(90);
    expect(deleted).toBe(2);

    // Recent entry should remain
    const remaining = auditModel.getByOrgId('org-1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].action).toBe('org.update');
  });

  test('deleteOlderThan returns zero when no old entries exist', () => {
    auditModel.create({ org_id: 'org-1', actor_id: 'u1', actor_type: 'user', action: 'org.create', target_type: '', target_id: '', details: '{}', ip_address: '' });

    const deleted = auditModel.deleteOlderThan(90);
    expect(deleted).toBe(0);
  });
});
