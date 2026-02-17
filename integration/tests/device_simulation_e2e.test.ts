/**
 * Device Simulation E2E Tests
 *
 * Tests the full Sync-V pipeline using simulated devices:
 * - Device produces logs → Drive collects → Mobile fetches → Cloud ingests
 * - Cloud publishes firmware → Mobile downloads → Drive applies → Device updated
 * - Fleet operations with multiple devices
 * - Device offline/online transitions
 * - Data integrity verification across the entire chain
 */

import { createDatabase } from '../../backend/src/models/Database';
import { DeviceModel } from '../../backend/src/models/Device';
import { LogModel } from '../../backend/src/models/Log';
import { FirmwareModel } from '../../backend/src/models/Firmware';
import { DeviceRegistry } from '../../backend/src/services/DeviceRegistry';
import { LogIngestionService } from '../../backend/src/services/LogIngestion';
import { FirmwareDistributionService } from '../../backend/src/services/FirmwareDistribution';
import { DashboardService } from '../../backend/src/services/DashboardService';
import { DriveCommService } from '../../mobile/src/services/DriveCommService';
import { LogsService } from '../../mobile/src/services/LogsService';
import { FirmwareService } from '../../mobile/src/services/FirmwareService';
import { MetadataParserRegistry } from '../../mobile/src/parsers/MetadataParser';
import { createHash } from '../../mobile/src/utils/hash';
import { DeviceSimulator, FleetSimulator } from './device_simulator';
import Database from 'better-sqlite3';

describe('Device Simulator: Full Lifecycle', () => {
  let db: Database.Database;
  let deviceRegistry: DeviceRegistry;
  let logIngestion: LogIngestionService;
  let firmwareDistribution: FirmwareDistributionService;
  let dashboard: DashboardService;
  let driveComm: DriveCommService;
  let logsService: LogsService;
  let firmwareService: FirmwareService;
  let metadataParser: MetadataParserRegistry;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    const firmwareModel = new FirmwareModel(db);

    deviceRegistry = new DeviceRegistry(deviceModel);
    logIngestion = new LogIngestionService(logModel);
    firmwareDistribution = new FirmwareDistributionService(firmwareModel);
    dashboard = new DashboardService(deviceModel, logModel, firmwareModel);

    driveComm = new DriveCommService();
    logsService = new LogsService();
    firmwareService = new FirmwareService();
    metadataParser = new MetadataParserRegistry();
  });

  afterEach(() => {
    db.close();
  });

  test('single device: produce logs → collect → upload → ingest → verify', () => {
    // === DEVICE: Produce sensor data ===
    const device = new DeviceSimulator({
      id: 'PUMP-001',
      name: 'Main Cooling Pump',
      type: 'typeA',
      firmwareVersion: '1.0.0',
      metadata: { location: 'Building-A', floor: '3' },
    });

    const sensorLog = device.produceSensorLog({ temperature: 45.5, pressure: 2.1, rpm: 3000 });
    const errorLog = device.produceErrorLog('E101', 'Overtemperature warning');

    expect(device.getPendingLogs()).toHaveLength(2);
    expect(sensorLog.checksum).toHaveLength(64);

    // === DRIVE: Collect logs from device ===
    // Parse device metadata
    const rawMeta = device.getMetadataTypeA();
    const parsedMeta = metadataParser.parse(rawMeta, 'typeA');
    expect(parsedMeta.parseSuccessful).toBe(true);
    expect(parsedMeta.deviceId).toBe('PUMP-001');
    expect(parsedMeta.firmwareVersion).toBe('1.0.0');

    // === CLOUD: Register device ===
    const cloudDevice = deviceRegistry.register({
      id: device.getId(),
      name: 'Main Cooling Pump',
      type: 'typeA',
      status: 'online',
      firmware_version: device.getFirmwareVersion(),
      metadata: parsedMeta.fields,
    });
    expect(cloudDevice.id).toBe('PUMP-001');

    // === MOBILE: Upload logs to cloud ===
    for (const log of device.getPendingLogs()) {
      // Verify hash integrity before upload
      const recomputedHash = createHash(log.content);
      expect(recomputedHash).toBe(log.checksum);

      // Ingest into cloud
      const result = logIngestion.ingest({
        deviceId: device.getId(),
        filename: log.filename,
        size: log.size,
        checksum: log.checksum,
        rawData: log.content,
        metadata: { source: 'device_simulator' },
      });
      expect(result.success).toBe(true);
    }

    // === VERIFY: Cloud has all logs ===
    const cloudLogs = logIngestion.getLogsByDevice('PUMP-001');
    expect(cloudLogs).toHaveLength(2);

    // Verify integrity of each log in cloud
    for (const log of device.getPendingLogs()) {
      const cloudLog = cloudLogs.find(l => l.filename === log.filename);
      expect(cloudLog).toBeDefined();
      expect(logIngestion.verifyLogIntegrity(cloudLog!.id, log.checksum)).toBe(true);
    }

    // Clear device logs after collection
    device.clearCollectedLogs();
    expect(device.getPendingLogs()).toHaveLength(0);

    // === DASHBOARD: Verify aggregated data ===
    const overview = dashboard.getFleetOverview();
    expect(overview.totalDevices).toBe(1);
    expect(overview.onlineDevices).toBe(1);
    expect(overview.totalLogs).toBe(2);
  });

  test('single device: firmware update cloud → mobile → device', () => {
    const device = new DeviceSimulator({
      id: 'MOTOR-001',
      name: 'Conveyor Motor',
      type: 'typeB',
      firmwareVersion: '1.0.0',
    });

    // === CLOUD: Register device and upload firmware ===
    deviceRegistry.register({
      id: device.getId(),
      name: 'Conveyor Motor',
      type: 'typeB',
      firmware_version: '1.0.0',
    });

    const firmwareContent = 'FIRMWARE_BINARY_v2.0.0_MOTOR_TYPEB';
    const firmwareHash = createHash(firmwareContent);

    const uploadResult = firmwareDistribution.upload({
      version: '2.0.0',
      deviceType: 'typeB',
      filename: 'motor_fw_v2.0.0.bin',
      size: firmwareContent.length,
      sha256: firmwareHash,
      description: 'Motor efficiency improvement',
    });
    expect(uploadResult.success).toBe(true);

    // === MOBILE: Check for updates ===
    const latest = firmwareDistribution.getLatestForDevice('typeB');
    expect(latest).toBeDefined();
    expect(latest!.version).toBe('2.0.0');

    // Verify firmware integrity
    expect(firmwareDistribution.verifyDownload(latest!.id, firmwareHash)).toBe(true);

    // === DEVICE: Apply firmware update ===
    const applied = device.applyFirmwareUpdate('2.0.0', firmwareContent, firmwareHash);
    expect(applied).toBe(true);
    expect(device.getFirmwareVersion()).toBe('2.0.0');

    // === DEVICE: Reject firmware with tampered hash ===
    const tamperedApply = device.applyFirmwareUpdate('3.0.0', 'TAMPERED_CONTENT', firmwareHash);
    expect(tamperedApply).toBe(false);
    expect(device.getFirmwareVersion()).toBe('2.0.0'); // Unchanged
  });

  test('device metadata parsed correctly for typeA and typeB', () => {
    const typeADevice = new DeviceSimulator({
      id: 'PUMP-002',
      name: 'Backup Pump',
      type: 'typeA',
      firmwareVersion: '1.5.0',
      metadata: { rpm: '2500', temp_c: '38.2' },
    });

    const typeBDevice = new DeviceSimulator({
      id: 'SENSOR-001',
      name: 'Temp Sensor',
      type: 'typeB',
      firmwareVersion: '3.0.1',
      metadata: { zone: 'north', calibrated: 'true' },
    });

    // Parse typeA
    const metaA = metadataParser.parse(typeADevice.getMetadataTypeA(), 'typeA');
    expect(metaA.parseSuccessful).toBe(true);
    expect(metaA.deviceId).toBe('PUMP-002');
    expect(metaA.firmwareVersion).toBe('1.5.0');
    expect(metaA.fields['rpm']).toBe('2500');

    // Parse typeB
    const metaB = metadataParser.parse(typeBDevice.getMetadataTypeB(), 'typeB');
    expect(metaB.parseSuccessful).toBe(true);
    expect(metaB.deviceId).toBe('SENSOR-001');
    expect(metaB.firmwareVersion).toBe('3.0.1');
    expect(metaB.fields['zone']).toBe('north');
  });

  test('device offline/online transitions tracked correctly', () => {
    const device = new DeviceSimulator({
      id: 'VALVE-001',
      name: 'Main Valve',
      type: 'typeA',
    });

    deviceRegistry.register({
      id: device.getId(),
      name: 'Main Valve',
      type: 'typeA',
      status: 'online',
    });

    expect(device.getStatus()).toBe('online');

    // Device goes offline
    device.goOffline();
    deviceRegistry.updateStatus(device.getId(), 'offline');
    expect(device.getStatus()).toBe('offline');

    const overview1 = dashboard.getFleetOverview();
    expect(overview1.offlineDevices).toBe(1);
    expect(overview1.onlineDevices).toBe(0);

    // Device comes back online
    device.goOnline();
    deviceRegistry.updateStatus(device.getId(), 'online');
    expect(device.getStatus()).toBe('online');

    const overview2 = dashboard.getFleetOverview();
    expect(overview2.onlineDevices).toBe(1);
    expect(overview2.offlineDevices).toBe(0);
  });
});

describe('Fleet Simulator: Multi-Device Operations', () => {
  let db: Database.Database;
  let deviceRegistry: DeviceRegistry;
  let logIngestion: LogIngestionService;
  let firmwareDistribution: FirmwareDistributionService;
  let dashboard: DashboardService;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    const firmwareModel = new FirmwareModel(db);

    deviceRegistry = new DeviceRegistry(deviceModel);
    logIngestion = new LogIngestionService(logModel);
    firmwareDistribution = new FirmwareDistributionService(firmwareModel);
    dashboard = new DashboardService(deviceModel, logModel, firmwareModel);
  });

  afterEach(() => {
    db.close();
  });

  test('fleet of 5 devices produces and uploads logs', () => {
    const fleet = new FleetSimulator();
    const deviceIds = ['PUMP-001', 'PUMP-002', 'MOTOR-001', 'SENSOR-001', 'VALVE-001'];
    const deviceTypes = ['typeA', 'typeA', 'typeB', 'typeB', 'typeA'];

    // Create fleet
    deviceIds.forEach((id, i) => {
      const sim = new DeviceSimulator({
        id,
        name: `Device ${id}`,
        type: deviceTypes[i],
      });
      fleet.addDevice(sim);

      deviceRegistry.register({
        id,
        name: `Device ${id}`,
        type: deviceTypes[i],
        status: 'online',
      });
    });

    expect(fleet.getAllDevices()).toHaveLength(5);
    expect(fleet.getOnlineDevices()).toHaveLength(5);

    // All devices produce sensor data
    const allLogs = fleet.produceFleetSensorData({
      temperature: 25.0,
      humidity: 65.0,
    });
    expect(allLogs).toHaveLength(5);

    // Upload all logs to cloud
    const pending = fleet.getAllPendingLogs();
    expect(pending).toHaveLength(5);

    let totalIngested = 0;
    for (const { deviceId, logs } of pending) {
      for (const log of logs) {
        const result = logIngestion.ingest({
          deviceId,
          filename: log.filename,
          size: log.size,
          checksum: log.checksum,
          rawData: log.content,
        });
        expect(result.success).toBe(true);
        totalIngested++;
      }
    }
    expect(totalIngested).toBe(5);

    // Dashboard shows fleet status
    const overview = dashboard.getFleetOverview();
    expect(overview.totalDevices).toBe(5);
    expect(overview.onlineDevices).toBe(5);
    expect(overview.totalLogs).toBe(5);
    expect(overview.deviceTypes).toEqual(expect.arrayContaining(['typeA', 'typeB']));
  });

  test('fleet firmware rollout to devices of same type', () => {
    const fleet = new FleetSimulator();

    // Create 3 typeA pumps
    for (let i = 1; i <= 3; i++) {
      const sim = new DeviceSimulator({
        id: `PUMP-00${i}`,
        name: `Pump ${i}`,
        type: 'typeA',
        firmwareVersion: '1.0.0',
      });
      fleet.addDevice(sim);
      deviceRegistry.register({
        id: sim.getId(),
        name: `Pump ${i}`,
        type: 'typeA',
        firmware_version: '1.0.0',
      });
    }

    // Upload new firmware for typeA
    const fwContent = 'PUMP_FIRMWARE_V2_BINARY_DATA_STREAM';
    const fwHash = createHash(fwContent);

    firmwareDistribution.upload({
      version: '2.0.0',
      deviceType: 'typeA',
      filename: 'pump_fw_v2.bin',
      size: fwContent.length,
      sha256: fwHash,
    });

    // Roll out to all typeA devices
    const typeADevices = fleet.getAllDevices().filter(d => d.getState().type === 'typeA');
    expect(typeADevices).toHaveLength(3);

    for (const device of typeADevices) {
      const applied = device.applyFirmwareUpdate('2.0.0', fwContent, fwHash);
      expect(applied).toBe(true);
      expect(device.getFirmwareVersion()).toBe('2.0.0');
    }

    // Firmware status summary
    const fwStatus = dashboard.getFirmwareStatusSummary();
    expect(fwStatus.totalFirmwarePackages).toBe(1);
    expect(fwStatus.byDeviceType['typeA']).toBe(1);
  });

  test('partial fleet offline — only online devices produce logs', () => {
    const fleet = new FleetSimulator();

    const onlineDevice = new DeviceSimulator({ id: 'DEV-ON', name: 'Online', type: 'typeA' });
    const offlineDevice = new DeviceSimulator({ id: 'DEV-OFF', name: 'Offline', type: 'typeA' });

    fleet.addDevice(onlineDevice);
    fleet.addDevice(offlineDevice);

    deviceRegistry.register({ id: 'DEV-ON', name: 'Online', type: 'typeA', status: 'online' });
    deviceRegistry.register({ id: 'DEV-OFF', name: 'Offline', type: 'typeA', status: 'offline' });

    // Take one device offline
    offlineDevice.goOffline();
    expect(fleet.getOnlineDevices()).toHaveLength(1);
    expect(fleet.getOfflineDevices()).toHaveLength(1);

    // Fleet sensor production only from online devices
    const logs = fleet.produceFleetSensorData({ voltage: 12.5 });
    expect(logs).toHaveLength(1);
    expect(logs[0].filename).toContain('DEV-ON');
  });

  test('data integrity verified end-to-end across all tiers', () => {
    const device = new DeviceSimulator({
      id: 'INTEGRITY-001',
      name: 'Integrity Test Device',
      type: 'typeA',
    });

    // Device produces a log
    const log = device.produceSensorLog({ value: 42 });
    const originalChecksum = log.checksum;

    // Verify hash at device level
    expect(createHash(log.content)).toBe(originalChecksum);

    // Register device in cloud
    deviceRegistry.register({
      id: device.getId(),
      name: 'Integrity Test Device',
      type: 'typeA',
      status: 'online',
    });

    // Ingest into cloud
    const ingestResult = logIngestion.ingest({
      deviceId: device.getId(),
      filename: log.filename,
      size: log.size,
      checksum: originalChecksum,
      rawData: log.content,
    });
    expect(ingestResult.success).toBe(true);

    // Verify at cloud level
    expect(logIngestion.verifyLogIntegrity(ingestResult.logId!, originalChecksum)).toBe(true);

    // Attempt with corrupted checksum should fail
    const corruptedChecksum = 'f'.repeat(64);
    expect(logIngestion.verifyLogIntegrity(ingestResult.logId!, corruptedChecksum)).toBe(false);
  });

  test('multiple log batches from same device tracked separately', () => {
    const device = new DeviceSimulator({
      id: 'BATCH-001',
      name: 'Batch Device',
      type: 'typeA',
    });

    deviceRegistry.register({
      id: device.getId(),
      name: 'Batch Device',
      type: 'typeA',
      status: 'online',
    });

    // Batch 1: 3 logs
    for (let i = 0; i < 3; i++) {
      device.produceSensorLog({ reading: i * 10 });
    }
    expect(device.getPendingLogs()).toHaveLength(3);

    // Upload batch 1
    for (const log of device.getPendingLogs()) {
      const result = logIngestion.ingest({
        deviceId: device.getId(),
        filename: log.filename,
        size: log.size,
        checksum: log.checksum,
        rawData: log.content,
      });
      expect(result.success).toBe(true);
    }
    device.clearCollectedLogs();

    // Batch 2: 2 more logs
    for (let i = 0; i < 2; i++) {
      device.produceSensorLog({ reading: (i + 3) * 10 });
    }
    for (const log of device.getPendingLogs()) {
      const result = logIngestion.ingest({
        deviceId: device.getId(),
        filename: log.filename,
        size: log.size,
        checksum: log.checksum,
        rawData: log.content,
      });
      expect(result.success).toBe(true);
    }
    device.clearCollectedLogs();

    // Cloud should have all 5 logs
    const cloudLogs = logIngestion.getLogsByDevice(device.getId());
    expect(cloudLogs).toHaveLength(5);

    // Dashboard detail shows correct count
    const detail = dashboard.getDeviceDetail(device.getId());
    expect(detail).toBeDefined();
    expect(detail!.logCount).toBe(5);
  });
});

describe('Device Simulator: Mobile Integration', () => {
  let db: Database.Database;
  let deviceRegistry: DeviceRegistry;
  let logIngestion: LogIngestionService;
  let driveComm: DriveCommService;
  let logsService: LogsService;

  beforeEach(() => {
    db = createDatabase();
    const deviceModel = new DeviceModel(db);
    const logModel = new LogModel(db);
    const firmwareModel = new FirmwareModel(db);

    deviceRegistry = new DeviceRegistry(deviceModel);
    logIngestion = new LogIngestionService(logModel);

    driveComm = new DriveCommService();
    logsService = new LogsService();
  });

  afterEach(() => {
    db.close();
  });

  test('device logs flow through drive comm service to cloud', async () => {
    const device = new DeviceSimulator({
      id: 'FLOW-001',
      name: 'Flow Device',
      type: 'typeA',
    });

    // Device produces logs
    const log1 = device.produceSensorLog({ flow_rate: 15.5 });
    const log2 = device.produceSensorLog({ flow_rate: 16.2 });

    // Register device in cloud
    deviceRegistry.register({
      id: device.getId(),
      name: 'Flow Device',
      type: 'typeA',
      status: 'online',
    });

    // Drive makes logs available over Wi-Fi
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileList(
      device.getPendingLogs().map(l => ({ name: l.filename, size: l.size }))
    );
    for (const log of device.getPendingLogs()) {
      driveComm.setMockFileContent(log.filename, log.content);
    }
    await driveComm.discoverDrive();

    // Mobile fetches from drive
    const files = await driveComm.getFileList();
    expect(files).toHaveLength(2);

    // Mobile reads and uploads each log
    for (const file of files) {
      const content = await driveComm.getFileContent(file.name);
      expect(content.success).toBe(true);

      const checksum = createHash(content.data);
      const result = logIngestion.ingest({
        deviceId: device.getId(),
        filename: file.name,
        size: file.size,
        checksum,
        rawData: content.data,
      });
      expect(result.success).toBe(true);
    }

    // Cloud has both logs
    const cloudLogs = logIngestion.getLogsByDevice(device.getId());
    expect(cloudLogs).toHaveLength(2);
  });

  test('offline queue processes after reconnection', async () => {
    const device = new DeviceSimulator({
      id: 'QUEUE-001',
      name: 'Queue Test Device',
      type: 'typeA',
    });

    device.produceSensorLog({ temp: 20 });
    device.produceSensorLog({ temp: 21 });

    // Set up mobile logs service with cloud offline
    logsService.setMockCloudAvailable(false);
    logsService.setMockDriveLogs(
      device.getPendingLogs().map(l => ({
        filename: l.filename,
        size: l.size,
        deviceId: device.getId(),
        collectedAt: l.timestamp,
      }))
    );

    // Upload attempts go to queue
    const driveLogs = await logsService.getLogsFromDrive();
    for (const log of driveLogs) {
      const result = await logsService.uploadToCloud(log);
      expect(result.success).toBe(false);
      expect(result.status).toBe('pending');
    }
    expect(logsService.getUploadQueue()).toHaveLength(2);

    // Cloud comes back online
    logsService.setMockCloudAvailable(true);
    const queueResult = await logsService.processUploadQueue();
    expect(queueResult.successful).toBe(2);
    expect(queueResult.failed).toBe(0);
    expect(logsService.getUploadQueue()).toHaveLength(0);
  });
});
