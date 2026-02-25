import { EncryptedBlob } from '../utils/crypto';

export interface LogFile {
  filename: string;
  size: number;
  deviceId: string;
  collectedAt: string;
}

export type LogUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'purged';

export interface LogUploadRecord {
  logFile: LogFile;
  status: LogUploadStatus;
  uploadedAt?: string;
  retryCount: number;
  error?: string;
}

export interface UploadQueueItem {
  id: string;
  logFile: LogFile;
  encrypted: boolean;
  attempts: number;
  maxAttempts: number;
}

/** An encrypted log entry stored on-device. Content is never exposed to the UI. */
export interface EncryptedLogEntry {
  metadata: LogFile;
  encryptedData: EncryptedBlob;
  encryptedAt: string;
}
