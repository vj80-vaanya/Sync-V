import { FirmwareService } from '../src/services/FirmwareService';
import { FirmwarePackage, FirmwareProgress } from '../src/types/Firmware';

describe('FirmwareService', () => {
  let firmwareService: FirmwareService;

  const mockPackage: FirmwarePackage = {
    id: 'fw-001',
    version: '2.0.0',
    deviceType: 'typeA',
    filename: 'fw_typeA_v2.0.0.bin',
    size: 10240,
    sha256: 'abc123def456',
    releaseDate: '2026-01-15',
    description: 'Bug fixes and performance improvements',
  };

  beforeEach(() => {
    firmwareService = new FirmwareService();
  });

  test('checks cloud for firmware availability', async () => {
    firmwareService.setMockAvailableFirmware([mockPackage]);

    const available = await firmwareService.checkForUpdates('typeA', '1.0.0');
    expect(available).toHaveLength(1);
    expect(available[0].version).toBe('2.0.0');
  });

  test('returns empty when no updates available', async () => {
    firmwareService.setMockAvailableFirmware([]);

    const available = await firmwareService.checkForUpdates('typeA', '2.0.0');
    expect(available).toHaveLength(0);
  });

  test('downloadAndTransfer succeeds when drive connected', async () => {
    firmwareService.setMockDriveConnected(true);

    const progressUpdates: FirmwareProgress[] = [];
    firmwareService.onProgress((p) => progressUpdates.push({ ...p }));

    const result = await firmwareService.downloadAndTransfer(mockPackage);
    expect(result.success).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);

    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.phase).toBe('complete');
    expect(lastUpdate.percentage).toBe(100);
  });

  test('downloadAndTransfer fails when drive disconnected', async () => {
    firmwareService.setMockDriveConnected(false);

    const progressUpdates: FirmwareProgress[] = [];
    firmwareService.onProgress((p) => progressUpdates.push({ ...p }));

    const result = await firmwareService.downloadAndTransfer(mockPackage);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Transfer to drive failed');

    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.phase).toBe('failed');
  });

  // Two-phase download/deliver tests

  test('downloadFirmware stores firmware locally', async () => {
    const result = await firmwareService.downloadFirmware(mockPackage);
    expect(result.success).toBe(true);
    expect(firmwareService.isDownloaded(mockPackage.id)).toBe(true);
  });

  test('deliverToDrive sends to drive and deletes local copy', async () => {
    firmwareService.setMockDriveConnected(true);

    await firmwareService.downloadFirmware(mockPackage);
    expect(firmwareService.isDownloaded(mockPackage.id)).toBe(true);

    const result = await firmwareService.deliverToDrive(mockPackage);
    expect(result.success).toBe(true);
    expect(firmwareService.isDownloaded(mockPackage.id)).toBe(false);
  });

  test('deliverToDrive fails when not downloaded', async () => {
    firmwareService.setMockDriveConnected(true);

    const result = await firmwareService.deliverToDrive(mockPackage);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Firmware not downloaded');
  });

  test('deliverToDrive fails when drive disconnected', async () => {
    firmwareService.setMockDriveConnected(false);

    await firmwareService.downloadFirmware(mockPackage);
    const result = await firmwareService.deliverToDrive(mockPackage);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Transfer to drive failed');
  });

  test('deliverToDrive keeps local copy on failure', async () => {
    firmwareService.setMockDriveConnected(false);

    await firmwareService.downloadFirmware(mockPackage);
    await firmwareService.deliverToDrive(mockPackage);
    // Should still be downloaded since transfer failed
    expect(firmwareService.isDownloaded(mockPackage.id)).toBe(true);
  });

  test('getDownloadedFirmware returns all downloaded packages', async () => {
    const pkg2: FirmwarePackage = { ...mockPackage, id: 'fw-002', version: '3.0.0' };

    await firmwareService.downloadFirmware(mockPackage);
    await firmwareService.downloadFirmware(pkg2);

    const downloaded = firmwareService.getDownloadedFirmware();
    expect(downloaded).toHaveLength(2);
  });

  test('deprecated transferToDrive works with mock', async () => {
    firmwareService.setMockDriveConnected(true);

    const result = await firmwareService.transferToDrive(
      mockPackage.filename,
      'FIRMWARE_BINARY_DATA'
    );
    expect(result.success).toBe(true);
  });

  test('tracks download and transfer progress', async () => {
    firmwareService.setMockDriveConnected(true);

    const progressUpdates: FirmwareProgress[] = [];
    firmwareService.onProgress((p) => progressUpdates.push({ ...p }));

    await firmwareService.downloadAndTransfer(mockPackage);

    // Should have downloading, transferring, verifying, and complete phases
    const phases = progressUpdates.map((p) => p.phase);
    expect(phases).toContain('downloading');
    expect(phases).toContain('transferring');
    expect(phases).toContain('complete');
  });

  test('verifies integrity with SHA256', async () => {
    const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const verified = firmwareService.verifyIntegrity('', validHash);
    expect(verified).toBe(true);
  });

  test('rejects tampered firmware', () => {
    const verified = firmwareService.verifyIntegrity('data', 'wrong_hash');
    expect(verified).toBe(false);
  });

  test('handles download failure', async () => {
    firmwareService.setMockDownloadShouldFail(true);

    const result = await firmwareService.downloadAndTransfer(mockPackage);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('handles transfer failure when drive disconnected', async () => {
    firmwareService.setMockDriveConnected(false);

    const result = await firmwareService.transferToDrive(
      mockPackage.filename,
      'FIRMWARE_DATA'
    );
    expect(result.success).toBe(false);
  });
});
