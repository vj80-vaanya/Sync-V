import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { UserModel } from '../src/models/User';
import { QuotaService } from '../src/services/QuotaService';
import Database from 'better-sqlite3';

describe('QuotaService', () => {
  let db: Database.Database;
  let orgModel: OrganizationModel;
  let deviceModel: DeviceModel;
  let logModel: LogModel;
  let userModel: UserModel;
  let quotaService: QuotaService;

  beforeEach(() => {
    db = createDatabase();
    orgModel = new OrganizationModel(db);
    deviceModel = new DeviceModel(db);
    logModel = new LogModel(db);
    userModel = new UserModel(db);
    quotaService = new QuotaService(orgModel, deviceModel, logModel, userModel);

    // Create a free-plan org: 5 devices, 100MB storage, 3 users
    orgModel.create({
      id: 'org1',
      name: 'Test',
      slug: 'test',
      plan: 'free',
      max_devices: 5,
      max_storage_bytes: 104857600,
      max_users: 3,
    });
  });

  afterEach(() => {
    db.close();
  });

  test('checkDeviceQuota returns allowed:true when under limit', () => {
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    deviceModel.register({ id: 'dev2', name: 'D2', type: 'sensor', org_id: 'org1' });

    const result = quotaService.checkDeviceQuota('org1');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
    expect(result.max).toBe(5);
  });

  test('checkDeviceQuota returns allowed:false when at limit', () => {
    for (let i = 1; i <= 5; i++) {
      deviceModel.register({ id: `dev${i}`, name: `D${i}`, type: 'sensor', org_id: 'org1' });
    }

    const result = quotaService.checkDeviceQuota('org1');
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(5);
    expect(result.max).toBe(5);
  });

  test('checkStorageQuota returns allowed:true when under limit', () => {
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    logModel.create({ id: 'log1', device_id: 'dev1', filename: 'a.log', size: 1024, checksum: 'abc', org_id: 'org1' });

    const result = quotaService.checkStorageQuota('org1');
    expect(result.allowed).toBe(true);
    expect(result.usedBytes).toBe(1024);
    expect(result.maxBytes).toBe(104857600);
  });

  test('checkStorageQuota returns allowed:false when at limit', () => {
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    // Create a log that fills the quota entirely
    logModel.create({ id: 'log1', device_id: 'dev1', filename: 'big.log', size: 104857600, checksum: 'abc', org_id: 'org1' });

    const result = quotaService.checkStorageQuota('org1');
    expect(result.allowed).toBe(false);
    expect(result.usedBytes).toBe(104857600);
    expect(result.maxBytes).toBe(104857600);
  });

  test('checkUserQuota returns allowed:true when under limit', () => {
    userModel.create({ id: 'u1', username: 'alice', password_hash: 'hash1', role: 'viewer', org_id: 'org1' });

    const result = quotaService.checkUserQuota('org1');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.max).toBe(3);
  });

  test('checkUserQuota returns allowed:false when at limit', () => {
    userModel.create({ id: 'u1', username: 'alice', password_hash: 'hash1', role: 'viewer', org_id: 'org1' });
    userModel.create({ id: 'u2', username: 'bob', password_hash: 'hash2', role: 'viewer', org_id: 'org1' });
    userModel.create({ id: 'u3', username: 'carol', password_hash: 'hash3', role: 'viewer', org_id: 'org1' });

    const result = quotaService.checkUserQuota('org1');
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(3);
    expect(result.max).toBe(3);
  });

  test('enforceDeviceQuota throws when quota exceeded', () => {
    for (let i = 1; i <= 5; i++) {
      deviceModel.register({ id: `dev${i}`, name: `D${i}`, type: 'sensor', org_id: 'org1' });
    }

    try {
      quotaService.enforceDeviceQuota('org1');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('quota exceeded');
    }
  });

  test('enforceStorageQuota throws when exceeded', () => {
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    logModel.create({ id: 'log1', device_id: 'dev1', filename: 'big.log', size: 104857600, checksum: 'abc', org_id: 'org1' });

    try {
      quotaService.enforceStorageQuota('org1');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('quota exceeded');
    }
  });

  test('enforceUserQuota throws when exceeded', () => {
    userModel.create({ id: 'u1', username: 'alice', password_hash: 'hash1', role: 'viewer', org_id: 'org1' });
    userModel.create({ id: 'u2', username: 'bob', password_hash: 'hash2', role: 'viewer', org_id: 'org1' });
    userModel.create({ id: 'u3', username: 'carol', password_hash: 'hash3', role: 'viewer', org_id: 'org1' });

    try {
      quotaService.enforceUserQuota('org1');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('quota exceeded');
    }
  });

  test('getUsageSummary returns correct numbers', () => {
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    deviceModel.register({ id: 'dev2', name: 'D2', type: 'sensor', org_id: 'org1' });
    logModel.create({ id: 'log1', device_id: 'dev1', filename: 'a.log', size: 2048, checksum: 'abc', org_id: 'org1' });
    userModel.create({ id: 'u1', username: 'alice', password_hash: 'hash1', role: 'viewer', org_id: 'org1' });

    const summary = quotaService.getUsageSummary('org1');
    expect(summary.devices.used).toBe(2);
    expect(summary.devices.max).toBe(5);
    expect(summary.storage.usedBytes).toBe(2048);
    expect(summary.storage.maxBytes).toBe(104857600);
    expect(summary.users.used).toBe(1);
    expect(summary.users.max).toBe(3);
  });

  test('enterprise plan has unlimited users (checkUserQuota always allowed)', () => {
    orgModel.create({
      id: 'org-ent',
      name: 'Enterprise Co',
      slug: 'enterprise-co',
      plan: 'enterprise',
      max_devices: 100,
      max_storage_bytes: 1073741824,
      max_users: 3,
    });

    // Add more users than the max_users number
    userModel.create({ id: 'eu1', username: 'ent-alice', password_hash: 'hash1', role: 'viewer', org_id: 'org-ent' });
    userModel.create({ id: 'eu2', username: 'ent-bob', password_hash: 'hash2', role: 'viewer', org_id: 'org-ent' });
    userModel.create({ id: 'eu3', username: 'ent-carol', password_hash: 'hash3', role: 'viewer', org_id: 'org-ent' });
    userModel.create({ id: 'eu4', username: 'ent-dave', password_hash: 'hash4', role: 'viewer', org_id: 'org-ent' });

    const result = quotaService.checkUserQuota('org-ent');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(4);
  });

  test('checkDeviceQuota returns allowed:false for nonexistent org', () => {
    const result = quotaService.checkDeviceQuota('nonexistent');
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(0);
    expect(result.max).toBe(0);
  });
});
