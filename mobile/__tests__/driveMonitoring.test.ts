import { NetworkService } from '../src/services/NetworkService';
import { DriveCommService } from '../src/services/DriveCommService';

// Mock CloudApiService so NetworkService can be constructed
jest.mock('../src/services/CloudApiService', () => ({
  CloudApiService: jest.fn().mockImplementation(() => ({
    checkHealth: jest.fn().mockResolvedValue(false),
    onAuthChange: jest.fn(() => () => {}),
    getBaseUrl: jest.fn(() => ''),
  })),
}));

describe('NetworkService — drive monitoring', () => {
  let networkService: NetworkService;
  let driveComm: DriveCommService;

  beforeEach(() => {
    jest.useFakeTimers();
    networkService = new NetworkService();
    driveComm = new DriveCommService();
    networkService.setDriveComm(driveComm);
  });

  afterEach(() => {
    networkService.stopDriveMonitoring();
    networkService.stopCloudMonitoring();
    jest.useRealTimers();
  });

  describe('setDriveComm', () => {
    it('stores drive comm reference', () => {
      // checkDriveNow should not throw after setting comm
      expect(() => networkService.checkDriveNow()).not.toThrow();
    });
  });

  describe('checkDriveNow', () => {
    it('returns false when driveComm is not set', async () => {
      const svc = new NetworkService();
      const result = await svc.checkDriveNow();
      expect(result).toBe(false);
    });

    it('returns false when ping fails (no real server)', async () => {
      const result = await networkService.checkDriveNow();
      expect(result).toBe(false);
    });

    it('updates network state isDriveReachable based on ping', async () => {
      // Spy on pingDrive to return true
      jest.spyOn(driveComm, 'pingDrive').mockResolvedValue(true);
      await networkService.checkDriveNow();
      expect(networkService.getNetworkState().isDriveReachable).toBe(true);
    });

    it('notifies listeners on state change', async () => {
      const listener = jest.fn();
      networkService.onStateChange(listener);

      jest.spyOn(driveComm, 'pingDrive').mockResolvedValue(true);
      await networkService.checkDriveNow();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isDriveReachable: true }),
      );
    });
  });

  describe('startDriveMonitoring / stopDriveMonitoring', () => {
    it('calls checkDriveNow immediately on start', () => {
      const spy = jest.spyOn(networkService, 'checkDriveNow').mockResolvedValue(false);
      networkService.startDriveMonitoring(1000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('calls checkDriveNow periodically', () => {
      const spy = jest.spyOn(networkService, 'checkDriveNow').mockResolvedValue(false);
      networkService.startDriveMonitoring(1000);

      jest.advanceTimersByTime(3000);
      // 1 immediate + 3 interval calls
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('stopDriveMonitoring stops polling', () => {
      const spy = jest.spyOn(networkService, 'checkDriveNow').mockResolvedValue(false);
      networkService.startDriveMonitoring(1000);
      networkService.stopDriveMonitoring();

      jest.advanceTimersByTime(5000);
      // Only the immediate call
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('startDriveMonitoring stops previous timer', () => {
      const spy = jest.spyOn(networkService, 'checkDriveNow').mockResolvedValue(false);
      networkService.startDriveMonitoring(1000);
      networkService.startDriveMonitoring(1000);

      jest.advanceTimersByTime(1000);
      // 2 immediate calls + 1 interval = 3
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('uses DRIVE_CONFIG.pingIntervalMs as default interval', () => {
      const spy = jest.spyOn(networkService, 'checkDriveNow').mockResolvedValue(false);
      networkService.startDriveMonitoring(); // default 5000ms

      jest.advanceTimersByTime(5000);
      // 1 immediate + 1 interval
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
