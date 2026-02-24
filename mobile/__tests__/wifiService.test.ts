import { WiFiService } from '../src/services/WiFiService';
import { WiFiNetwork } from '../src/types/Network';

function makeNetwork(overrides: Partial<WiFiNetwork> = {}): WiFiNetwork {
  return {
    SSID: 'TestNet',
    BSSID: 'aa:bb:cc:dd:ee:ff',
    capabilities: '[WPA2-PSK]',
    frequency: 2412,
    level: -50,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('WiFiService', () => {
  let service: WiFiService;

  beforeEach(() => {
    service = new WiFiService();
    service.setMockMode(true);
  });

  describe('scanNetworks', () => {
    it('returns empty list by default', async () => {
      const result = await service.scanNetworks();
      expect(result).toEqual([]);
    });

    it('returns mock networks when set', async () => {
      const nets = [makeNetwork({ SSID: 'Net1' }), makeNetwork({ SSID: 'Net2' })];
      service.setMockNetworks(nets);
      const result = await service.scanNetworks();
      expect(result).toHaveLength(2);
      expect(result[0].SSID).toBe('Net1');
    });

    it('returns a copy, not a reference', async () => {
      service.setMockNetworks([makeNetwork()]);
      const r1 = await service.scanNetworks();
      const r2 = await service.scanNetworks();
      expect(r1).not.toBe(r2);
    });
  });

  describe('scanForDrives', () => {
    it('filters to SyncV prefix by default', async () => {
      service.setMockNetworks([
        makeNetwork({ SSID: 'SyncV-Drive-001' }),
        makeNetwork({ SSID: 'HomeWiFi' }),
        makeNetwork({ SSID: 'SyncV-Drive-002' }),
      ]);
      const result = await service.scanForDrives();
      expect(result).toHaveLength(2);
      expect(result.every((n) => n.SSID.startsWith('SyncV'))).toBe(true);
    });

    it('accepts custom prefix', async () => {
      service.setMockNetworks([
        makeNetwork({ SSID: 'MyDrive-1' }),
        makeNetwork({ SSID: 'MyDrive-2' }),
        makeNetwork({ SSID: 'Other' }),
      ]);
      const result = await service.scanForDrives('MyDrive');
      expect(result).toHaveLength(2);
    });

    it('returns empty when no matches', async () => {
      service.setMockNetworks([makeNetwork({ SSID: 'Unrelated' })]);
      const result = await service.scanForDrives();
      expect(result).toHaveLength(0);
    });
  });

  describe('connectToNetwork', () => {
    it('returns true on successful connect', async () => {
      service.setMockConnectResult(true);
      const result = await service.connectToNetwork('SyncV-Drive', 'pass123');
      expect(result).toBe(true);
    });

    it('updates current SSID on success', async () => {
      service.setMockConnectResult(true);
      await service.connectToNetwork('SyncV-Drive', 'pass123');
      const ssid = await service.getCurrentSSID();
      expect(ssid).toBe('SyncV-Drive');
    });

    it('returns false on failure', async () => {
      service.setMockConnectResult(false);
      const result = await service.connectToNetwork('SyncV-Drive', 'wrong');
      expect(result).toBe(false);
    });

    it('does not update SSID on failure', async () => {
      service.setMockConnectResult(false);
      await service.connectToNetwork('SyncV-Drive', 'wrong');
      const ssid = await service.getCurrentSSID();
      expect(ssid).toBe('');
    });
  });

  describe('disconnect', () => {
    it('clears current SSID', async () => {
      service.setMockConnectResult(true);
      await service.connectToNetwork('SyncV-Drive', 'pass');
      await service.disconnect();
      const ssid = await service.getCurrentSSID();
      expect(ssid).toBe('');
    });
  });

  describe('getCurrentSSID', () => {
    it('returns empty string initially', async () => {
      const ssid = await service.getCurrentSSID();
      expect(ssid).toBe('');
    });

    it('returns mock SSID when set directly', async () => {
      service.setMockCurrentSSID('TestSSID');
      const ssid = await service.getCurrentSSID();
      expect(ssid).toBe('TestSSID');
    });
  });

  describe('requestPermissions', () => {
    it('returns true in mock mode', async () => {
      const result = await service.requestPermissions();
      expect(result).toBe(true);
    });
  });
});
