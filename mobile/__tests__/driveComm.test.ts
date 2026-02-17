import { DriveCommService, DriveConnectionError } from '../src/services/DriveCommService';
import { FileInfo } from '../src/types/Device';

describe('DriveCommService', () => {
  let driveComm: DriveCommService;

  beforeEach(() => {
    driveComm = new DriveCommService();
  });

  test('discovers drive on local Wi-Fi', async () => {
    // Mock a successful discovery
    driveComm.setMockDriveAddress('192.168.4.1', 8080);

    const result = await driveComm.discoverDrive();
    expect(result.found).toBe(true);
    expect(result.address).toBe('192.168.4.1');
    expect(result.port).toBe(8080);
  });

  test('returns not found when drive unavailable', async () => {
    driveComm.setMockDriveAddress(null, 0);

    const result = await driveComm.discoverDrive();
    expect(result.found).toBe(false);
  });

  test('fetches file list from drive', async () => {
    const mockFiles: FileInfo[] = [
      { name: 'log1.txt', size: 1024 },
      { name: 'log2.csv', size: 2048 },
    ];
    driveComm.setMockFileList(mockFiles);
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    const files = await driveComm.getFileList();
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('log1.txt');
    expect(files[1].size).toBe(2048);
  });

  test('fetches file content from drive', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setMockFileContent('log1.txt', 'timestamp=1001 event=start');
    await driveComm.discoverDrive();

    const result = await driveComm.getFileContent('log1.txt');
    expect(result.success).toBe(true);
    expect(result.data).toBe('timestamp=1001 event=start');
  });

  test('sends firmware to drive', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    const sent = await driveComm.sendFirmware('fw_v2.bin', 'FIRMWARE_BINARY');
    expect(sent).toBe(true);
  });

  test('handles connection loss', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    driveComm.simulateConnectionLoss();

    await expect(driveComm.getFileList()).rejects.toThrow(DriveConnectionError);
  });

  test('handles timeout', async () => {
    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    driveComm.setTimeoutMs(50);
    await driveComm.discoverDrive();

    driveComm.simulateTimeout();

    await expect(driveComm.getFileList()).rejects.toThrow(DriveConnectionError);
  });

  test('returns connection status', async () => {
    expect(driveComm.isConnected()).toBe(false);

    driveComm.setMockDriveAddress('192.168.4.1', 8080);
    await driveComm.discoverDrive();

    expect(driveComm.isConnected()).toBe(true);
  });
});
