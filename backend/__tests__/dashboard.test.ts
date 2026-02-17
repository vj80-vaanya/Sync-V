import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { FirmwareModel } from '../src/models/Firmware';
import { DashboardService } from '../src/services/DashboardService';
import Database from 'better-sqlite3';

describe('Dashboard API', () => {
  let db: Database.Database;
  let dashboard: DashboardService;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    const firmwareModel = new FirmwareModel(db);

    // Seed test data
    deviceModel.register({ id: 'DEV001', name: 'Device 1', type: 'typeA', status: 'online', firmware_version: '1.0.0' });
    deviceModel.register({ id: 'DEV002', name: 'Device 2', type: 'typeA', status: 'offline', firmware_version: '1.0.0' });
    deviceModel.register({ id: 'DEV003', name: 'Device 3', type: 'typeB', status: 'online', firmware_version: '2.0.0' });

    logModel.create({ id: 'LOG001', device_id: 'DEV001', filename: 'log1.txt', size: 1024, checksum: 'a'.repeat(64) });
    logModel.create({ id: 'LOG002', device_id: 'DEV001', filename: 'log2.txt', size: 2048, checksum: 'b'.repeat(64) });
    logModel.create({ id: 'LOG003', device_id: 'DEV002', filename: 'log3.txt', size: 512, checksum: 'c'.repeat(64) });

    firmwareModel.create({ id: 'FW001', version: '1.0.0', device_type: 'typeA', filename: 'fw_a_v1.bin', size: 5000, sha256: 'd'.repeat(64) });
    firmwareModel.create({ id: 'FW002', version: '2.0.0', device_type: 'typeA', filename: 'fw_a_v2.bin', size: 6000, sha256: 'e'.repeat(64) });

    dashboard = new DashboardService(deviceModel, logModel, firmwareModel);
  });

  afterEach(() => {
    db.close();
  });

  test('returns fleet overview', () => {
    const overview = dashboard.getFleetOverview();

    expect(overview.totalDevices).toBe(3);
    expect(overview.onlineDevices).toBe(2);
    expect(overview.offlineDevices).toBe(1);
    expect(overview.totalLogs).toBe(3);
    expect(overview.deviceTypes).toContain('typeA');
    expect(overview.deviceTypes).toContain('typeB');
  });

  test('returns per-device detail', () => {
    const detail = dashboard.getDeviceDetail('DEV001');

    expect(detail).toBeDefined();
    expect(detail!.device.id).toBe('DEV001');
    expect(detail!.logCount).toBe(2);
    expect(detail!.device.firmware_version).toBe('1.0.0');
  });

  test('returns firmware status summary', () => {
    const summary = dashboard.getFirmwareStatusSummary();

    expect(summary.totalFirmwarePackages).toBe(2);
    expect(summary.byDeviceType['typeA']).toBe(2);
  });

  test('returns log upload history', () => {
    const history = dashboard.getLogUploadHistory();

    expect(history).toHaveLength(3);
    expect(history[0].filename).toBeTruthy();
  });

  test('returns undefined for non-existent device detail', () => {
    const detail = dashboard.getDeviceDetail('NONEXISTENT');
    expect(detail).toBeUndefined();
  });
});
