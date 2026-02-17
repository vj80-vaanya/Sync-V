/**
 * End-to-End Integration Tests
 *
 * Tests the full pipeline:
 * - Firmware: Cloud -> Mobile -> Drive
 * - Logs: Drive -> Mobile -> Cloud
 */

import { createDatabase } from '../../backend/src/models/Database';
import { FirmwareModel } from '../../backend/src/models/Firmware';
import { FirmwareDistributionService } from '../../backend/src/services/FirmwareDistribution';
import { DeviceModel } from '../../backend/src/models/Device';
import { LogModel } from '../../backend/src/models/Log';
import { LogIngestionService } from '../../backend/src/services/LogIngestion';
import { FirmwareService } from '../../mobile/src/services/FirmwareService';
import { DriveCommService } from '../../mobile/src/services/DriveCommService';
import { LogsService } from '../../mobile/src/services/LogsService';
import Database from 'better-sqlite3';

describe('End-to-End: Firmware Update Pipeline', () => {
  let db: Database.Database;
  let cloudFwService: FirmwareDistributionService;
  let mobileFwService: FirmwareService;
  let driveComm: DriveCommService;

  beforeEach(() => {
    db = createDatabase();
    const fwModel = new FirmwareModel(db);
    cloudFwService = new FirmwareDistributionService(fwModel);
    mobileFwService = new FirmwareService();
    driveComm = new DriveCommService();
  });

  afterEach(() => {
    db.close();
  });

  test('full firmware update: cloud -> mobile -> drive', async () => {
    // 1. Admin uploads firmware to cloud
    const uploadResult = cloudFwService.upload({
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'fw_typeA_v2.0.0.bin',
      size: 10240,
      sha256: 'a'.repeat(64),
      description: 'Critical security patch',
    });
    expect(uploadResult.success).toBe(true);

    // 2. Mobile checks cloud for available updates
    const cloudFirmware = cloudFwService.getAvailableForDevice('typeA');
    expect(cloudFirmware).toHaveLength(1);

    mobileFwService.setMockAvailableFirmware(cloudFirmware.map(fw => ({
      id: fw.id,
      version: fw.version,
      deviceType: fw.device_type,
      filename: fw.filename,
      size: fw.size,
      sha256: fw.sha256,
      releaseDate: fw.release_date,
      description: fw.description,
    })));
    mobileFwService.setMockDownloadData('FIRMWARE_BINARY_CONTENT');

    const available = await mobileFwService.checkForUpdates('typeA', '1.0.0');
    expect(available).toHaveLength(1);
    expect(available[0].version).toBe('2.0.0');

    // 3. Mobile downloads firmware
    const downloadResult = await mobileFwService.downloadFirmware(available[0]);
    expect(downloadResult.success).toBe(true);

    // 4. Mobile transfers firmware to drive
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    const sent = await driveComm.sendFirmware(
      available[0].filename,
      'FIRMWARE_BINARY_CONTENT'
    );
    expect(sent).toBe(true);
  });
});

describe('End-to-End: Log Collection Pipeline', () => {
  let db: Database.Database;
  let cloudLogService: LogIngestionService;
  let mobileLogService: LogsService;
  let driveComm: DriveCommService;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    deviceModel.register({ id: 'DEV001', name: 'Pump A', type: 'typeA' });

    const logModel = new LogModel(db);
    cloudLogService = new LogIngestionService(logModel);
    mobileLogService = new LogsService();
    driveComm = new DriveCommService();
  });

  afterEach(() => {
    db.close();
  });

  test('full log collection: drive -> mobile -> cloud', async () => {
    // 1. Drive has collected logs (simulated via DriveComm)
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileList([
      { name: 'sensor_log_jan.txt', size: 2048 },
      { name: 'error_log_jan.txt', size: 512 },
    ]);
    driveComm.setMockFileContent('sensor_log_jan.txt', 'sensor data readings...');
    driveComm.setMockFileContent('error_log_jan.txt', 'error events...');
    await driveComm.discoverDrive();

    // 2. Mobile fetches file list from drive
    const files = await driveComm.getFileList();
    expect(files).toHaveLength(2);

    // 3. Mobile reads log content from drive
    const logContent = await driveComm.getFileContent('sensor_log_jan.txt');
    expect(logContent.success).toBe(true);

    // 4. Mobile uploads to cloud
    mobileLogService.setMockCloudAvailable(true);
    mobileLogService.setMockDriveLogs(files.map(f => ({
      filename: f.name,
      size: f.size,
      deviceId: 'DEV001',
      collectedAt: new Date().toISOString(),
    })));

    const logs = await mobileLogService.getLogsFromDrive();
    for (const log of logs) {
      const uploadResult = await mobileLogService.uploadToCloud(log);
      expect(uploadResult.success).toBe(true);
    }

    // 5. Cloud ingests the log
    const ingestResult = cloudLogService.ingest({
      deviceId: 'DEV001',
      filename: 'sensor_log_jan.txt',
      size: 2048,
      checksum: 'a'.repeat(64),
      rawData: logContent.data,
      metadata: { source: 'pump_sensor', format: 'text' },
    });
    expect(ingestResult.success).toBe(true);

    // 6. Cloud can query the log
    const deviceLogs = cloudLogService.getLogsByDevice('DEV001');
    expect(deviceLogs).toHaveLength(1);
    expect(deviceLogs[0].filename).toBe('sensor_log_jan.txt');
  });
});
