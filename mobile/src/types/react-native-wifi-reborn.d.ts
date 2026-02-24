declare module 'react-native-wifi-reborn' {
  interface WifiEntry {
    SSID: string;
    BSSID: string;
    capabilities: string;
    frequency: number;
    level: number;
    timestamp: number;
  }

  const WifiManager: {
    loadWifiList(): Promise<WifiEntry[]>;
    connectToProtectedSSID(
      ssid: string,
      password: string,
      isWep: boolean,
      isHidden: boolean,
    ): Promise<void>;
    disconnect(): Promise<void>;
    getCurrentWifiSSID(): Promise<string>;
  };

  export default WifiManager;
}
