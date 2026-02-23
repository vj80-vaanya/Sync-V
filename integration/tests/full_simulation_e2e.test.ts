/**
 * Full Fleet E2E Simulation Test
 *
 * A realistic simulation of a 4-device fleet operating over time.
 * State accumulates across 7 phases — logs from Phase 2 remain in the
 * cloud DB when Phase 6 checks the dashboard. Exercises all three tiers
 * (Drive simulator, Mobile services, Cloud backend) in sequence.
 *
 * 7 phases, 18 tests, single beforeAll/afterAll (no per-test reset).
 */

import { createDatabase } from '../../backend/src/models/Database';
import { DeviceModel } from '../../backend/src/models/Device';
import { LogModel } from '../../backend/src/models/Log';
import { FirmwareModel } from '../../backend/src/models/Firmware';
import { DeviceRegistry } from '../../backend/src/services/DeviceRegistry';
import { LogIngestionService } from '../../backend/src/services/LogIngestion';
import { FirmwareDistributionService } from '../../backend/src/services/FirmwareDistribution';
import { DashboardService } from '../../backend/src/services/DashboardService';
import { DriveCommService, DriveConnectionError } from '../../mobile/src/services/DriveCommService';
import { LogsService } from '../../mobile/src/services/LogsService';
import { FirmwareService } from '../../mobile/src/services/FirmwareService';
import { NetworkService } from '../../mobile/src/services/NetworkService';
import { MetadataParserRegistry } from '../../mobile/src/parsers/MetadataParser';
import { FirmwareProgress } from '../../mobile/src/types/Firmware';
import { createHash } from '../../mobile/src/utils/hash';
import { DeviceSimulator, FleetSimulator, SimulatedLog } from './device_simulator';
import Database from 'better-sqlite3';

describe('Full Fleet Simulation: End-to-End Pipeline', () => {
  // ── Cloud tier ──
  let db: Database.Database;
  let deviceModel: DeviceModel;
  let logModel: LogModel;
  let firmwareModel: FirmwareModel;
  let deviceRegistry: DeviceRegistry;
  let logIngestion: LogIngestionService;
  let firmwareDistribution: FirmwareDistributionService;
  let dashboard: DashboardService;

  // ── Mobile tier ──
  let driveComm: DriveCommService;
  let logsService: LogsService;
  let firmwareService: FirmwareService;
  let network: NetworkService;
  let metadataParser: MetadataParserRegistry;

  // ── Drive tier ──
  let fleet: FleetSimulator;
  let pumpA: DeviceSimulator;
  let pumpB: DeviceSimulator;
  let motorA: DeviceSimulator;
  let sensorA: DeviceSimulator;

  // ── Cross-phase state ──
  let typeAFirmwareId: string;
  let typeBFirmwareId: string;
  let typeAFirmwareContent: string;
  let typeAFirmwareHash: string;
  let typeBFirmwareContent: string;
  let typeBFirmwareHash: string;
  const allSimulatedLogs: { deviceId: string; log: SimulatedLog }[] = [];
  const progressEvents: FirmwareProgress[] = [];

  beforeAll(() => {
    // Cloud tier
    db = createDatabase();
    deviceModel = new DeviceModel(db);
    logModel = new LogModel(db);
    firmwareModel = new FirmwareModel(db);
    deviceRegistry = new DeviceRegistry(deviceModel);
    logIngestion = new LogIngestionService(logModel);
    firmwareDistribution = new FirmwareDistributionService(firmwareModel);
    dashboard = new DashboardService(deviceModel, logModel, firmwareModel);

    // Mobile tier
    driveComm = new DriveCommService();
    logsService = new LogsService();
    firmwareService = new FirmwareService();
    network = new NetworkService();
    metadataParser = new MetadataParserRegistry();

    // Drive tier — 4-device fleet
    fleet = new FleetSimulator();

    pumpA = new DeviceSimulator({
      id: 'PUMP-001',
      name: 'Primary Cooling Pump',
      type: 'typeA',
      firmwareVersion: '1.0.0',
      metadata: { location: 'Building-A', floor: '3' },
    });

    pumpB = new DeviceSimulator({
      id: 'PUMP-002',
      name: 'Secondary Cooling Pump',
      type: 'typeA',
      firmwareVersion: '1.0.0',
      metadata: { location: 'Building-A', floor: '2' },
    });

    motorA = new DeviceSimulator({
      id: 'MOTOR-001',
      name: 'Conveyor Motor',
      type: 'typeB',
      firmwareVersion: '1.0.0',
      metadata: { zone: 'east', calibrated: 'true' },
    });

    sensorA = new DeviceSimulator({
      id: 'SENSOR-001',
      name: 'Temperature Sensor',
      type: 'typeB',
      firmwareVersion: '1.0.0',
      metadata: { zone: 'north', calibrated: 'false' },
    });

    fleet.addDevice(pumpA);
    fleet.addDevice(pumpB);
    fleet.addDevice(motorA);
    fleet.addDevice(sensorA);
  });

  afterAll(() => {
    db.close();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 1: System Bootstrap
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 1: System Bootstrap', () => {
    test('devices created and metadata parsed correctly', () => {
      expect(fleet.getAllDevices()).toHaveLength(4);
      expect(fleet.getOnlineDevices()).toHaveLength(4);

      // Parse typeA metadata (PUMP-001, PUMP-002)
      const metaA1 = metadataParser.parse(pumpA.getMetadataTypeA(), 'typeA');
      expect(metaA1.parseSuccessful).toBe(true);
      expect(metaA1.deviceId).toBe('PUMP-001');
      expect(metaA1.firmwareVersion).toBe('1.0.0');
      expect(metaA1.fields['location']).toBe('Building-A');

      const metaA2 = metadataParser.parse(pumpB.getMetadataTypeA(), 'typeA');
      expect(metaA2.parseSuccessful).toBe(true);
      expect(metaA2.deviceId).toBe('PUMP-002');

      // Parse typeB metadata (MOTOR-001, SENSOR-001)
      const metaB1 = metadataParser.parse(motorA.getMetadataTypeB(), 'typeB');
      expect(metaB1.parseSuccessful).toBe(true);
      expect(metaB1.deviceId).toBe('MOTOR-001');

      const metaB2 = metadataParser.parse(sensorA.getMetadataTypeB(), 'typeB');
      expect(metaB2.parseSuccessful).toBe(true);
      expect(metaB2.deviceId).toBe('SENSOR-001');

      // Register all devices in cloud
      for (const device of fleet.getAllDevices()) {
        const state = device.getState();
        const parsedMeta = state.type === 'typeA'
          ? metadataParser.parse(device.getMetadataTypeA(), 'typeA')
          : metadataParser.parse(device.getMetadataTypeB(), 'typeB');

        deviceRegistry.register({
          id: device.getId(),
          name: state.name,
          type: state.type,
          status: 'online',
          firmware_version: device.getFirmwareVersion(),
          metadata: parsedMeta.fields,
        });
      }
    });

    test('dashboard shows 4 devices, 0 logs, 0 firmware', () => {
      const overview = dashboard.getFleetOverview();
      expect(overview.totalDevices).toBe(4);
      expect(overview.onlineDevices).toBe(4);
      expect(overview.offlineDevices).toBe(0);
      expect(overview.totalLogs).toBe(0);
      expect(overview.deviceTypes).toEqual(expect.arrayContaining(['typeA', 'typeB']));

      const fwSummary = dashboard.getFirmwareStatusSummary();
      expect(fwSummary.totalFirmwarePackages).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 2: Log Collection Pipeline
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 2: Log Collection Pipeline', () => {
    test('devices produce 7 logs and drive exposes them', () => {
      // PUMP-001: 2 sensor + 1 error = 3
      allSimulatedLogs.push(
        { deviceId: 'PUMP-001', log: pumpA.produceSensorLog({ temperature: 45.5, pressure: 2.1 }) },
        { deviceId: 'PUMP-001', log: pumpA.produceSensorLog({ temperature: 46.2, pressure: 2.3 }) },
        { deviceId: 'PUMP-001', log: pumpA.produceErrorLog('E101', 'Overtemperature warning') },
      );

      // PUMP-002: 1 sensor = 1
      allSimulatedLogs.push(
        { deviceId: 'PUMP-002', log: pumpB.produceSensorLog({ temperature: 38.0, pressure: 1.9 }) },
      );

      // MOTOR-001: 1 sensor + 1 error = 2
      allSimulatedLogs.push(
        { deviceId: 'MOTOR-001', log: motorA.produceSensorLog({ rpm: 3000, vibration: 0.02 }) },
        { deviceId: 'MOTOR-001', log: motorA.produceErrorLog('E202', 'Bearing vibration high') },
      );

      // SENSOR-001: 1 sensor = 1
      allSimulatedLogs.push(
        { deviceId: 'SENSOR-001', log: sensorA.produceSensorLog({ temperature: 22.1, humidity: 55.3 }) },
      );

      expect(allSimulatedLogs).toHaveLength(7);

      // Configure drive with all log files
      const allPending = fleet.getAllPendingLogs();
      const fileList = allPending.flatMap(({ logs }) =>
        logs.map(l => ({ name: l.filename, size: l.size }))
      );

      driveComm.setMockDriveAddress('192.168.4.1', 8080);
      driveComm.setMockFileList(fileList);

      for (const { logs } of allPending) {
        for (const log of logs) {
          driveComm.setMockFileContent(log.filename, log.content);
        }
      }
    });

    test('mobile discovers drive, fetches files, and verifies checksums', async () => {
      await driveComm.discoverDrive();
      expect(driveComm.isConnected()).toBe(true);

      const files = await driveComm.getFileList();
      expect(files).toHaveLength(7);

      for (const file of files) {
        const content = await driveComm.getFileContent(file.name);
        expect(content.success).toBe(true);

        const recomputedHash = createHash(content.data);
        const originalEntry = allSimulatedLogs.find(s => s.log.filename === file.name);
        expect(originalEntry).toBeDefined();
        expect(recomputedHash).toBe(originalEntry!.log.checksum);
      }
    });

    test('cloud ingests all 7 logs, dashboard reflects count', () => {
      for (const { deviceId, log } of allSimulatedLogs) {
        const result = logIngestion.ingest({
          deviceId,
          filename: log.filename,
          size: log.size,
          checksum: log.checksum,
          rawData: log.content,
          metadata: { source: 'fleet_simulation' },
        });
        expect(result.success).toBe(true);
      }

      const overview = dashboard.getFleetOverview();
      expect(overview.totalLogs).toBe(7);

      // Verify integrity of each ingested log
      for (const { deviceId, log } of allSimulatedLogs) {
        const cloudLogs = logIngestion.getLogsByDevice(deviceId);
        const cloudLog = cloudLogs.find(cl => cl.filename === log.filename);
        expect(cloudLog).toBeDefined();
        expect(logIngestion.verifyLogIntegrity(cloudLog!.id, log.checksum)).toBe(true);
      }

      // Clear device logs after collection
      for (const device of fleet.getAllDevices()) {
        device.clearCollectedLogs();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 3: Firmware Update Pipeline
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 3: Firmware Update Pipeline', () => {
    test('firmware uploaded to cloud and mobile downloads with progress', async () => {
      typeAFirmwareContent = 'FIRMWARE_BINARY_V2_TYPEA_PUMP_DATA_STREAM';
      typeAFirmwareHash = createHash(typeAFirmwareContent);
      typeBFirmwareContent = 'FIRMWARE_BINARY_V2_TYPEB_MOTOR_SENSOR_DATA';
      typeBFirmwareHash = createHash(typeBFirmwareContent);

      // Upload typeA firmware
      const uploadA = firmwareDistribution.upload({
        version: '2.0.0',
        deviceType: 'typeA',
        filename: 'typeA_fw_v2.0.0.bin',
        size: typeAFirmwareContent.length,
        sha256: typeAFirmwareHash,
        description: 'TypeA performance update',
      });
      expect(uploadA.success).toBe(true);
      typeAFirmwareId = uploadA.firmwareId!;

      // Upload typeB firmware
      const uploadB = firmwareDistribution.upload({
        version: '2.0.0',
        deviceType: 'typeB',
        filename: 'typeB_fw_v2.0.0.bin',
        size: typeBFirmwareContent.length,
        sha256: typeBFirmwareHash,
        description: 'TypeB efficiency improvement',
      });
      expect(uploadB.success).toBe(true);
      typeBFirmwareId = uploadB.firmwareId!;

      // Mobile checks for updates
      const allCloudFw = firmwareDistribution.getAllFirmware();
      firmwareService.setMockAvailableFirmware(allCloudFw.map(fw => ({
        id: fw.id,
        version: fw.version,
        deviceType: fw.device_type,
        filename: fw.filename,
        size: fw.size,
        sha256: fw.sha256,
        releaseDate: fw.release_date,
        description: fw.description,
      })));

      // Register progress callback
      firmwareService.onProgress((progress) => {
        progressEvents.push(progress);
      });

      const typeAUpdates = await firmwareService.checkForUpdates('typeA', '1.0.0');
      expect(typeAUpdates).toHaveLength(1);
      expect(typeAUpdates[0].version).toBe('2.0.0');

      const typeBUpdates = await firmwareService.checkForUpdates('typeB', '1.0.0');
      expect(typeBUpdates).toHaveLength(1);

      // Download both firmwares (progress events emitted)
      firmwareService.setMockDownloadData(typeAFirmwareContent);
      const downloadA = await firmwareService.downloadFirmware(typeAUpdates[0]);
      expect(downloadA.success).toBe(true);

      firmwareService.setMockDownloadData(typeBFirmwareContent);
      const downloadB = await firmwareService.downloadFirmware(typeBUpdates[0]);
      expect(downloadB.success).toBe(true);

      expect(progressEvents.length).toBeGreaterThanOrEqual(4);
    });

    test('devices apply firmware and reject tampered firmware', async () => {
      // Transfer firmware to drive
      firmwareService.setMockDriveConnected(true);

      const transferA = await firmwareService.transferToDrive(
        'typeA_fw_v2.0.0.bin', typeAFirmwareContent
      );
      expect(transferA.success).toBe(true);

      const transferB = await firmwareService.transferToDrive(
        'typeB_fw_v2.0.0.bin', typeBFirmwareContent
      );
      expect(transferB.success).toBe(true);

      // TypeA devices apply firmware
      expect(pumpA.applyFirmwareUpdate('2.0.0', typeAFirmwareContent, typeAFirmwareHash)).toBe(true);
      expect(pumpA.getFirmwareVersion()).toBe('2.0.0');
      expect(pumpB.applyFirmwareUpdate('2.0.0', typeAFirmwareContent, typeAFirmwareHash)).toBe(true);
      expect(pumpB.getFirmwareVersion()).toBe('2.0.0');

      // TypeB devices apply firmware
      expect(motorA.applyFirmwareUpdate('2.0.0', typeBFirmwareContent, typeBFirmwareHash)).toBe(true);
      expect(motorA.getFirmwareVersion()).toBe('2.0.0');
      expect(sensorA.applyFirmwareUpdate('2.0.0', typeBFirmwareContent, typeBFirmwareHash)).toBe(true);
      expect(sensorA.getFirmwareVersion()).toBe('2.0.0');

      // Tampered firmware rejected — version stays at 2.0.0
      const tampered = pumpA.applyFirmwareUpdate('3.0.0', 'TAMPERED_CONTENT', typeAFirmwareHash);
      expect(tampered).toBe(false);
      expect(pumpA.getFirmwareVersion()).toBe('2.0.0');
    });

    test('cloud device records updated to v2.0.0, dashboard firmware counts correct', () => {
      for (const device of fleet.getAllDevices()) {
        deviceModel.updateFirmwareVersion(device.getId(), '2.0.0');
      }

      // Verify cloud records
      for (const device of fleet.getAllDevices()) {
        const cloudDevice = deviceRegistry.getDevice(device.getId());
        expect(cloudDevice).toBeDefined();
        expect(cloudDevice!.firmware_version).toBe('2.0.0');
      }

      // Dashboard firmware summary
      const fwSummary = dashboard.getFirmwareStatusSummary();
      expect(fwSummary.totalFirmwarePackages).toBe(2);
      expect(fwSummary.byDeviceType['typeA']).toBe(1);
      expect(fwSummary.byDeviceType['typeB']).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 4: Offline Operations & Queue Management
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 4: Offline Operations & Queue Management', () => {
    test('cloud offline, new logs fetched from drive but upload queued', async () => {
      // Each device produces 1 new log
      const phase4Logs: { deviceId: string; log: SimulatedLog }[] = [];
      for (const device of fleet.getAllDevices()) {
        const log = device.produceSensorLog({ voltage: 12.5, current: 3.2 });
        phase4Logs.push({ deviceId: device.getId(), log });
        allSimulatedLogs.push({ deviceId: device.getId(), log });
      }
      expect(phase4Logs).toHaveLength(4);

      // Configure drive with new files
      driveComm.setMockFileList(
        phase4Logs.map(({ log }) => ({ name: log.filename, size: log.size }))
      );
      for (const { log } of phase4Logs) {
        driveComm.setMockFileContent(log.filename, log.content);
      }

      // Drive fetch works (drive is local, not cloud)
      const files = await driveComm.getFileList();
      expect(files).toHaveLength(4);

      // Cloud is offline — mobile uploads go to queue
      logsService.setMockCloudAvailable(false);
      for (const { deviceId, log } of phase4Logs) {
        const result = await logsService.uploadToCloud({
          filename: log.filename,
          size: log.size,
          deviceId,
          collectedAt: log.timestamp,
        });
        expect(result.success).toBe(false);
        expect(result.status).toBe('pending');
      }

      expect(logsService.getUploadQueue()).toHaveLength(4);
    });

    test('cloud recovery, queue drains, logs ingested — 11 total', async () => {
      logsService.setMockCloudAvailable(true);

      const queueResult = await logsService.processUploadQueue();
      expect(queueResult.successful).toBe(4);
      expect(queueResult.failed).toBe(0);
      expect(logsService.getUploadQueue()).toHaveLength(0);

      // Verify all 4 queued logs now have 'uploaded' status
      const phase4Entries = allSimulatedLogs.slice(7); // indices 7-10
      for (const { log } of phase4Entries) {
        expect(logsService.getLogStatus(log.filename)).toBe('uploaded');
      }

      // Ingest phase 4 logs into cloud
      for (const { deviceId, log } of phase4Entries) {
        const result = logIngestion.ingest({
          deviceId,
          filename: log.filename,
          size: log.size,
          checksum: log.checksum,
          rawData: log.content,
          metadata: { source: 'offline_queue_recovery' },
        });
        expect(result.success).toBe(true);
      }

      expect(logIngestion.getAllLogs()).toHaveLength(11);

      // Clear device logs
      for (const device of fleet.getAllDevices()) {
        device.clearCollectedLogs();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 5: Network Failure & Recovery
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 5: Network Failure & Recovery', () => {
    test('connection loss throws DriveConnectionError', async () => {
      // PUMP-001 produces 1 more log
      const recoveryLog = pumpA.produceSensorLog({ temperature: 50.1, pressure: 2.8 });
      allSimulatedLogs.push({ deviceId: 'PUMP-001', log: recoveryLog });

      // Configure drive with the new log
      driveComm.setMockFileList([{ name: recoveryLog.filename, size: recoveryLog.size }]);
      driveComm.setMockFileContent(recoveryLog.filename, recoveryLog.content);

      // File list fetch works
      const files = await driveComm.getFileList();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe(recoveryLog.filename);

      // Connection drops mid-operation
      driveComm.simulateConnectionLoss();

      await expect(driveComm.getFileContent(recoveryLog.filename))
        .rejects.toThrow(DriveConnectionError);
    });

    test('reconnect, retry succeeds, log ingested — 12 total', async () => {
      // Reconnect to drive
      driveComm.setMockDriveAddress('192.168.4.1', 8080);
      await driveComm.discoverDrive();
      expect(driveComm.isConnected()).toBe(true);

      // Retry file content fetch
      const recoveryEntry = allSimulatedLogs[allSimulatedLogs.length - 1];
      const content = await driveComm.getFileContent(recoveryEntry.log.filename);
      expect(content.success).toBe(true);

      // Verify hash of recovered content
      const hash = createHash(content.data);
      expect(hash).toBe(recoveryEntry.log.checksum);

      // Ingest recovered log
      const result = logIngestion.ingest({
        deviceId: recoveryEntry.deviceId,
        filename: recoveryEntry.log.filename,
        size: recoveryEntry.log.size,
        checksum: recoveryEntry.log.checksum,
        rawData: content.data,
        metadata: { source: 'network_recovery' },
      });
      expect(result.success).toBe(true);

      expect(logIngestion.getAllLogs()).toHaveLength(12);

      pumpA.clearCollectedLogs();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 6: Fleet Status & Dashboard
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 6: Fleet Status & Dashboard', () => {
    test('fleet overview: 2 online, 2 offline after device transitions', () => {
      motorA.goOffline();
      deviceRegistry.updateStatus('MOTOR-001', 'offline');
      sensorA.goOffline();
      deviceRegistry.updateStatus('SENSOR-001', 'offline');

      const overview = dashboard.getFleetOverview();
      expect(overview.totalDevices).toBe(4);
      expect(overview.onlineDevices).toBe(2);
      expect(overview.offlineDevices).toBe(2);
    });

    test('per-device detail shows correct cumulative log counts', () => {
      // PUMP-001: Phase 2 (3) + Phase 4 (1) + Phase 5 (1) = 5
      const pump001 = dashboard.getDeviceDetail('PUMP-001');
      expect(pump001).toBeDefined();
      expect(pump001!.logCount).toBe(5);

      // PUMP-002: Phase 2 (1) + Phase 4 (1) = 2
      const pump002 = dashboard.getDeviceDetail('PUMP-002');
      expect(pump002).toBeDefined();
      expect(pump002!.logCount).toBe(2);

      // MOTOR-001: Phase 2 (2) + Phase 4 (1) = 3
      const motor001 = dashboard.getDeviceDetail('MOTOR-001');
      expect(motor001).toBeDefined();
      expect(motor001!.logCount).toBe(3);

      // SENSOR-001: Phase 2 (1) + Phase 4 (1) = 2
      const sensor001 = dashboard.getDeviceDetail('SENSOR-001');
      expect(sensor001).toBeDefined();
      expect(sensor001!.logCount).toBe(2);
    });

    test('firmware summary and log history are consistent', () => {
      const fwSummary = dashboard.getFirmwareStatusSummary();
      expect(fwSummary.totalFirmwarePackages).toBe(2);
      expect(fwSummary.byDeviceType['typeA']).toBe(1);
      expect(fwSummary.byDeviceType['typeB']).toBe(1);

      const logHistory = dashboard.getLogUploadHistory();
      expect(logHistory).toHaveLength(12);

      // No duplicate checksums
      const checksums = logHistory.map(l => l.checksum);
      const uniqueChecksums = new Set(checksums);
      expect(uniqueChecksums.size).toBe(12);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 7: Data Integrity Verification
  // ═══════════════════════════════════════════════════════════════════════
  describe('Phase 7: Data Integrity Verification', () => {
    test('every cloud log checksum matches device-computed original', () => {
      for (const { deviceId, log } of allSimulatedLogs) {
        const cloudLogs = logIngestion.getLogsByDevice(deviceId);
        const cloudLog = cloudLogs.find(cl => cl.filename === log.filename);
        expect(cloudLog).toBeDefined();
        expect(logIngestion.verifyLogIntegrity(cloudLog!.id, log.checksum)).toBe(true);
      }
    });

    test('wrong checksum rejected without corrupting stored data', () => {
      const firstEntry = allSimulatedLogs[0];
      const cloudLogs = logIngestion.getLogsByDevice(firstEntry.deviceId);
      const cloudLog = cloudLogs.find(cl => cl.filename === firstEntry.log.filename);
      expect(cloudLog).toBeDefined();

      // Wrong checksum should fail
      const wrongChecksum = 'f'.repeat(64);
      expect(logIngestion.verifyLogIntegrity(cloudLog!.id, wrongChecksum)).toBe(false);

      // Original data still intact
      expect(logIngestion.verifyLogIntegrity(cloudLog!.id, firstEntry.log.checksum)).toBe(true);
    });

    test('firmware hashes verified, cross-type rejected, final counts correct', () => {
      // Correct hashes match
      expect(firmwareDistribution.verifyDownload(typeAFirmwareId, typeAFirmwareHash)).toBe(true);
      expect(firmwareDistribution.verifyDownload(typeBFirmwareId, typeBFirmwareHash)).toBe(true);

      // Cross-type hash mismatch rejected
      expect(firmwareDistribution.verifyDownload(typeAFirmwareId, typeBFirmwareHash)).toBe(false);
      expect(firmwareDistribution.verifyDownload(typeBFirmwareId, typeAFirmwareHash)).toBe(false);

      // Final counts
      expect(logIngestion.getAllLogs()).toHaveLength(12);
      expect(deviceRegistry.getAllDevices()).toHaveLength(4);
      expect(firmwareDistribution.getAllFirmware()).toHaveLength(2);

      // Zero duplicate checksums
      const allCloudLogs = logIngestion.getAllLogs();
      const checksums = allCloudLogs.map(l => l.checksum);
      expect(new Set(checksums).size).toBe(checksums.length);
    });
  });
});
