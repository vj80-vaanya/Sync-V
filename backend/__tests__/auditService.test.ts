import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { AuditLogModel } from '../src/models/AuditLog';
import { AuditService } from '../src/services/AuditService';
import Database from 'better-sqlite3';

describe('AuditService', () => {
  let db: Database.Database;
  let auditModel: AuditLogModel;
  let auditService: AuditService;

  beforeEach(() => {
    db = createDatabase();
    const orgModel = new OrganizationModel(db);
    auditModel = new AuditLogModel(db);
    auditService = new AuditService(auditModel);

    // Create orgs to satisfy foreign key constraints
    orgModel.create({ id: 'org1', name: 'Org One', slug: 'org-one' });
    orgModel.create({ id: 'org2', name: 'Org Two', slug: 'org-two' });
  });

  afterEach(() => {
    db.close();
  });

  test('log creates an audit entry', () => {
    const entry = auditService.log({
      orgId: 'org1',
      actorId: 'user1',
      actorType: 'user',
      action: 'device.register',
      targetType: 'device',
      targetId: 'dev1',
      details: { name: 'Pump A' },
      ipAddress: '192.168.1.1',
    });

    expect(entry.id).toBeDefined();
    expect(entry.org_id).toBe('org1');
    expect(entry.actor_id).toBe('user1');
    expect(entry.actor_type).toBe('user');
    expect(entry.action).toBe('device.register');
    expect(entry.target_type).toBe('device');
    expect(entry.target_id).toBe('dev1');
    expect(JSON.parse(entry.details)).toEqual({ name: 'Pump A' });
    expect(entry.ip_address).toBe('192.168.1.1');
    expect(entry.created_at).toBeDefined();
  });

  test('getOrgAuditLog returns entries for org', () => {
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'device.register' });
    auditService.log({ orgId: 'org1', actorId: 'user2', action: 'device.delete' });
    auditService.log({ orgId: 'org2', actorId: 'user3', action: 'device.register' });

    const org1Logs = auditService.getOrgAuditLog('org1');
    expect(org1Logs).toHaveLength(2);
    expect(org1Logs.every(e => e.org_id === 'org1')).toBe(true);

    const org2Logs = auditService.getOrgAuditLog('org2');
    expect(org2Logs).toHaveLength(1);
    expect(org2Logs[0].actor_id).toBe('user3');
  });

  test('getPlatformAuditLog returns only structural events', () => {
    // Structural events
    auditService.log({ orgId: 'org1', actorId: 'admin1', action: 'org.create' });
    auditService.log({ orgId: 'org1', actorId: 'admin1', action: 'user.create' });
    auditService.log({ orgId: 'org1', actorId: 'admin1', action: 'user.role_change' });

    // Non-structural events (should be excluded)
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'device.register' });
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'log.upload' });

    const structural = auditService.getPlatformAuditLog();
    expect(structural).toHaveLength(3);
    const actions = structural.map(e => e.action);
    expect(actions).toContain('org.create');
    expect(actions).toContain('user.create');
    expect(actions).toContain('user.role_change');
    expect(actions).not.toContain('device.register');
    expect(actions).not.toContain('log.upload');
  });

  test('log with minimal fields works (only actorId and action required)', () => {
    const entry = auditService.log({
      actorId: 'system',
      action: 'heartbeat.check',
    });

    expect(entry.id).toBeDefined();
    expect(entry.actor_id).toBe('system');
    expect(entry.action).toBe('heartbeat.check');
    expect(entry.actor_type).toBe('user'); // default
    expect(entry.target_type).toBe('');
    expect(entry.target_id).toBe('');
    expect(entry.ip_address).toBe('');
  });

  test('getOrgAuditLog filters by action', () => {
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'device.register' });
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'device.delete' });
    auditService.log({ orgId: 'org1', actorId: 'user1', action: 'device.register' });

    const filtered = auditService.getOrgAuditLog('org1', { action: 'device.register' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every(e => e.action === 'device.register')).toBe(true);
  });

  test('getOrgAuditLog returns empty array for org with no entries', () => {
    const entries = auditService.getOrgAuditLog('nonexistent');
    expect(entries).toHaveLength(0);
  });
});
