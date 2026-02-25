import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel, LogRecord } from '../src/models/Log';
import { AnomalyModel } from '../src/models/Anomaly';
import { AnomalyDetectionService } from '../src/services/AnomalyDetectionService';
import Database from 'better-sqlite3';

describe('AnomalyDetectionService', () => {
  let db: Database.Database;
  let anomalyModel: AnomalyModel;
  let logModel: LogModel;
  let deviceModel: DeviceModel;
  let service: AnomalyDetectionService;
  const orgId = 'org1';
  const deviceId = 'dev-001';

  beforeEach(() => {
    db = createDatabase();
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org' });

    deviceModel = new DeviceModel(db);
    logModel = new LogModel(db);
    anomalyModel = new AnomalyModel(db);
    service = new AnomalyDetectionService(anomalyModel, logModel, deviceModel);

    deviceModel.register({ id: deviceId, name: 'Pump A', type: 'pump', org_id: orgId });
  });

  afterEach(() => {
    db.close();
  });

  function createLog(id: string, rawData: string, devId?: string): LogRecord {
    return logModel.create({
      id,
      device_id: devId || deviceId,
      filename: `${id}.log`,
      size: rawData.length,
      checksum: id.padEnd(64, '0'),
      raw_data: rawData,
      org_id: orgId,
    });
  }

  test('analyzeLog detects error_spike when error rate exceeds 2x historical average', () => {
    // Create historical logs with low error rate (~10%)
    for (let i = 0; i < 5; i++) {
      createLog(`hist-${i}`, 'INFO: system ok\nINFO: running\nINFO: check\nINFO: ok\nINFO: fine\nINFO: good\nINFO: done\nINFO: ready\nINFO: idle\nERROR: minor issue');
    }

    // New log with high error rate (60%)
    const newLog = createLog('new-log', 'ERROR: crash\nERROR: failure\nERROR: timeout\nINFO: trying\nERROR: disk full\nERROR: overload\nINFO: restarting\nERROR: out of memory\nINFO: ok\nINFO: done');
    const anomalies = service.analyzeLog(newLog);

    const spikes = anomalies.filter(a => a.type === 'error_spike');
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    expect(spikes[0].severity).toBeDefined();
    expect(spikes[0].message).toContain('Error rate');
    expect(spikes[0].device_id).toBe(deviceId);
    expect(spikes[0].org_id).toBe(orgId);
  });

  test('analyzeLog detects new_pattern for previously unseen errors', () => {
    // Create historical logs with known error patterns
    for (let i = 0; i < 3; i++) {
      createLog(`hist-${i}`, 'ERROR: Connection timeout\nINFO: running\nINFO: ok');
    }

    // New log with novel error pattern
    const newLog = createLog('new-log', 'ERROR: Disk corruption detected\nINFO: running');
    const anomalies = service.analyzeLog(newLog);

    const newPatterns = anomalies.filter(a => a.type === 'new_pattern');
    expect(newPatterns.length).toBeGreaterThanOrEqual(1);
    expect(newPatterns[0].message).toContain('new error pattern');
  });

  test('analyzeLog returns empty array for clean logs', () => {
    // Historical logs with no errors
    for (let i = 0; i < 3; i++) {
      createLog(`hist-${i}`, 'INFO: system ok\nINFO: running\nINFO: check complete');
    }

    // New clean log
    const newLog = createLog('clean-log', 'INFO: system starting\nINFO: all good\nINFO: check done');
    const anomalies = service.analyzeLog(newLog);

    const spikes = anomalies.filter(a => a.type === 'error_spike');
    expect(spikes).toHaveLength(0);
  });

  test('analyzeLog returns empty for first log (no historical data)', () => {
    const firstLog = createLog('first', 'ERROR: something wrong\nERROR: another issue');
    const anomalies = service.analyzeLog(firstLog);

    // No error_spike since no historical data to compare
    const spikes = anomalies.filter(a => a.type === 'error_spike');
    expect(spikes).toHaveLength(0);
  });

  test('checkDeviceSilence detects silent devices', () => {
    // Create logs with consistent 1-hour intervals, but the most recent one is very old
    // This simulates a device that used to report hourly but stopped
    const now = Date.now();

    // 4 logs at 1h intervals, all old (starting 100h ago)
    for (let i = 0; i < 4; i++) {
      const uploadedAt = new Date(now - (100 - i) * 3600000).toISOString();
      db.prepare(`
        INSERT INTO logs (id, device_id, filename, size, checksum, raw_data, org_id, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`log-${i}`, deviceId, `log-${i}.txt`, 10, `${i}`.padEnd(64, 'a'), 'INFO: ok', orgId, uploadedAt);
    }

    // Last log was 97 hours ago — average interval is 1h, so timeSinceLastLog (~97h) >> 3h
    const anomalies = service.checkDeviceSilence(orgId);
    const silentAnomalies = anomalies.filter(a => a.type === 'device_silent');
    expect(silentAnomalies.length).toBeGreaterThanOrEqual(1);
    expect(silentAnomalies[0].severity).toBe('high');
  });

  test('getAnomalies returns anomalies for org', () => {
    anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'error_spike',
      severity: 'high',
      message: 'Test anomaly',
    });

    const anomalies = service.getAnomalies(orgId);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('error_spike');
  });

  test('getDeviceAnomalies returns anomalies for device', () => {
    anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'new_pattern',
      severity: 'medium',
      message: 'New pattern found',
    });

    const anomalies = service.getDeviceAnomalies(deviceId);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].device_id).toBe(deviceId);
  });

  test('getUnresolved returns only unresolved anomalies', () => {
    const a1 = anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'error_spike',
      severity: 'high',
      message: 'Anomaly 1',
    });
    anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'new_pattern',
      severity: 'low',
      message: 'Anomaly 2',
    });

    anomalyModel.resolve(a1.id);

    const unresolved = service.getUnresolved(orgId);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].message).toBe('Anomaly 2');
  });

  test('resolveAnomaly marks it as resolved', () => {
    const anomaly = anomalyModel.create({
      device_id: deviceId,
      org_id: orgId,
      type: 'error_spike',
      severity: 'high',
      message: 'To be resolved',
    });

    const result = service.resolveAnomaly(anomaly.id);
    expect(result).toBe(true);

    const updated = anomalyModel.getById(anomaly.id);
    expect(updated?.resolved).toBe(1);
  });

  test('resolveAnomaly returns false for non-existent id', () => {
    const result = service.resolveAnomaly('nonexistent');
    expect(result).toBe(false);
  });
});
