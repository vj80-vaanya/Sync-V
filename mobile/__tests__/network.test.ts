import { NetworkService } from '../src/services/NetworkService';
import { NetworkState } from '../src/types/Network';

describe('NetworkService', () => {
  let networkService: NetworkService;

  beforeEach(() => {
    networkService = new NetworkService();
  });

  test('detects connected state', () => {
    networkService.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: true,
      isCloudReachable: true,
    });

    const state = networkService.getNetworkState();
    expect(state.isConnected).toBe(true);
    expect(state.connectionType).toBe('wifi');
  });

  test('detects disconnected state', () => {
    networkService.setNetworkState({
      isConnected: false,
      connectionType: 'none',
      isDriveReachable: false,
      isCloudReachable: false,
    });

    const state = networkService.getNetworkState();
    expect(state.isConnected).toBe(false);
  });

  test('provides offline fallback info', () => {
    networkService.setNetworkState({
      isConnected: false,
      connectionType: 'none',
      isDriveReachable: false,
      isCloudReachable: false,
    });

    expect(networkService.canReachDrive()).toBe(false);
    expect(networkService.canReachCloud()).toBe(false);
    expect(networkService.isOffline()).toBe(true);
  });

  test('notifies listeners on state change', () => {
    const callback = jest.fn();
    networkService.onStateChange(callback);

    networkService.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: true,
      isCloudReachable: false,
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ isConnected: true })
    );
  });

  test('removes listener', () => {
    const callback = jest.fn();
    const unsubscribe = networkService.onStateChange(callback);

    unsubscribe();

    networkService.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: false,
      isCloudReachable: false,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  test('distinguishes drive vs cloud reachability', () => {
    networkService.setNetworkState({
      isConnected: true,
      connectionType: 'wifi',
      isDriveReachable: true,
      isCloudReachable: false,
    });

    expect(networkService.canReachDrive()).toBe(true);
    expect(networkService.canReachCloud()).toBe(false);
  });
});
