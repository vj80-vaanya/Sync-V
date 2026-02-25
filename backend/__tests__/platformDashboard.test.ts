import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { FirmwareModel } from '../src/models/Firmware';
import { UserModel } from '../src/models/User';
import { PlatformDashboardService } from '../src/services/PlatformDashboardService';
import Database from 'better-sqlite3';

describe('PlatformDashboardService', () => {
  let db: Database.Database;
  let orgModel: OrganizationModel;
  let deviceModel: DeviceModel;
  let logModel: LogModel;
  let firmwareModel: FirmwareModel;
  let userModel: UserModel;
  let dashboard: PlatformDashboardService;

  beforeEach(() => {
    db = createDatabase();
    orgModel = new OrganizationModel(db);
    deviceModel = new DeviceModel(db);
    logModel = new LogModel(db);
    firmwareModel = new FirmwareModel(db);
    userModel = new UserModel(db);
    dashboard = new PlatformDashboardService(orgModel, deviceModel, logModel, firmwareModel, userModel);

    // Create 2 orgs
    orgModel.create({ id: 'org1', name: 'Alpha Corp', slug: 'alpha', plan: 'free', max_devices: 5, max_storage_bytes: 104857600, max_users: 3 });
    orgModel.create({ id: 'org2', name: 'Beta Inc', slug: 'beta', plan: 'pro', max_devices: 50, max_storage_bytes: 1073741824, max_users: 20 });

    // Devices for org1
    deviceModel.register({ id: 'dev1', name: 'D1', type: 'sensor', org_id: 'org1' });
    deviceModel.register({ id: 'dev2', name: 'D2', type: 'sensor', org_id: 'org1' });

    // Devices for org2
    deviceModel.register({ id: 'dev3', name: 'D3', type: 'pump', org_id: 'org2' });

    // Users for org1
    userModel.create({ id: 'u1', username: 'alice', password_hash: 'hash1', role: 'viewer', org_id: 'org1' });

    // Users for org2
    userModel.create({ id: 'u2', username: 'bob', password_hash: 'hash2', role: 'org_admin', org_id: 'org2' });
    userModel.create({ id: 'u3', username: 'carol', password_hash: 'hash3', role: 'technician', org_id: 'org2' });

    // Logs for org1
    logModel.create({ id: 'log1', device_id: 'dev1', filename: 'a.log', size: 1024, checksum: 'aaa', org_id: 'org1' });
    logModel.create({ id: 'log2', device_id: 'dev2', filename: 'b.log', size: 2048, checksum: 'bbb', org_id: 'org1' });

    // Logs for org2
    logModel.create({ id: 'log3', device_id: 'dev3', filename: 'c.log', size: 4096, checksum: 'ccc', org_id: 'org2' });
  });

  afterEach(() => {
    db.close();
  });

  test('getOverview returns correct totals', () => {
    const overview = dashboard.getOverview();
    expect(overview.totalOrgs).toBe(2);
    expect(overview.totalDevices).toBe(3);
    expect(overview.totalUsers).toBe(3);
    expect(overview.totalLogs).toBe(3);
    expect(overview.activeOrgs).toBe(2);
    expect(overview.suspendedOrgs).toBe(0);
  });

  test('getOverview returns correct planDistribution', () => {
    const overview = dashboard.getOverview();
    expect(overview.planDistribution.free).toBe(1);
    expect(overview.planDistribution.pro).toBe(1);
    expect(overview.planDistribution.enterprise).toBe(0);
  });

  test('getOverview counts suspended orgs', () => {
    orgModel.suspend('org2');
    const overview = dashboard.getOverview();
    expect(overview.activeOrgs).toBe(1);
    expect(overview.suspendedOrgs).toBe(1);
  });

  test('getOrgSummaries returns array with usage stats', () => {
    const summaries = dashboard.getOrgSummaries();
    expect(summaries).toHaveLength(2);

    const alpha = summaries.find(s => s.org.id === 'org1');
    expect(alpha).toBeDefined();
    expect(alpha!.deviceCount).toBe(2);
    expect(alpha!.userCount).toBe(1);
    expect(alpha!.logCount).toBe(2);
    expect(alpha!.storageUsed).toBe(3072); // 1024 + 2048

    const beta = summaries.find(s => s.org.id === 'org2');
    expect(beta).toBeDefined();
    expect(beta!.deviceCount).toBe(1);
    expect(beta!.userCount).toBe(2);
    expect(beta!.logCount).toBe(1);
    expect(beta!.storageUsed).toBe(4096);
  });

  test('getOrgSummaries includes quotaUsage percentages', () => {
    const summaries = dashboard.getOrgSummaries();

    const alpha = summaries.find(s => s.org.id === 'org1')!;
    // 2/5 devices = 40%
    expect(alpha.quotaUsage.devices).toBe(40);
    // 1/3 users = 33%
    expect(alpha.quotaUsage.users).toBe(33);
    // 3072/104857600 storage ~ 0%
    expect(alpha.quotaUsage.storage).toBe(0);

    const beta = summaries.find(s => s.org.id === 'org2')!;
    // 1/50 devices = 2%
    expect(beta.quotaUsage.devices).toBe(2);
    // 2/20 users = 10%
    expect(beta.quotaUsage.users).toBe(10);
  });

  test('getOrgDetail returns org detail', () => {
    const detail = dashboard.getOrgDetail('org1');
    expect(detail).toBeDefined();
    expect(detail!.org.id).toBe('org1');
    expect(detail!.org.name).toBe('Alpha Corp');
    expect(detail!.deviceCount).toBe(2);
    expect(detail!.userCount).toBe(1);
    expect(detail!.logCount).toBe(2);
    expect(detail!.storageUsed).toBe(3072);
    expect(detail!.clusterCount).toBe(0);
  });

  test('getOrgDetail returns undefined for nonexistent org', () => {
    const detail = dashboard.getOrgDetail('nonexistent');
    expect(detail).toBeUndefined();
  });

  test('getOverview handles empty platform', () => {
    // Create a fresh empty DB
    const emptyDb = createDatabase();
    const emptyDashboard = new PlatformDashboardService(
      new OrganizationModel(emptyDb),
      new DeviceModel(emptyDb),
      new LogModel(emptyDb),
      new FirmwareModel(emptyDb),
      new UserModel(emptyDb),
    );

    const overview = emptyDashboard.getOverview();
    expect(overview.totalOrgs).toBe(0);
    expect(overview.totalDevices).toBe(0);
    expect(overview.totalUsers).toBe(0);
    expect(overview.totalLogs).toBe(0);
    emptyDb.close();
  });
});
