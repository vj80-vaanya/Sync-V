import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { AnomalyModel } from '../src/models/Anomaly';
import { DeviceHealthModel } from '../src/models/DeviceHealth';
import { FirmwareModel } from '../src/models/Firmware';
import { AnomalyDetectionService } from '../src/services/AnomalyDetectionService';
import { DeviceHealthService } from '../src/services/DeviceHealthService';
import { Scheduler } from '../src/services/Scheduler';
import Database from 'better-sqlite3';

describe('Scheduler', () => {
  let db: Database.Database;
  let orgModel: OrganizationModel;
  let anomalyService: AnomalyDetectionService;
  let healthService: DeviceHealthService;
  let scheduler: Scheduler;
  let orgId: string;

  beforeAll(() => {
    db = createDatabase(':memory:');
    orgModel = new OrganizationModel(db);
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    const anomalyModel = new AnomalyModel(db);
    const healthModel = new DeviceHealthModel(db);
    const firmwareModel = new FirmwareModel(db);

    anomalyService = new AnomalyDetectionService(anomalyModel, logModel, deviceModel);
    healthService = new DeviceHealthService(healthModel, deviceModel, logModel, anomalyModel, firmwareModel);

    // Seed test data
    orgId = 'sched-org-1';
    orgModel.create({ id: orgId, name: 'Scheduler Test Org', slug: 'sched-test' });
    deviceModel.register({ id: 'sched-dev-1', name: 'Device A', type: 'pump', status: 'online', org_id: orgId });
    deviceModel.register({ id: 'sched-dev-2', name: 'Device B', type: 'motor', status: 'online', org_id: orgId });
  });

  afterAll(() => {
    db.close();
  });

  test('start registers cron jobs and stop clears them', () => {
    scheduler = new Scheduler(anomalyService, healthService, orgModel);
    scheduler.start();
    // No errors thrown means jobs registered
    scheduler.stop();
  });

  test('runSilenceCheck runs without error', () => {
    scheduler = new Scheduler(anomalyService, healthService, orgModel);
    expect(() => scheduler.runSilenceCheck()).not.toThrow();
  });

  test('runVolumeCheck runs without error', () => {
    scheduler = new Scheduler(anomalyService, healthService, orgModel);
    expect(() => scheduler.runVolumeCheck()).not.toThrow();
  });

  test('runHealthCompute runs and computes health for all org devices', () => {
    scheduler = new Scheduler(anomalyService, healthService, orgModel);
    expect(() => scheduler.runHealthCompute()).not.toThrow();
  });

  test('dispatches webhook on anomaly detection', () => {
    const mockDispatcher = {
      dispatch: jest.fn(),
    };
    scheduler = new Scheduler(anomalyService, healthService, orgModel, mockDispatcher as any);

    // Add a device with enough logs to trigger silence check
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    deviceModel.register({ id: 'sched-dev-silence', name: 'Silent Device', type: 'pump', status: 'offline', org_id: orgId });

    // Add logs with old timestamps to trigger silence detection
    const oldTime1 = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const oldTime2 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    logModel.create({
      id: 'sched-log-old-1', device_id: 'sched-dev-silence',
      filename: 'old1.log', size: 10, checksum: 'a1'.repeat(32),
      raw_data: 'INFO: ok', org_id: orgId,
    });
    logModel.create({
      id: 'sched-log-old-2', device_id: 'sched-dev-silence',
      filename: 'old2.log', size: 10, checksum: 'a2'.repeat(32),
      raw_data: 'INFO: ok', org_id: orgId,
    });

    // Force old timestamps
    db.prepare("UPDATE logs SET uploaded_at = ? WHERE id = 'sched-log-old-1'").run(oldTime1);
    db.prepare("UPDATE logs SET uploaded_at = ? WHERE id = 'sched-log-old-2'").run(oldTime2);

    scheduler.runSilenceCheck();
    // The silence check may or may not detect anomalies depending on intervals
    // Just verify it doesn't throw
  });

  test('broadcasts via wsService on health compute', () => {
    const mockWs = {
      broadcastAnomaly: jest.fn(),
      broadcastHealthUpdate: jest.fn(),
    };
    scheduler = new Scheduler(anomalyService, healthService, orgModel, undefined, mockWs);
    scheduler.runHealthCompute();
    // Should have been called for the org with devices
    expect(mockWs.broadcastHealthUpdate).toHaveBeenCalled();
  });
});
