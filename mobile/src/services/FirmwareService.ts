import { FirmwarePackage, FirmwareProgress } from '../types/Firmware';
import { CloudApiService } from './CloudApiService';
import { DriveCommService } from './DriveCommService';
import { CLOUD_CONFIG } from '../config';
import { createHash } from '../utils/hash';

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
   * Downloaded firmware cache — firmware data stored as-is from cloud.
   * Two-phase: download from cloud, then deliver to drive as separate action.
   */
  private downloadedFirmware: Map<string, { data: string; pkg: FirmwarePackage }> = new Map();

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

  /** Check if firmware has been downloaded and is ready to deliver */
  isDownloaded(pkgId: string): boolean {
    return this.downloadedFirmware.has(pkgId);
  }

  /** Get all downloaded firmware packages */
  getDownloadedFirmware(): FirmwarePackage[] {
    return Array.from(this.downloadedFirmware.values()).map(e => e.pkg);
  }

  /**
   * Download firmware from cloud. Stores locally for later delivery to drive.
   */
  async downloadFirmware(pkg: FirmwarePackage): Promise<{ success: boolean; error?: string }> {
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

    // Phase 1: Download
    this.emitProgress({
      phase: 'downloading',
      percentage: 30,
      bytesCompleted: Math.floor(pkg.size * 0.3),
      bytesTotal: pkg.size,
    });

    // Simulate firmware data (in real mode, this comes from cloud API download endpoint)
    const firmwareData = `FIRMWARE_${pkg.filename}_v${pkg.version}_${pkg.size}`;

    this.emitProgress({
      phase: 'downloading',
      percentage: 100,
      bytesCompleted: pkg.size,
      bytesTotal: pkg.size,
    });

    // Store for later delivery
    this.downloadedFirmware.set(pkg.id, { data: firmwareData, pkg });

    return { success: true };
  }

  /**
   * Deliver previously downloaded firmware to the drive.
   * Deletes from local storage on success.
   */
  async deliverToDrive(pkg: FirmwarePackage): Promise<TransferResult> {
    const cached = this.downloadedFirmware.get(pkg.id);
    if (!cached) {
      return { success: false, error: 'Firmware not downloaded' };
    }

    this.emitProgress({
      phase: 'transferring',
      percentage: 30,
      bytesCompleted: Math.floor(pkg.size * 0.3),
      bytesTotal: pkg.size,
    });

    let transferSuccess = false;

    if (this.driveComm && this.driveComm.isConnected()) {
      try {
        transferSuccess = await this.driveComm.sendFirmware(pkg.filename, cached.data);
      } catch {
        transferSuccess = false;
      }
    } else {
      transferSuccess = this.mockDriveConnected;
    }

    if (transferSuccess) {
      // Delete from local storage on success
      this.downloadedFirmware.delete(pkg.id);

      this.emitProgress({
        phase: 'transferring',
        percentage: 100,
        bytesCompleted: pkg.size,
        bytesTotal: pkg.size,
      });

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
   * Download from cloud and deliver to drive in one step.
   * Convenience method that calls downloadFirmware() then deliverToDrive().
   */
  async downloadAndTransfer(pkg: FirmwarePackage): Promise<TransferResult> {
    const downloadResult = await this.downloadFirmware(pkg);
    if (!downloadResult.success) {
      return { success: false, error: downloadResult.error };
    }
    return this.deliverToDrive(pkg);
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
