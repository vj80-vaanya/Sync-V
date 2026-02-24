import { DriveCommService, DriveConnectionError } from '../src/services/DriveCommService';

describe('DriveCommService — real endpoint management', () => {
  let service: DriveCommService;

  beforeEach(() => {
    service = new DriveCommService();
  });

  describe('setDriveEndpoint / clearDriveEndpoint', () => {
    it('sets real endpoint and marks connected', () => {
      service.setDriveEndpoint('192.168.4.1', 8080, 'tok123');
      expect(service.isConnected()).toBe(true);
      expect(service.getDriveEndpoint()).toEqual({
        address: '192.168.4.1',
        port: 8080,
        token: 'tok123',
      });
    });

    it('clearDriveEndpoint disconnects', () => {
      service.setDriveEndpoint('192.168.4.1', 8080, 'tok');
      service.clearDriveEndpoint();
      expect(service.isConnected()).toBe(false);
      expect(service.getDriveEndpoint().address).toBeNull();
    });
  });

  describe('pingDrive', () => {
    it('returns false when no endpoint set', async () => {
      const result = await service.pingDrive();
      expect(result).toBe(false);
    });

    it('returns false when fetch fails', async () => {
      service.setDriveEndpoint('192.168.4.1', 8080, '');
      // Global fetch is not available in Node test env, so it will throw
      const result = await service.pingDrive();
      expect(result).toBe(false);
    });
  });

  describe('driveRequest', () => {
    it('throws when no endpoint set', async () => {
      await expect(service.driveRequest('GET', '/health')).rejects.toThrow(
        DriveConnectionError,
      );
    });
  });

  describe('real-mode branching in discoverDrive', () => {
    it('falls back to mock when no real endpoint', async () => {
      service.setMockDriveAddress('10.0.0.1', 9090);
      const result = await service.discoverDrive();
      expect(result.found).toBe(true);
      expect(result.address).toBe('10.0.0.1');
    });

    it('uses real endpoint when set (ping fails → not found)', async () => {
      service.setDriveEndpoint('192.168.4.1', 8080, '');
      // ping will fail in test env (no server)
      const result = await service.discoverDrive();
      expect(result.found).toBe(false);
    });
  });

  describe('mock mode still works unchanged', () => {
    it('getFileList returns mock files', async () => {
      service.setMockDriveAddress('10.0.0.1', 9090);
      await service.discoverDrive();
      service.setMockFileList([{ name: 'log.csv', size: 100 }]);
      const files = await service.getFileList();
      expect(files).toEqual([{ name: 'log.csv', size: 100 }]);
    });

    it('getFileContent returns mock content', async () => {
      service.setMockDriveAddress('10.0.0.1', 9090);
      await service.discoverDrive();
      service.setMockFileContent('data.txt', 'hello');
      const result = await service.getFileContent('data.txt');
      expect(result).toEqual({ success: true, data: 'hello' });
    });

    it('sendFirmware returns true in mock mode', async () => {
      service.setMockDriveAddress('10.0.0.1', 9090);
      await service.discoverDrive();
      const result = await service.sendFirmware('fw.bin', 'binary');
      expect(result).toBe(true);
    });

    it('throws when not connected', async () => {
      await expect(service.getFileList()).rejects.toThrow('Not connected to drive');
    });
  });
});
