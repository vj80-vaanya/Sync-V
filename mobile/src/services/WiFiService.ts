import WifiManager from 'react-native-wifi-reborn';
import { PermissionsAndroid, Platform } from 'react-native';
import { WiFiNetwork } from '../types/Network';
import { DRIVE_CONFIG } from '../config';

export class WiFiService {
  private mockMode: boolean = false;
  private mockNetworks: WiFiNetwork[] = [];
  private mockConnectResult: boolean = true;
  private mockCurrentSSID: string = '';

  // --- Mock support ---

  setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
  }

  setMockNetworks(networks: WiFiNetwork[]): void {
    this.mockNetworks = networks;
  }

  setMockConnectResult(success: boolean): void {
    this.mockConnectResult = success;
  }

  setMockCurrentSSID(ssid: string): void {
    this.mockCurrentSSID = ssid;
  }

  // --- Permissions ---

  async requestPermissions(): Promise<boolean> {
    if (this.mockMode) return true;
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Sync-V needs location access to scan for nearby WiFi drives.',
          buttonPositive: 'Allow',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  // --- Scanning ---

  async scanNetworks(): Promise<WiFiNetwork[]> {
    if (this.mockMode) {
      return [...this.mockNetworks];
    }

    const rawList = await WifiManager.loadWifiList();
    return rawList.map((item: any) => ({
      SSID: item.SSID || '',
      BSSID: item.BSSID || '',
      capabilities: item.capabilities || '',
      frequency: item.frequency || 0,
      level: item.level || 0,
      timestamp: item.timestamp || Date.now(),
    }));
  }

  async scanForDrives(prefix?: string): Promise<WiFiNetwork[]> {
    const networks = await this.scanNetworks();
    const filter = prefix || DRIVE_CONFIG.ssidPrefix;
    return networks.filter((n) => n.SSID.startsWith(filter));
  }

  // --- Connection ---

  async connectToNetwork(ssid: string, password: string): Promise<boolean> {
    if (this.mockMode) {
      if (this.mockConnectResult) {
        this.mockCurrentSSID = ssid;
      }
      return this.mockConnectResult;
    }

    try {
      await WifiManager.connectToProtectedSSID(ssid, password, false, false);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.mockMode) {
      this.mockCurrentSSID = '';
      return;
    }
    await WifiManager.disconnect();
  }

  async getCurrentSSID(): Promise<string> {
    if (this.mockMode) {
      return this.mockCurrentSSID;
    }

    try {
      return await WifiManager.getCurrentWifiSSID();
    } catch {
      return '';
    }
  }
}
