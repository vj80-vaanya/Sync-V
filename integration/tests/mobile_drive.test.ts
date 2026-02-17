/**
 * Integration tests: Mobile <-> Drive
 *
 * These tests simulate the mobile app communicating with the Sync-V drive
 * over local Wi-Fi, using the service layer from both modules.
 */

import { DriveCommService, DriveConnectionError } from '../../mobile/src/services/DriveCommService';
import { MetadataParserRegistry } from '../../mobile/src/parsers/MetadataParser';
import { NetworkService } from '../../mobile/src/services/NetworkService';

describe('Mobile <-> Drive Integration', () => {
  let driveComm: DriveCommService;
  let network: NetworkService;

  beforeEach(() => {
    driveComm = new DriveCommService();
    network = new NetworkService();
  });

  test('mobile discovers drive on local Wi-Fi and reads file list', async () => {
    // Simulate drive available on Wi-Fi
    network.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: true,
      isCloudReachable: false,
    });

    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileList([
      { name: 'log_2026_01.txt', size: 4096 },
      { name: 'log_2026_02.csv', size: 8192 },
      { name: 'metadata.json', size: 256 },
    ]);

    expect(network.canReachDrive()).toBe(true);

    const discovery = await driveComm.discoverDrive();
    expect(discovery.found).toBe(true);

    const files = await driveComm.getFileList();
    expect(files).toHaveLength(3);
  });

  test('mobile reads log metadata from drive and parses it', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileContent(
      'metadata.json',
      '{"id":"DEV001","fw":"1.5.0","temp":"42.3","status":"running"}'
    );
    await driveComm.discoverDrive();

    const result = await driveComm.getFileContent('metadata.json');
    expect(result.success).toBe(true);

    const registry = new MetadataParserRegistry();
    const metadata = registry.parse(result.data, 'typeB');

    expect(metadata.parseSuccessful).toBe(true);
    expect(metadata.deviceId).toBe('DEV001');
    expect(metadata.firmwareVersion).toBe('1.5.0');
    expect(metadata.fields['temp']).toBe('42.3');
  });

  test('mobile sends firmware to drive', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    const firmwareData = 'SIGNED_FIRMWARE_PACKAGE_V2_BINARY';
    const sent = await driveComm.sendFirmware('fw_v2.0.0.bin', firmwareData);
    expect(sent).toBe(true);
  });

  test('connection loss during file list fetch triggers retry path', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    // Read files successfully first
    driveComm.setMockFileList([{ name: 'log.txt', size: 100 }]);
    const files = await driveComm.getFileList();
    expect(files).toHaveLength(1);

    // Simulate connection loss
    driveComm.simulateConnectionLoss();

    // Should throw, allowing caller to implement retry
    await expect(driveComm.getFileList()).rejects.toThrow(DriveConnectionError);

    // Reconnect
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    // Should work again
    const filesRetry = await driveComm.getFileList();
    expect(filesRetry).toHaveLength(1);
  });
});
