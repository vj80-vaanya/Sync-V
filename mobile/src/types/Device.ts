export interface DeviceMetadata {
  deviceId: string;
  deviceType: string;
  firmwareVersion: string;
  fields: Record<string, string>;
  parseSuccessful: boolean;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline' | 'unknown';
  firmwareVersion: string;
  lastSeen: string;
  metadata: Record<string, string>;
}

export interface FileInfo {
  name: string;
  size: number;
}

export interface FileResult {
  success: boolean;
  data: string;
  errorMessage?: string;
}
