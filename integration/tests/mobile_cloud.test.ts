/**
 * Integration tests: Mobile <-> Cloud
 *
 * Tests the mobile app uploading logs to cloud and downloading firmware,
 * including offline queue behavior.
 */

import { LogsService } from '../../mobile/src/services/LogsService';
import { FirmwareService } from '../../mobile/src/services/FirmwareService';
import { NetworkService } from '../../mobile/src/services/NetworkService';
import { LogFile } from '../../mobile/src/types/Log';
import { FirmwarePackage } from '../../mobile/src/types/Firmware';

describe('Mobile <-> Cloud Integration', () => {
  let logsService: LogsService;
  let firmwareService: FirmwareService;
  let network: NetworkService;

  const testLog: LogFile = {
    filename: 'device_log_2026.txt',
    size: 4096,
    deviceId: 'DEV001',
    collectedAt: '2026-01-15T10:00:00Z',
  };

  const testFirmware: FirmwarePackage = {
    id: 'fw-001',
    version: '2.0.0',
    deviceType: 'typeA',
    filename: 'fw_typeA_v2.0.0.bin',
    size: 10240,
    sha256: 'abc123def456',
    releaseDate: '2026-01-15',
    description: 'Performance improvements',
  };

  beforeEach(() => {
    logsService = new LogsService();
    firmwareService = new FirmwareService();
    network = new NetworkService();
  });

  test('mobile uploads logs to cloud when online', async () => {
    network.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: false,
      isCloudReachable: true,
    });

    logsService.setMockCloudAvailable(true);

    const result = await logsService.uploadToCloud(testLog);
    expect(result.success).toBe(true);
    expect(result.encrypted).toBe(true);
    expect(result.status).toBe('uploaded');
  });

  test('mobile downloads firmware from cloud', async () => {
    network.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: false,
      isCloudReachable: true,
    });

    firmwareService.setMockAvailableFirmware([testFirmware]);
    firmwareService.setMockDownloadData('FIRMWARE_BINARY');

    const available = await firmwareService.checkForUpdates('typeA', '1.0.0');
    expect(available).toHaveLength(1);

    const downloadResult = await firmwareService.downloadFirmware(available[0]);
    expect(downloadResult.success).toBe(true);
  });

  test('offline queue -> reconnect -> auto-upload', async () => {
    // Start offline
    network.setNetworkState({
      isConnected: false,
      connectionType: 'none',
      isDriveReachable: false,
      isCloudReachable: false,
    });
    logsService.setMockCloudAvailable(false);

    // Queue multiple logs while offline
    const log1: LogFile = { ...testLog, filename: 'log1.txt' };
    const log2: LogFile = { ...testLog, filename: 'log2.txt' };
    const log3: LogFile = { ...testLog, filename: 'log3.txt' };

    await logsService.uploadToCloud(log1);
    await logsService.uploadToCloud(log2);
    await logsService.uploadToCloud(log3);

    expect(logsService.getUploadQueue()).toHaveLength(3);

    // Come back online
    network.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: false,
      isCloudReachable: true,
    });
    logsService.setMockCloudAvailable(true);

    // Process the queue
    const results = await logsService.processUploadQueue();
    expect(results.successful).toBe(3);
    expect(results.failed).toBe(0);
    expect(logsService.getUploadQueue()).toHaveLength(0);

    // Verify all are uploaded
    expect(logsService.getLogStatus('log1.txt')).toBe('uploaded');
    expect(logsService.getLogStatus('log2.txt')).toBe('uploaded');
    expect(logsService.getLogStatus('log3.txt')).toBe('uploaded');
  });
});
