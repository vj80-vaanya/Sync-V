import { NetworkState } from '../types/Network';

type StateChangeCallback = (state: NetworkState) => void;

export class NetworkService {
  private state: NetworkState = {
    isConnected: false,
    connectionType: 'none',
    isDriveReachable: false,
    isCloudReachable: false,
  };

  private listeners: Set<StateChangeCallback> = new Set();

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
