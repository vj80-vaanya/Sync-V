import { NetworkState } from '../types/Network';
import { CloudApiService } from './CloudApiService';
import { DriveCommService } from './DriveCommService';
import { CLOUD_CONFIG, DRIVE_CONFIG } from '../config';

type StateChangeCallback = (state: NetworkState) => void;

export class NetworkService {
  private state: NetworkState = {
    isConnected: false,
    connectionType: 'none',
    isDriveReachable: false,
    isCloudReachable: false,
  };

  private listeners: Set<StateChangeCallback> = new Set();
  private cloudApi: CloudApiService | null = null;
  private driveComm: DriveCommService | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private driveMonitorTimer: ReturnType<typeof setInterval> | null = null;

  getNetworkState(): NetworkState {
    return { ...this.state };
  }

  setNetworkState(state: NetworkState): void {
    this.state = { ...state };
    this.notifyListeners();
  }

  canReachDrive(): boolean {
    return this.state.isDriveReachable;
  }

  canReachCloud(): boolean {
    return this.state.isCloudReachable;
  }

  isOffline(): boolean {
    return !this.state.isConnected;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // --- Real Cloud Monitoring ---

  setCloudApi(api: CloudApiService): void {
    this.cloudApi = api;
  }

  async checkCloudNow(): Promise<boolean> {
    if (!this.cloudApi) return false;
    const reachable = await this.cloudApi.checkHealth();
    const changed = this.state.isCloudReachable !== reachable;
    this.state.isCloudReachable = reachable;
    this.state.isConnected = reachable || this.state.isDriveReachable;
    if (reachable && this.state.connectionType === 'none') {
      this.state.connectionType = 'cellular';
    }
    if (changed) this.notifyListeners();
    return reachable;
  }

  startCloudMonitoring(intervalMs?: number): void {
    this.stopCloudMonitoring();
    // Check immediately
    this.checkCloudNow();
    // Then poll
    this.monitorTimer = setInterval(
      () => this.checkCloudNow(),
      intervalMs || CLOUD_CONFIG.monitorIntervalMs,
    );
  }

  stopCloudMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  // --- Drive Monitoring ---

  setDriveComm(comm: DriveCommService): void {
    this.driveComm = comm;
  }

  async checkDriveNow(): Promise<boolean> {
    if (!this.driveComm) return false;
    const reachable = await this.driveComm.pingDrive();
    this.setDriveReachable(reachable);
    return reachable;
  }

  startDriveMonitoring(intervalMs?: number): void {
    this.stopDriveMonitoring();
    this.checkDriveNow();
    this.driveMonitorTimer = setInterval(
      () => this.checkDriveNow(),
      intervalMs || DRIVE_CONFIG.pingIntervalMs,
    );
  }

  stopDriveMonitoring(): void {
    if (this.driveMonitorTimer) {
      clearInterval(this.driveMonitorTimer);
      this.driveMonitorTimer = null;
    }
  }

  // Update drive reachability (called when drive connects/disconnects)
  setDriveReachable(reachable: boolean): void {
    const changed = this.state.isDriveReachable !== reachable;
    this.state.isDriveReachable = reachable;
    this.state.isConnected = reachable || this.state.isCloudReachable;
    if (reachable) {
      this.state.connectionType = 'wifi';
    } else if (this.state.isCloudReachable) {
      this.state.connectionType = 'cellular';
    } else {
      this.state.connectionType = 'none';
    }
    if (changed) this.notifyListeners();
  }

  private notifyListeners(): void {
    const stateCopy = { ...this.state };
    for (const listener of this.listeners) {
      try {
        listener(stateCopy);
      } catch {
        // Listener error should not break notification chain
      }
    }
  }
}
