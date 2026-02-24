import { FirmwarePackage, FirmwareProgress } from '../types/Firmware';
import { CloudApiService } from './CloudApiService';
import { CLOUD_CONFIG } from '../config';
import { createHash } from '../utils/hash';

interface DownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

interface TransferResult {
  success: boolean;
  error?: string;
}

type ProgressCallback = (progress: FirmwareProgress) => void;

export class FirmwareService {
  private mockAvailableFirmware: FirmwarePackage[] = [];
  private mockDownloadData: string = '';
  private mockDriveConnected: boolean = false;
  private mockDownloadShouldFail: boolean = false;
  private progressCallbacks: ProgressCallback[] = [];
  private cloudApi: CloudApiService | null = null;

  setCloudApi(api: CloudApiService): void {
    this.cloudApi = api;
  }

  setMockAvailableFirmware(firmware: FirmwarePackage[]): void {
    this.mockAvailableFirmware = firmware;
  }

  setMockDownloadData(data: string): void {
    this.mockDownloadData = data;
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

  async downloadFirmware(pkg: FirmwarePackage): Promise<DownloadResult> {
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

    // Simulate progress
    this.emitProgress({
      phase: 'downloading',
      percentage: 50,
      bytesCompleted: Math.floor(pkg.size / 2),
      bytesTotal: pkg.size,
    });

    this.emitProgress({
      phase: 'downloading',
      percentage: 100,
      bytesCompleted: pkg.size,
      bytesTotal: pkg.size,
    });

    return {
      success: true,
      localPath: `/tmp/firmware/${pkg.filename}`,
    };
  }

  async transferToDrive(filename: string, data: string): Promise<TransferResult> {
    if (!this.mockDriveConnected) {
      return { success: false, error: 'Drive not connected' };
    }

    this.emitProgress({
      phase: 'transferring',
      percentage: 50,
      bytesCompleted: Math.floor(data.length / 2),
      bytesTotal: data.length,
    });

    this.emitProgress({
      phase: 'transferring',
      percentage: 100,
      bytesCompleted: data.length,
      bytesTotal: data.length,
    });

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
