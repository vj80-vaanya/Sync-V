import { LogFile, LogUploadStatus, LogUploadRecord, UploadQueueItem } from '../types/Log';

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

    for (const item of this.uploadQueue) {
      if (this.mockCloudAvailable) {
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
}
