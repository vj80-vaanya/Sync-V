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
    expect(logs[0].raw_path).toContain('DEV001');
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
});
