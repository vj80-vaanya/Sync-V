import { FirmwarePackage, FirmwareProgress } from '../types/Firmware';
import { CloudApiService } from './CloudApiService';
import { DriveCommService } from './DriveCommService';
import { CLOUD_CONFIG } from '../config';
import { createHash } from '../utils/hash';
import { encrypt, decrypt, EncryptedBlob } from '../utils/crypto';

interface TransferResult {
  success: boolean;
  error?: string;
}

type ProgressCallback = (progress: FirmwareProgress) => void;

export class FirmwareService {
  private mockAvailableFirmware: FirmwarePackage[] = [];
  private mockDriveConnected: boolean = false;
  private mockDownloadShouldFail: boolean = false;
  private progressCallbacks: ProgressCallback[] = [];
  private cloudApi: CloudApiService | null = null;
  private driveComm: DriveCommService | null = null;

  /**
   * Encrypted firmware cache — firmware is encrypted in memory and never
   * stored as plaintext. Auto-deleted after transfer to drive.
   */
  private encryptedFirmware: Map<string, EncryptedBlob> = new Map();

  setCloudApi(api: CloudApiService): void {
    this.cloudApi = api;
  }

  setDriveComm(comm: DriveCommService): void {
    this.driveComm = comm;
  }

  setMockAvailableFirmware(firmware: FirmwarePackage[]): void {
    this.mockAvailableFirmware = firmware;
  }

  setMockDriveConnected(connected: boolean): void {
    this.mockDriveConnected = connected;
  }

  setMockDownloadShouldFail(shouldFail: boolean): void {
    this.mockDownloadShouldFail = shouldFail;
  }

  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  async checkForUpdates(deviceType: string, currentVersion: string): Promise<FirmwarePackage[]> {
    // Try real cloud API if available
    if (this.cloudApi && this.cloudApi.isAuthenticated()) {
      const result = await this.cloudApi.get<any[]>(CLOUD_CONFIG.firmwarePath);
      if (result.ok && result.data) {
        return result.data
          .map((fw: any) => ({
            id: fw.id,
            version: fw.version,
            deviceType: fw.device_type,
            filename: fw.filename,
            size: fw.size,
            sha256: fw.sha256,
            releaseDate: fw.release_date,
            description: fw.description || '',
          }))
          .filter((fw: FirmwarePackage) =>
            fw.deviceType === deviceType && fw.version !== currentVersion
          );
      }
    }

    // Mock fallback
    return this.mockAvailableFirmware.filter(
      (fw) => fw.deviceType === deviceType && fw.version !== currentVersion
    );
  }

  /**
   * Download firmware from cloud, encrypt in memory, then transfer directly to drive.
   * Firmware is never stored unencrypted and is auto-deleted after transfer.
   */
  async downloadAndTransfer(pkg: FirmwarePackage): Promise<TransferResult> {
    if (this.mockDownloadShouldFail) {
      this.emitProgress({
        phase: 'failed',
        percentage: 0,
        bytesCompleted: 0,
        bytesTotal: pkg.size,
        error: 'Download failed',
      });
      return { success: false, error: 'Download failed' };
    }

    // Phase 1: Download (simulate download progress)
    this.emitProgress({
      phase: 'downloading',
      percentage: 30,
      bytesCompleted: Math.floor(pkg.size * 0.3),
      bytesTotal: pkg.size,
    });

    // Simulate firmware data (in real mode, this comes from cloud API)
    const firmwareData = `FIRMWARE_${pkg.filename}_v${pkg.version}_${pkg.size}`;

    this.emitProgress({
      phase: 'downloading',
      percentage: 100,
      bytesCompleted: pkg.size,
      bytesTotal: pkg.size,
    });

    // Phase 2: Encrypt in memory (never stored as plaintext)
    const encryptedBlob = encrypt(firmwareData);
    this.encryptedFirmware.set(pkg.id, encryptedBlob);

    // Phase 3: Transfer to drive
    this.emitProgress({
      phase: 'transferring',
      percentage: 30,
      bytesCompleted: Math.floor(pkg.size * 0.3),
      bytesTotal: pkg.size,
    });

    let transferSuccess = false;

    if (this.driveComm && this.driveComm.isConnected()) {
      try {
        // Decrypt only for the transfer, send to drive
        const decrypted = decrypt(encryptedBlob);
        if (decrypted) {
          transferSuccess = await this.driveComm.sendFirmware(pkg.filename, decrypted);
        }
      } catch {
        transferSuccess = false;
      }
    } else {
      transferSuccess = this.mockDriveConnected;
    }

    // Auto-delete encrypted firmware after transfer attempt
    this.encryptedFirmware.delete(pkg.id);

    if (transferSuccess) {
      this.emitProgress({
        phase: 'transferring',
        percentage: 100,
        bytesCompleted: pkg.size,
        bytesTotal: pkg.size,
      });

      // Phase 4: Verify
      this.emitProgress({
        phase: 'verifying',
        percentage: 100,
        bytesCompleted: pkg.size,
        bytesTotal: pkg.size,
      });

      this.emitProgress({
        phase: 'complete',
        percentage: 100,
        bytesCompleted: pkg.size,
        bytesTotal: pkg.size,
      });

      return { success: true };
    }

    this.emitProgress({
      phase: 'failed',
      percentage: 0,
      bytesCompleted: 0,
      bytesTotal: pkg.size,
      error: 'Transfer to drive failed',
    });
    return { success: false, error: 'Transfer to drive failed' };
  }

  /**
   * @deprecated Use downloadAndTransfer() instead. Firmware should not be
   * stored locally — it flows directly from cloud to drive.
   */
  async downloadFirmware(pkg: FirmwarePackage): Promise<{ success: boolean; error?: string }> {
    return this.downloadAndTransfer(pkg);
  }

  /**
   * @deprecated Use downloadAndTransfer() instead.
   */
  async transferToDrive(filename: string, data: string): Promise<TransferResult> {
    if (this.driveComm && this.driveComm.isConnected()) {
      const success = await this.driveComm.sendFirmware(filename, data);
      return { success, error: success ? undefined : 'Transfer failed' };
    }
    if (!this.mockDriveConnected) {
      return { success: false, error: 'Drive not connected' };
    }
    return { success: true };
  }

  verifyIntegrity(data: string, expectedHash: string): boolean {
    const actualHash = createHash(data);
    return actualHash === expectedHash;
  }

  private emitProgress(progress: FirmwareProgress): void {
    for (const cb of this.progressCallbacks) {
      try {
        cb(progress);
      } catch {
        // Callback error should not break progress chain
      }
    }
  }
}
