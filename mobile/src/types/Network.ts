export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface NetworkState {
  isConnected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none';
  isDriveReachable: boolean;
  isCloudReachable: boolean;
}

export interface WiFiNetwork {
  SSID: string;
  BSSID: string;
  capabilities: string;
  frequency: number;
  level: number;
  timestamp: number;
}

export type DriveConnectionPhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'failed';

export interface DriveConnectionState {
  phase: DriveConnectionPhase;
  ssid: string | null;
  address: string | null;
  port: number;
  error: string | null;
}
