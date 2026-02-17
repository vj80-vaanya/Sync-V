export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface NetworkState {
  isConnected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none';
  isDriveReachable: boolean;
  isCloudReachable: boolean;
}
