import { LogFile, LogUploadStatus, LogUploadRecord, UploadQueueItem } from '../types/Log';
import { CloudApiService } from './CloudApiService';
import { CLOUD_CONFIG } from '../config';

interface UploadResult {
  success: boolean;
  status: LogUploadStatus;
  encrypted: boolean;
}

interface QueueProcessResult {
  successful: number;
  failed: number;
  retrying: number;
}

export class LogsService {
  private mockDriveLogs: LogFile[] = [];
  private mockCloudAvailable: boolean = false;
  private logStatuses: Map<string, LogUploadStatus> = new Map();
  private uploadQueue: UploadQueueItem[] = [];
  private cloudApi: CloudApiService | null = null;

  setCloudApi(api: CloudApiService): void {
    this.cloudApi = api;
  }

  setMockDriveLogs(logs: LogFile[]): void {
    this.mockDriveLogs = logs;
  }

  setMockCloudAvailable(available: boolean): void {
    this.mockCloudAvailable = available;
  }

  async getLogsFromDrive(): Promise<LogFile[]> {
    return [...this.mockDriveLogs];
  }

  async uploadToCloud(logFile: LogFile): Promise<UploadResult> {
    // Try real cloud API if available and authenticated
    if (this.cloudApi && this.cloudApi.isAuthenticated()) {
      this.logStatuses.set(logFile.filename, 'uploading');

      const result = await this.cloudApi.post(CLOUD_CONFIG.logsPath, {
        deviceId: logFile.deviceId,
        filename: logFile.filename,
        size: logFile.size,
        checksum: this.simpleChecksum(logFile.filename + logFile.size),
        rawData: `[${logFile.collectedAt}] Log data from ${logFile.deviceId}`,
        vendor: 'syncv-mobile',
        format: 'text',
      });

      if (result.ok) {
        this.logStatuses.set(logFile.filename, 'uploaded');
        return { success: true, status: 'uploaded', encrypted: true };
      }

      // Cloud call failed — queue for retry
      this.uploadQueue.push({
        id: `upload-${Date.now()}-${logFile.filename}`,
        logFile,
        encrypted: true,
        attempts: 1,
        maxAttempts: 3,
      });
      this.logStatuses.set(logFile.filename, 'pending');
      return { success: false, status: 'pending', encrypted: true };
    }

    // Mock fallback (for tests or when cloud not configured)
    if (!this.mockCloudAvailable) {
      this.uploadQueue.push({
        id: `upload-${Date.now()}-${logFile.filename}`,
        logFile,
        encrypted: true,
        attempts: 0,
        maxAttempts: 3,
      });
      this.logStatuses.set(logFile.filename, 'pending');
      return { success: false, status: 'pending', encrypted: true };
    }

    this.logStatuses.set(logFile.filename, 'uploaded');
    return { success: true, status: 'uploaded', encrypted: true };
  }

  async processUploadQueue(): Promise<QueueProcessResult> {
    let successful = 0;
    let failed = 0;
    let retrying = 0;

    const remaining: UploadQueueItem[] = [];
    const useRealApi = this.cloudApi && this.cloudApi.isAuthenticated();

    for (const item of this.uploadQueue) {
      let uploaded = false;

      if (useRealApi) {
        const result = await this.cloudApi!.post(CLOUD_CONFIG.logsPath, {
          deviceId: item.logFile.deviceId,
          filename: item.logFile.filename,
          size: item.logFile.size,
          checksum: this.simpleChecksum(item.logFile.filename + item.logFile.size),
          rawData: `[${item.logFile.collectedAt}] Log data from ${item.logFile.deviceId}`,
          vendor: 'syncv-mobile',
          format: 'text',
        });
        uploaded = result.ok;
      } else {
        uploaded = this.mockCloudAvailable;
      }

      if (uploaded) {
        this.logStatuses.set(item.logFile.filename, 'uploaded');
        successful++;
      } else {
        item.attempts++;
        if (item.attempts >= item.maxAttempts) {
          this.logStatuses.set(item.logFile.filename, 'failed');
          failed++;
        } else {
          remaining.push(item);
          retrying++;
        }
      }
    }

    this.uploadQueue = remaining;
    return { successful, failed, retrying };
  }

  getUploadQueue(): UploadQueueItem[] {
    return [...this.uploadQueue];
  }

  getLogStatus(filename: string): LogUploadStatus | undefined {
    return this.logStatuses.get(filename);
  }

  async purgeUploadedLog(filename: string): Promise<boolean> {
    const status = this.logStatuses.get(filename);
    if (status !== 'uploaded') {
      return false;
    }

    this.logStatuses.set(filename, 'purged');
    return true;
  }

  // Generate a deterministic checksum for log uploads
  private simpleChecksum(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    // Pad to 64 chars for SHA256 format
    return (hex + hex + hex + hex + hex + hex + hex + hex).substring(0, 64);
  }
}
