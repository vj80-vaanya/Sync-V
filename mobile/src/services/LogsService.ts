import { LogFile, LogUploadStatus, EncryptedLogEntry, UploadQueueItem } from '../types/Log';
import { CloudApiService } from './CloudApiService';
import { SecureStore } from './SecureStore';
import { CLOUD_CONFIG } from '../config';
import { createHash } from '../utils/hash';

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
  private secureStore: SecureStore | null = null;

  /**
   * Opaque encrypted blob storage — drive-encrypted data stored as-is.
   * Mobile never decrypts; only metadata is accessible to the UI.
   * Persisted to filesystem so data survives app restarts.
   */
  private encryptedStore: Map<string, EncryptedLogEntry> = new Map();

  /**
   * Mock drive data — in real mode, getLogsFromDrive() calls driveComm.getFileContent()
   * which returns already-encrypted base64 from the drive.
   */
  private mockDriveEncryptedData: Map<string, string> = new Map();

  setCloudApi(api: CloudApiService): void {
    this.cloudApi = api;
  }

  setSecureStore(store: SecureStore): void {
    this.secureStore = store;
  }

  setMockDriveLogs(logs: LogFile[]): void {
    this.mockDriveLogs = logs;
  }

  setMockCloudAvailable(available: boolean): void {
    this.mockCloudAvailable = available;
  }

  /** Set mock encrypted data for a log file (simulates drive-encrypted content) */
  setMockDriveEncryptedData(filename: string, base64Blob: string): void {
    this.mockDriveEncryptedData.set(filename, base64Blob);
  }

  /**
   * Load persisted encrypted logs and upload queue from disk.
   * Call on app startup to restore state after restart.
   */
  async loadPersistedState(): Promise<void> {
    if (!this.secureStore) return;

    const persisted = await this.secureStore.loadAllEncryptedLogs();
    for (const [filename, entry] of persisted) {
      if (!this.encryptedStore.has(filename)) {
        this.encryptedStore.set(filename, entry);
        this.logStatuses.set(filename, 'pending');
      }
    }

    const queue = await this.secureStore.loadUploadQueue();
    if (queue.length > 0 && this.uploadQueue.length === 0) {
      this.uploadQueue = queue;
    }
  }

  /**
   * Fetch logs from drive. Content arrives already encrypted (opaque base64 blob).
   * Stored as-is — mobile never decrypts.
   */
  async getLogsFromDrive(): Promise<LogFile[]> {
    const driveLogs = [...this.mockDriveLogs];

    // Store each log's encrypted blob as-is upon receipt
    for (const log of driveLogs) {
      if (!this.encryptedStore.has(log.filename)) {
        // In mock mode, generate a placeholder blob; in real mode, driveComm provides this
        const driveBlob = this.mockDriveEncryptedData.get(log.filename)
          || `[${log.collectedAt}] Log data from ${log.deviceId} — ${log.filename} (${log.size} bytes)`;
        const entry: EncryptedLogEntry = {
          metadata: log,
          encryptedData: driveBlob,
          encryptedAt: new Date().toISOString(),
        };
        this.encryptedStore.set(log.filename, entry);

        // Persist to disk
        if (this.secureStore) {
          await this.secureStore.saveEncryptedLog(log.filename, entry);
        }
      }
    }

    return driveLogs;
  }

  /**
   * Fetch log metadata from cloud (already uploaded logs).
   * These are metadata-only — no content is fetched to the device.
   */
  async getLogsFromCloud(): Promise<LogFile[]> {
    if (!this.cloudApi || !this.cloudApi.isAuthenticated()) return [];
    const result = await this.cloudApi.get<any[]>(CLOUD_CONFIG.logsPath);
    if (!result.ok || !result.data) return [];
    return result.data.map((log: any) => ({
      filename: log.filename || '',
      size: log.size || 0,
      deviceId: log.device_id || '',
      collectedAt: log.created_at || '',
    }));
  }

  /**
   * Upload an opaque encrypted blob to cloud.
   * Mobile sends the blob as-is — cloud decrypts using the device's PSK.
   */
  async uploadToCloud(logFile: LogFile): Promise<UploadResult> {
    // Try real cloud API if available and authenticated
    if (this.cloudApi && this.cloudApi.isAuthenticated()) {
      this.logStatuses.set(logFile.filename, 'uploading');

      // Get opaque blob from store
      const entry = this.encryptedStore.get(logFile.filename);
      const rawData = entry?.encryptedData
        || `[${logFile.collectedAt}] Log data from ${logFile.deviceId}`;

      const result = await this.cloudApi.post(CLOUD_CONFIG.logsPath, {
        deviceId: logFile.deviceId,
        filename: logFile.filename,
        size: logFile.size,
        checksum: createHash(rawData),
        rawData,
        vendor: 'syncv-mobile',
        format: 'text',
      });

      if (result.ok) {
        this.logStatuses.set(logFile.filename, 'uploaded');
        // Auto-delete encrypted data after successful upload
        await this.deleteEncryptedEntry(logFile.filename);
        return { success: true, status: 'uploaded', encrypted: true };
      }

      // Cloud call failed — queue for retry, keep encrypted
      this.uploadQueue.push({
        id: `upload-${Date.now()}-${logFile.filename}`,
        logFile,
        encrypted: true,
        attempts: 1,
        maxAttempts: 3,
      });
      await this.persistUploadQueue();
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
      await this.persistUploadQueue();
      this.logStatuses.set(logFile.filename, 'pending');
      return { success: false, status: 'pending', encrypted: true };
    }

    this.logStatuses.set(logFile.filename, 'uploaded');
    // Auto-delete encrypted data after successful upload
    await this.deleteEncryptedEntry(logFile.filename);
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
        const entry = this.encryptedStore.get(item.logFile.filename);
        const rawData = entry?.encryptedData
          || `[${item.logFile.collectedAt}] Log data from ${item.logFile.deviceId}`;

        const result = await this.cloudApi!.post(CLOUD_CONFIG.logsPath, {
          deviceId: item.logFile.deviceId,
          filename: item.logFile.filename,
          size: item.logFile.size,
          checksum: createHash(rawData),
          rawData,
          vendor: 'syncv-mobile',
          format: 'text',
        });
        uploaded = result.ok;
      } else {
        uploaded = this.mockCloudAvailable;
      }

      if (uploaded) {
        this.logStatuses.set(item.logFile.filename, 'uploaded');
        // Auto-delete encrypted data after successful upload
        await this.deleteEncryptedEntry(item.logFile.filename);
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
    await this.persistUploadQueue();
    return { successful, failed, retrying };
  }

  getUploadQueue(): UploadQueueItem[] {
    return [...this.uploadQueue];
  }

  getLogStatus(filename: string): LogUploadStatus | undefined {
    return this.logStatuses.get(filename);
  }

  /** Check if a log blob is stored on-device */
  isEncryptedOnDevice(filename: string): boolean {
    return this.encryptedStore.has(filename);
  }

  /** Get count of encrypted blobs stored on-device */
  getEncryptedCount(): number {
    return this.encryptedStore.size;
  }

  /**
   * Purge uploaded log status (metadata only — encrypted data was already
   * auto-deleted on successful upload).
   */
  async purgeUploadedLog(filename: string): Promise<boolean> {
    const status = this.logStatuses.get(filename);
    if (status !== 'uploaded') {
      return false;
    }

    this.logStatuses.set(filename, 'purged');
    // Ensure encrypted data is gone
    await this.deleteEncryptedEntry(filename);
    return true;
  }

  /** Delete an encrypted entry from memory and disk */
  private async deleteEncryptedEntry(filename: string): Promise<void> {
    this.encryptedStore.delete(filename);
    if (this.secureStore) {
      await this.secureStore.deleteEncryptedLog(filename);
    }
  }

  /** Persist upload queue to disk */
  private async persistUploadQueue(): Promise<void> {
    if (this.secureStore) {
      await this.secureStore.saveUploadQueue(this.uploadQueue);
    }
  }
}
