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

/** An encrypted log entry stored on-device. Content is an opaque base64 blob from the drive. */
export interface EncryptedLogEntry {
  metadata: LogFile;
  /** Opaque base64-encoded blob from drive (IV + AES-256-CBC ciphertext) */
  encryptedData: string;
  encryptedAt: string;
}
