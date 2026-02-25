import { createDatabase } from '../src/models/Database';
import { OrganizationModel } from '../src/models/Organization';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { LogSummaryService, LogAISummary } from '../src/services/LogSummaryService';
import Database from 'better-sqlite3';

describe('LogSummaryService', () => {
  let db: Database.Database;
  let logModel: LogModel;
  let service: LogSummaryService;
  const orgId = 'org1';
  const deviceId = 'dev-001';

  beforeEach(() => {
    db = createDatabase();
    const orgModel = new OrganizationModel(db);
    orgModel.create({ id: orgId, name: 'Test Org', slug: 'test-org' });

    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: deviceId, name: 'Pump A', type: 'pump', org_id: orgId });

    logModel = new LogModel(db);
    service = new LogSummaryService(logModel);
  });

  afterEach(() => {
    db.close();
  });

  function createLog(id: string, rawData: string) {
    return logModel.create({
      id,
      device_id: deviceId,
      filename: `${id}.log`,
      size: rawData.length,
      checksum: id.padEnd(64, '0'),
      raw_data: rawData,
      org_id: orgId,
    });
  }

  test('summarize counts lines correctly', () => {
    const log = createLog('log1', 'line1\nline2\nline3\nline4\nline5');
    const summary = service.summarize(log);
    expect(summary.lineCount).toBe(5);
  });

  test('summarize classifies errors, warnings, and info lines', () => {
    const rawData = [
      'ERROR: connection failed',
      'WARN: disk usage high',
      'WARNING: memory low',
      'INFO: system started',
      'DEBUG: loading config',
      'FATAL: system crash',
      'INFO: all good',
    ].join('\n');

    const log = createLog('log2', rawData);
    const summary = service.summarize(log);

    expect(summary.errorCount).toBe(2); // ERROR + FATAL
    expect(summary.warnCount).toBe(2);  // WARN + WARNING
    expect(summary.infoCount).toBe(3);  // INFO + DEBUG + INFO
  });

  test('summarize computes error rate correctly', () => {
    const rawData = [
      'ERROR: fail 1',
      'ERROR: fail 2',
      'INFO: ok',
      'INFO: ok',
    ].join('\n');

    const log = createLog('log3', rawData);
    const summary = service.summarize(log);

    expect(summary.errorRate).toBe(0.5);
  });

  test('summarize extracts top errors deduplicated by frequency', () => {
    const rawData = [
      'ERROR: Connection timeout',
      'ERROR: Connection timeout',
      'ERROR: Connection timeout',
      'ERROR: Disk full',
      'ERROR: Memory overflow',
      'ERROR: Memory overflow',
      'INFO: ok',
    ].join('\n');

    const log = createLog('log4', rawData);
    const summary = service.summarize(log);

    expect(summary.topErrors.length).toBeGreaterThanOrEqual(1);
    expect(summary.topErrors.length).toBeLessThanOrEqual(3);
    // Most frequent error should be first
    expect(summary.topErrors[0]).toContain('Connection timeout');
  });

  test('summarize extracts IP addresses', () => {
    const rawData = [
      'ERROR: Connection from 192.168.1.100 failed',
      'INFO: Listening on 10.0.0.1',
    ].join('\n');

    const log = createLog('log5', rawData);
    const summary = service.summarize(log);

    expect(summary.keywords).toContain('192.168.1.100');
    expect(summary.keywords).toContain('10.0.0.1');
  });

  test('summarize detects ISO 8601 timestamps and computes timespan', () => {
    const rawData = [
      '2024-01-15T10:00:00Z INFO: start',
      '2024-01-15T10:30:00Z INFO: mid',
      '2024-01-15T12:00:00Z INFO: end',
    ].join('\n');

    const log = createLog('log6', rawData);
    const summary = service.summarize(log);

    expect(summary.timespan).toBeDefined();
    expect(summary.timespan!.first).toContain('2024-01-15');
    expect(summary.timespan!.last).toContain('2024-01-15');
  });

  test('summarize generates a oneLiner', () => {
    const rawData = 'ERROR: timeout\nINFO: running\nINFO: ok';
    const log = createLog('log7', rawData);
    const summary = service.summarize(log);

    expect(summary.oneLiner).toContain('3 lines');
    expect(summary.oneLiner).toContain('1 errors');
    expect(summary.oneLiner).toContain('timeout');
  });

  test('summarize handles empty log', () => {
    const log = createLog('log-empty', '');
    const summary = service.summarize(log);

    expect(summary.lineCount).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.warnCount).toBe(0);
    expect(summary.errorRate).toBe(0);
  });

  test('summarize handles log with no errors', () => {
    const rawData = 'INFO: system ok\nINFO: running\nDEBUG: check';
    const log = createLog('log-clean', rawData);
    const summary = service.summarize(log);

    expect(summary.errorCount).toBe(0);
    expect(summary.warnCount).toBe(0);
    expect(summary.topErrors).toHaveLength(0);
    expect(summary.oneLiner).toContain('No errors or warnings detected');
  });

  test('summarizeAndStore persists summary to log metadata', () => {
    const log = createLog('log-store', 'ERROR: test failure\nINFO: ok');
    const summary = service.summarizeAndStore('log-store');

    expect(summary).toBeDefined();
    expect(summary!.errorCount).toBe(1);

    // Verify it's stored in metadata
    const updatedLog = logModel.getById('log-store');
    const metadata = JSON.parse(updatedLog!.metadata);
    expect(metadata.ai_summary).toBeDefined();
    expect(metadata.ai_summary.errorCount).toBe(1);
  });

  test('summarizeAndStore returns undefined for non-existent log', () => {
    const result = service.summarizeAndStore('nonexistent');
    expect(result).toBeUndefined();
  });

  test('getSummary returns stored summary', () => {
    const log = createLog('log-get', 'WARN: low disk\nINFO: ok');
    service.summarizeAndStore('log-get');

    const summary = service.getSummary('log-get');
    expect(summary).toBeDefined();
    expect(summary!.warnCount).toBe(1);
  });

  test('getSummary returns undefined when no summary stored', () => {
    createLog('log-nosummary', 'INFO: ok');
    const summary = service.getSummary('log-nosummary');
    expect(summary).toBeUndefined();
  });

  test('summarize extracts error codes', () => {
    const rawData = 'ERROR: E1234 occurred\nERROR: ERR-500 in module';
    const log = createLog('log-codes', rawData);
    const summary = service.summarize(log);

    expect(summary.keywords).toEqual(expect.arrayContaining(['E1234', 'ERR-500']));
  });

  test('summarize extracts top warnings', () => {
    const rawData = [
      'WARN: disk usage at 80%',
      'WARN: disk usage at 80%',
      'WARNING: CPU temperature high',
      'INFO: ok',
    ].join('\n');

    const log = createLog('log-warn', rawData);
    const summary = service.summarize(log);

    expect(summary.topWarnings.length).toBeGreaterThanOrEqual(1);
    expect(summary.warnCount).toBe(3);
  });
});
