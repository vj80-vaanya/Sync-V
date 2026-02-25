import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { FirmwareModel } from '../src/models/Firmware';
import { AnomalyModel } from '../src/models/Anomaly';
import { DeviceHealthModel } from '../src/models/DeviceHealth';
import { DeviceHealthService } from '../src/services/DeviceHealthService';
import Database from 'better-sqlite3';

describe('DeviceHealthService', () => {
  let db: Database.Database;
  let deviceModel: DeviceModel;
  let logModel: LogModel;
  let firmwareModel: FirmwareModel;
  let anomalyModel: AnomalyModel;
  let healthModel: DeviceHealthModel;
  let service: DeviceHealthService;
  const orgId = 'org1';
  const deviceId = 'dev-001';

  beforeEach(() => {
    db = createDatabase();
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org' });

    deviceModel = new DeviceModel(db);
    logModel = new LogModel(db);
    firmwareModel = new FirmwareModel(db);
    anomalyModel = new AnomalyModel(db);
    healthModel = new DeviceHealthModel(db);
    service = new DeviceHealthService(healthModel, deviceModel, logModel, anomalyModel, firmwareModel);

    deviceModel.register({
      id: deviceId,
      name: 'Pump A',
      type: 'pump',
      status: 'online',
      firmware_version: '1.0.0',
      org_id: orgId,
    });
  });

  afterEach(() => {
    db.close();
  });

  test('computeHealth returns a score between 0 and 100', () => {
    const result = service.computeHealth(deviceId);
    expect(result).toBeDefined();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.deviceId).toBe(deviceId);
    expect(result!.factors).toBeDefined();
    expect(result!.trend).toBeDefined();
  });

  test('computeHealth returns undefined for non-existent device', () => {
    const result = service.computeHealth('nonexistent');
    expect(result).toBeUndefined();
  });

  test('online device with no errors gets high score', () => {
    // Add clean logs
    for (let i = 0; i < 3; i++) {
      logModel.create({
        id: `log-${i}`,
        device_id: deviceId,
        filename: `log-${i}.txt`,
        size: 100,
        checksum: `${i}`.padEnd(64, 'a'),
        raw_data: 'INFO: system ok\nINFO: running\nINFO: check done',
        org_id: orgId,
      });
    }

    // Add latest firmware
    firmwareModel.create({
      id: 'fw-1',
      version: '1.0.0',
      device_type: 'pump',
      filename: 'pump-1.0.0.bin',
      size: 1024,
      sha256: 'a'.repeat(64),
      org_id: orgId,
    });

    const result = service.computeHealth(deviceId);
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.factors.recency).toBe(25);
    expect(result!.factors.errorRate).toBe(25);
  });

  test('device with errors gets lower error rate score', () => {
    // Add log with 100% errors
    logModel.create({
      id: 'log-error',
      device_id: deviceId,
      filename: 'error.log',
      size: 100,
      checksum: 'e'.repeat(64),
      raw_data: 'ERROR: crash\nERROR: failure\nFATAL: system down',
      org_id: orgId,
    });

    const result = service.computeHealth(deviceId);
    expect(result!.factors.errorRate).toBeLessThan(25);
  });

  test('device with unresolved anomalies gets lower anomaly score', () => {
    anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'error_spike',
      severity: 'high',
      message: 'Test anomaly 1',
    });
    anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'new_pattern',
      severity: 'medium',
      message: 'Test anomaly 2',
    });

    const result = service.computeHealth(deviceId);
    expect(result!.factors.anomalyCount).toBe(5); // 15 - 2*5 = 5
  });

  test('device with outdated firmware gets lower firmware score', () => {
    // Current device has 1.0.0, but 2.0.0 and 1.5.0 are available
    firmwareModel.create({
      id: 'fw-1',
      version: '2.0.0',
      device_type: 'pump',
      filename: 'pump-2.0.0.bin',
      size: 1024,
      sha256: 'a'.repeat(64),
      org_id: orgId,
    });
    firmwareModel.create({
      id: 'fw-2',
      version: '1.5.0',
      device_type: 'pump',
      filename: 'pump-1.5.0.bin',
      size: 1024,
      sha256: 'b'.repeat(64),
      org_id: orgId,
    });

    const result = service.computeHealth(deviceId);
    expect(result!.factors.firmwareCurrency).toBeLessThan(15);
  });

  test('computeAllHealth processes all devices in org', () => {
    deviceModel.register({
      id: 'dev-002',
      name: 'Motor B',
      type: 'motor',
      status: 'online',
      org_id: orgId,
    });

    const results = service.computeAllHealth(orgId);
    expect(results).toHaveLength(2);
    // Sorted by score ascending
    expect(results[0].score).toBeLessThanOrEqual(results[1].score);
  });

  test('getHealth returns stored health data', () => {
    service.computeHealth(deviceId);
    const health = service.getHealth(deviceId);

    expect(health).toBeDefined();
    expect(health!.device_id).toBe(deviceId);
    expect(health!.score).toBeGreaterThanOrEqual(0);
  });

  test('getHealth returns undefined for device without computed health', () => {
    const health = service.getHealth('nonexistent');
    expect(health).toBeUndefined();
  });

  test('getFleetHealth returns all devices for org sorted by score', () => {
    deviceModel.register({
      id: 'dev-002',
      name: 'Motor B',
      type: 'motor',
      status: 'offline',
      org_id: orgId,
    });

    service.computeAllHealth(orgId);
    const fleet = service.getFleetHealth(orgId);

    expect(fleet).toHaveLength(2);
    expect(fleet[0].score).toBeLessThanOrEqual(fleet[1].score);
  });

  test('getHistory returns score history', () => {
    service.computeHealth(deviceId);
    service.computeHealth(deviceId);

    const history = service.getHistory(deviceId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].device_id).toBe(deviceId);
  });

  test('getHistory respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      healthModel.addHistory(deviceId, 80 + i);
    }

    const limited = service.getHistory(deviceId, 3);
    expect(limited).toHaveLength(3);
  });

  test('trend is stable for new device', () => {
    const result = service.computeHealth(deviceId);
    expect(result!.trend).toBe('stable');
  });

  test('health model upsert updates existing record', () => {
    healthModel.upsert(deviceId, 80, { recency: 25 }, 'stable');
    healthModel.upsert(deviceId, 60, { recency: 15 }, 'degrading');

    const record = healthModel.getByDeviceId(deviceId);
    expect(record!.score).toBe(60);
    expect(record!.trend).toBe('degrading');
  });
});
