/**
 * Failure Simulation Tests
 *
 * Tests system resilience under adverse conditions:
 * - Network loss mid-transfer
 * - Corrupted file detection
 * - Service degradation handling
 */

import { DriveCommService, DriveConnectionError } from '../../mobile/src/services/DriveCommService';
import { LogsService } from '../../mobile/src/services/LogsService';
import { FirmwareService } from '../../mobile/src/services/FirmwareService';
import { NetworkService } from '../../mobile/src/services/NetworkService';
import { createDatabase } from '../../backend/src/models/Database';
import { LogModel } from '../../backend/src/models/Log';
import { DeviceModel } from '../../backend/src/models/Device';
import { LogIngestionService } from '../../backend/src/services/LogIngestion';
import Database from 'better-sqlite3';

describe('Failure Simulation: Network Loss', () => {
  test('network loss during file fetch from drive', async () => {
    const driveComm = new DriveCommService();
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileList([{ name: 'log.txt', size: 1024 }]);
    await driveComm.discoverDrive();

    // Connection works initially
    const files = await driveComm.getFileList();
    expect(files).toHaveLength(1);

    // Network drops
    driveComm.simulateConnectionLoss();

    await expect(driveComm.getFileList()).rejects.toThrow(DriveConnectionError);
    await expect(driveComm.getFileContent('log.txt')).rejects.toThrow(DriveConnectionError);
    await expect(driveComm.sendFirmware('fw.bin', 'data')).rejects.toThrow(DriveConnectionError);
  });

  test('network loss during log upload queues for retry', async () => {
    const logsService = new LogsService();
    const network = new NetworkService();

    // Start online
    network.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: false,
      isCloudReachable: true,
    });
    logsService.setMockCloudAvailable(true);

    // Upload one log successfully
    const result1 = await logsService.uploadToCloud({
      filename: 'log1.txt',
      size: 1024,
      deviceId: 'DEV001',
      collectedAt: '2026-01-01T00:00:00Z',
    });
    expect(result1.success).toBe(true);

    // Network drops
    network.setNetworkState({
      isConnected: false,
      connectionType: 'none',
      isDriveReachable: false,
      isCloudReachable: false,
    });
    logsService.setMockCloudAvailable(false);

    // Next upload should queue
    const result2 = await logsService.uploadToCloud({
      filename: 'log2.txt',
      size: 2048,
      deviceId: 'DEV001',
      collectedAt: '2026-01-02T00:00:00Z',
    });
    expect(result2.success).toBe(false);
    expect(result2.status).toBe('pending');

    // Queue should have one entry
    expect(logsService.getUploadQueue()).toHaveLength(1);

    // Reconnect and process
    logsService.setMockCloudAvailable(true);
    const queueResult = await logsService.processUploadQueue();
    expect(queueResult.successful).toBe(1);
  });

  test('timeout during drive communication', async () => {
    const driveComm = new DriveCommService();
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setTimeoutMs(50);
    await driveComm.discoverDrive();

    driveComm.simulateTimeout();

    await expect(driveComm.getFileList()).rejects.toThrow('timed out');
  });
});

describe('Failure Simulation: Corrupted File Detection', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Test', type: 'typeA' });
  });

  afterEach(() => {
    db.close();
  });

  test('cloud rejects log with invalid checksum format', () => {
    const logModel = new LogModel(db);
    const service = new LogIngestionService(logModel);

    const result = service.ingest({
      deviceId: 'DEV001',
      filename: 'corrupted.txt',
      size: 100,
      checksum: 'not-a-valid-sha256',
      rawData: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('checksum');
  });

  test('cloud rejects zero-size upload (empty/truncated file)', () => {
    const logModel = new LogModel(db);
    const service = new LogIngestionService(logModel);

    const result = service.ingest({
      deviceId: 'DEV001',
      filename: 'empty.txt',
      size: 0,
      checksum: 'a'.repeat(64),
      rawData: '',
    });

    expect(result.success).toBe(false);
  });

  test('firmware integrity verification rejects tampered data', () => {
    const fwService = new FirmwareService();

    // Correct hash for empty string
    const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(fwService.verifyIntegrity('', validHash)).toBe(true);

    // Tampered data should fail
    expect(fwService.verifyIntegrity('tampered', validHash)).toBe(false);
  });
});

describe('Failure Simulation: Service Degradation', () => {
  test('firmware download failure is handled gracefully', async () => {
    const fwService = new FirmwareService();
    fwService.setMockDownloadShouldFail(true);

    const result = await fwService.downloadFirmware({
      id: 'fw-001',
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'fw.bin',
      size: 10240,
      sha256: 'a'.repeat(64),
      releaseDate: '2026-01-01',
      description: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('drive transfer failure when drive disconnected', async () => {
    const fwService = new FirmwareService();
    fwService.setMockDriveConnected(false);

    const result = await fwService.transferToDrive('fw.bin', 'data');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  test('multiple queued uploads survive reconnection', async () => {
    const logsService = new LogsService();
    logsService.setMockCloudAvailable(false);

    // Queue 5 logs while offline
    for (let i = 0; i < 5; i++) {
      await logsService.uploadToCloud({
        filename: `log_${i}.txt`,
        size: 1024 * (i + 1),
        deviceId: 'DEV001',
        collectedAt: new Date().toISOString(),
      });
    }

    expect(logsService.getUploadQueue()).toHaveLength(5);

    // Reconnect
    logsService.setMockCloudAvailable(true);
    const result = await logsService.processUploadQueue();

    expect(result.successful).toBe(5);
    expect(result.failed).toBe(0);
    expect(logsService.getUploadQueue()).toHaveLength(0);
  });
});
