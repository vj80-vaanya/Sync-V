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
