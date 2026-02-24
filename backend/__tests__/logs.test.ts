import { createDatabase } from '../src/models/Database';
import { DeviceModel } from '../src/models/Device';
import { LogModel } from '../src/models/Log';
import { LogIngestionService } from '../src/services/LogIngestion';
import Database from 'better-sqlite3';

describe('Log Ingestion', () => {
  let db: Database.Database;
  let logService: LogIngestionService;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Test Device', type: 'typeA' });

    const logModel = new LogModel(db);
    logService = new LogIngestionService(logModel);
  });

  afterEach(() => {
    db.close();
  });

  test('receives and stores a log upload', () => {
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'log_2026_01_01.txt',
      size: 1024,
      checksum: 'a'.repeat(64),
      rawData: 'encrypted log data here',
      metadata: { format: 'text', source: 'sensor_array' },
    });

    expect(result.success).toBe(true);
    expect(result.logId).toBeTruthy();
  });

  test('stores raw logs and checksums separately', () => {
    const checksum = 'b'.repeat(64);
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'data.bin',
      size: 2048,
      checksum,
      rawData: 'raw binary data',
    });

    const logs = logService.getLogsByDevice('DEV001');
    expect(logs).toHaveLength(1);
    expect(logs[0].checksum).toBe(checksum);
  });

  test('indexes metadata for future queries', () => {
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'sensor.csv',
      size: 512,
      checksum: 'c'.repeat(64),
      rawData: 'sensor data',
      metadata: { sensor_type: 'temperature', unit: 'celsius' },
    });

    const logs = logService.getLogsByDevice('DEV001');
    const meta = JSON.parse(logs[0].metadata);
    expect(meta.sensor_type).toBe('temperature');
    expect(meta.unit).toBe('celsius');
  });

  test('rejects invalid checksum format', () => {
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'bad.txt',
      size: 100,
      checksum: 'too-short',
      rawData: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('checksum');
  });

  test('rejects zero-size upload', () => {
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'empty.txt',
      size: 0,
      checksum: 'd'.repeat(64),
      rawData: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('size');
  });

  test('rejects duplicate uploads (same checksum)', () => {
    const checksum = 'e'.repeat(64);
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'log1.txt',
      size: 100,
      checksum,
      rawData: 'data',
    });

    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'log1_copy.txt',
      size: 100,
      checksum,
      rawData: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  test('verifies log integrity', () => {
    const checksum = 'f'.repeat(64);
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'verified.txt',
      size: 100,
      checksum,
      rawData: 'data',
    });

    expect(logService.verifyLogIntegrity(result.logId!, checksum)).toBe(true);
    expect(logService.verifyLogIntegrity(result.logId!, 'wrong')).toBe(false);
  });

  test('stores and retrieves vendor field', () => {
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'siemens.log',
      size: 100,
      checksum: '1'.repeat(64),
      rawData: 'siemens data',
      vendor: 'Siemens',
    });

    const log = logService.getLogById(logService.getAllLogs()[0].id);
    expect(log!.vendor).toBe('Siemens');
  });

  test('stores and retrieves format field', () => {
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'data.json',
      size: 100,
      checksum: '2'.repeat(64),
      rawData: '{"key":"value"}',
      format: 'json',
    });

    const log = logService.getLogById(logService.getAllLogs()[0].id);
    expect(log!.format).toBe('json');
  });

  test('stores and retrieves raw_data content', () => {
    const content = 'This is the actual log content\nLine 2\nLine 3';
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'content.log',
      size: content.length,
      checksum: '3'.repeat(64),
      rawData: content,
    });

    const log = logService.getLogById(logService.getAllLogs()[0].id);
    expect(log!.raw_data).toBe(content);
  });

  test('summary queries exclude raw_data', () => {
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'summary-test.log',
      size: 100,
      checksum: '4'.repeat(64),
      rawData: 'should not appear in summary',
      vendor: 'ABB',
      format: 'csv',
    });

    const allSummary = logService.getAllLogs();
    expect(allSummary).toHaveLength(1);
    expect((allSummary[0] as any).raw_data).toBeUndefined();
    expect(allSummary[0].vendor).toBe('ABB');
    expect(allSummary[0].format).toBe('csv');

    const deviceSummary = logService.getLogsByDevice('DEV001');
    expect(deviceSummary).toHaveLength(1);
    expect((deviceSummary[0] as any).raw_data).toBeUndefined();
  });

  test('defaults vendor to unknown and format to text', () => {
    logService.ingest({
      deviceId: 'DEV001',
      filename: 'defaults.log',
      size: 50,
      checksum: '5'.repeat(64),
      rawData: 'data',
    });

    const log = logService.getLogById(logService.getAllLogs()[0].id);
    expect(log!.vendor).toBe('unknown');
    expect(log!.format).toBe('text');
  });

  test('rejects invalid vendor name', () => {
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'bad-vendor.log',
      size: 100,
      checksum: '6'.repeat(64),
      rawData: 'data',
      vendor: 'vendor<script>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('vendor');
  });

  test('rejects invalid format', () => {
    const result = logService.ingest({
      deviceId: 'DEV001',
      filename: 'bad-format.log',
      size: 100,
      checksum: '7'.repeat(64),
      rawData: 'data',
      format: 'pdf',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('format');
  });

  test('getDistinctVendors returns unique vendors', () => {
    logService.ingest({ deviceId: 'DEV001', filename: 'a.log', size: 10, checksum: '8'.repeat(64), rawData: 'd', vendor: 'Siemens' });
    logService.ingest({ deviceId: 'DEV001', filename: 'b.log', size: 10, checksum: '9'.repeat(64), rawData: 'd', vendor: 'ABB' });
    logService.ingest({ deviceId: 'DEV001', filename: 'c.log', size: 10, checksum: 'a1'.padEnd(64, '0'), rawData: 'd', vendor: 'Siemens' });

    const vendors = logService.getDistinctVendors();
    expect(vendors).toContain('ABB');
    expect(vendors).toContain('Siemens');
    expect(vendors.length).toBe(2);
  });

  test('getDistinctFormats returns unique formats', () => {
    logService.ingest({ deviceId: 'DEV001', filename: 'd.log', size: 10, checksum: 'b1'.padEnd(64, '0'), rawData: 'd', format: 'json' });
    logService.ingest({ deviceId: 'DEV001', filename: 'e.log', size: 10, checksum: 'c1'.padEnd(64, '0'), rawData: 'd', format: 'csv' });
    logService.ingest({ deviceId: 'DEV001', filename: 'f.log', size: 10, checksum: 'd1'.padEnd(64, '0'), rawData: 'd', format: 'json' });

    const formats = logService.getDistinctFormats();
    expect(formats).toContain('csv');
    expect(formats).toContain('json');
    expect(formats.length).toBe(2);
  });
});
