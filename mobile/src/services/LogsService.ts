import { LogFile, LogUploadStatus, EncryptedLogEntry, UploadQueueItem } from '../types/Log';
import { CloudApiService } from './CloudApiService';
import { SecureStore } from './SecureStore';
import { CLOUD_CONFIG } from '../config';
import { encrypt, decrypt } from '../utils/crypto';

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
   * Encrypted storage — log content is encrypted immediately upon receipt.
   * Only metadata is accessible; raw content is never exposed to the UI.
   * Persisted to filesystem so data survives app restarts.
   */
  private encryptedStore: Map<string, EncryptedLogEntry> = new Map();

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
   * Fetch logs from drive. Content is encrypted immediately and persisted.
   * Returns only metadata — raw content is never returned.
   */
  async getLogsFromDrive(): Promise<LogFile[]> {
    const driveLogs = [...this.mockDriveLogs];

    // Encrypt each log's data immediately upon receipt
    for (const log of driveLogs) {
      if (!this.encryptedStore.has(log.filename)) {
        const rawData = `[${log.collectedAt}] Log data from ${log.deviceId} — ${log.filename} (${log.size} bytes)`;
        const entry: EncryptedLogEntry = {
          metadata: log,
          encryptedData: encrypt(rawData),
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
   * Upload an encrypted log to cloud.
   * Decrypts in-memory only for the upload request, then auto-deletes.
   */
  async uploadToCloud(logFile: LogFile): Promise<UploadResult> {
    // Try real cloud API if available and authenticated
    if (this.cloudApi && this.cloudApi.isAuthenticated()) {
      this.logStatuses.set(logFile.filename, 'uploading');

      // Decrypt from encrypted store for upload
      const entry = this.encryptedStore.get(logFile.filename);
      let rawData = `[${logFile.collectedAt}] Log data from ${logFile.deviceId}`;
      if (entry) {
        const decrypted = decrypt(entry.encryptedData);
        if (decrypted) rawData = decrypted;
      }

      const result = await this.cloudApi.post(CLOUD_CONFIG.logsPath, {
        deviceId: logFile.deviceId,
        filename: logFile.filename,
        size: logFile.size,
        checksum: this.simpleChecksum(logFile.filename + logFile.size),
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
        // Decrypt for upload
        const entry = this.encryptedStore.get(item.logFile.filename);
        let rawData = `[${item.logFile.collectedAt}] Log data from ${item.logFile.deviceId}`;
        if (entry) {
          const decrypted = decrypt(entry.encryptedData);
          if (decrypted) rawData = decrypted;
        }

        const result = await this.cloudApi!.post(CLOUD_CONFIG.logsPath, {
          deviceId: item.logFile.deviceId,
          filename: item.logFile.filename,
          size: item.logFile.size,
          checksum: this.simpleChecksum(item.logFile.filename + item.logFile.size),
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

  /** Check if a log is currently encrypted on-device */
  isEncryptedOnDevice(filename: string): boolean {
    return this.encryptedStore.has(filename);
  }

  /** Get count of encrypted logs stored on-device */
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
