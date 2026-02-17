import { LogsService } from '../src/services/LogsService';
import { DriveCommService, DriveConnectionError } from '../src/services/DriveCommService';
import { parseTypeB, MetadataParserRegistry } from '../src/parsers/MetadataParser';
import { LogFile } from '../src/types/Log';

describe('LogsService - queue processing edge cases', () => {
  let service: LogsService;
  const mockLog: LogFile = {
    filename: 'sensor.csv',
    size: 1024,
    deviceId: 'DEV001',
    collectedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    service = new LogsService();
  });

  test('retries queued items when cloud is still unavailable', async () => {
    // Queue items with cloud offline
    service.setMockCloudAvailable(false);
    await service.uploadToCloud(mockLog);
    await service.uploadToCloud({
      ...mockLog,
      filename: 'sensor2.csv',
    });

    expect(service.getUploadQueue()).toHaveLength(2);

    // Process with cloud still offline — items should be retried (attempts incremented)
    const result = await service.processUploadQueue();
    expect(result.successful).toBe(0);
    expect(result.retrying).toBe(2);
    expect(result.failed).toBe(0);

    // Queue should still have items (retrying)
    expect(service.getUploadQueue()).toHaveLength(2);
  });

  test('fails items that exceed max attempts', async () => {
    service.setMockCloudAvailable(false);
    await service.uploadToCloud(mockLog);

    // Process 3 times (maxAttempts = 3) — cloud stays offline
    await service.processUploadQueue(); // attempt 1 → retrying
    await service.processUploadQueue(); // attempt 2 → retrying
    const result = await service.processUploadQueue(); // attempt 3 → failed

    expect(result.failed).toBe(1);
    expect(result.retrying).toBe(0);
    expect(service.getUploadQueue()).toHaveLength(0);
    expect(service.getLogStatus(mockLog.filename)).toBe('failed');
  });

  test('mixed retry and fail when items have different attempt counts', async () => {
    service.setMockCloudAvailable(false);
    await service.uploadToCloud(mockLog);

    // Process twice — first item at attempt 2
    await service.processUploadQueue();
    await service.processUploadQueue();

    // Add a new item (at attempt 0)
    await service.uploadToCloud({
      ...mockLog,
      filename: 'new_sensor.csv',
    });

    // Process again — first item should fail (attempt 3), new item should retry (attempt 1)
    const result = await service.processUploadQueue();
    expect(result.failed).toBe(1);
    expect(result.retrying).toBe(1);
    expect(service.getLogStatus(mockLog.filename)).toBe('failed');
  });
});

describe('DriveCommService - error paths', () => {
  let driveComm: DriveCommService;

  beforeEach(() => {
    driveComm = new DriveCommService();
  });

  test('getFileContent returns failure for file not found', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    // No mock file content set for 'missing.txt'
    const result = await driveComm.getFileContent('missing.txt');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('File not found');
  });

  test('throws DriveConnectionError when not connected', async () => {
    // Never call discoverDrive — not connected
    await expect(driveComm.getFileList()).rejects.toThrow(DriveConnectionError);
    await expect(driveComm.getFileList()).rejects.toThrow('Not connected to drive');
  });

  test('throws DriveConnectionError on sendFirmware when not connected', async () => {
    await expect(driveComm.sendFirmware('fw.bin', 'data')).rejects.toThrow(DriveConnectionError);
  });

  test('throws on getFileContent when connection lost', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();
    driveComm.simulateConnectionLoss();

    await expect(driveComm.getFileContent('any.txt')).rejects.toThrow('Connection to drive lost');
  });

  test('throws on sendFirmware when timed out', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();
    driveComm.simulateTimeout();

    await expect(driveComm.sendFirmware('fw.bin', 'data')).rejects.toThrow('Connection timed out');
  });
});

describe('MetadataParser - parseTypeB edge cases', () => {
  test('returns unsuccessful for non-object JSON (array)', () => {
    const result = parseTypeB('[1, 2, 3]');
    expect(result.parseSuccessful).toBe(false);
  });

  test('returns unsuccessful for JSON null', () => {
    const result = parseTypeB('null');
    expect(result.parseSuccessful).toBe(false);
  });

  test('returns unsuccessful for JSON number', () => {
    const result = parseTypeB('42');
    expect(result.parseSuccessful).toBe(false);
  });

  test('returns unsuccessful for JSON string', () => {
    const result = parseTypeB('"just a string"');
    expect(result.parseSuccessful).toBe(false);
  });

  test('parses object with no id as unsuccessful', () => {
    const result = parseTypeB('{"fw":"1.0","temp":"25"}');
    expect(result.parseSuccessful).toBe(false);
    expect(result.firmwareVersion).toBe('1.0');
    expect(result.fields['temp']).toBe('25');
  });
});
