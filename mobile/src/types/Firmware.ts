export interface FirmwarePackage {
  id: string;
  version: string;
  deviceType: string;
  filename: string;
  size: number;
  sha256: string;
  releaseDate: string;
  description: string;
}

export interface FirmwareProgress {
  phase: 'downloading' | 'transferring' | 'verifying' | 'complete' | 'failed';
  percentage: number;
  bytesCompleted: number;
  bytesTotal: number;
  error?: string;
}

export type FirmwareUpdateStatus = 'available' | 'downloading' | 'downloaded' |
  'transferring' | 'transferred' | 'applied' | 'failed';
