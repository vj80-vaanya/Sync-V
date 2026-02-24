import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DashboardScreen } from './Dashboard';
import { DeviceListScreen } from './DeviceList';
import { LogsUploadScreen } from './LogsUpload';
import { FirmwareUpdateScreen } from './FirmwareUpdate';
import { SettingsScreen } from './Settings';
import { WiFiSetupScreen } from './WiFiSetup';
import { NetworkService } from '../services/NetworkService';
import { DriveCommService } from '../services/DriveCommService';
import { WiFiService } from '../services/WiFiService';
import { LogsService } from '../services/LogsService';
import { FirmwareService } from '../services/FirmwareService';
import { CloudApiService } from '../services/CloudApiService';
import { NetworkState } from '../types/Network';
import { COLORS } from '../theme/colors';

type ScreenName = 'Dashboard' | 'DeviceList' | 'LogsUpload' | 'FirmwareUpdate' | 'Settings' | 'WiFiSetup';

interface TabItem {
  key: ScreenName;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { key: 'Dashboard', label: 'Home', icon: 'H' },
  { key: 'DeviceList', label: 'Devices', icon: 'D' },
  { key: 'LogsUpload', label: 'Logs', icon: 'L' },
  { key: 'FirmwareUpdate', label: 'Firmware', icon: 'F' },
  { key: 'Settings', label: 'Settings', icon: 'S' },
];

const ConnectionStatusBar: React.FC<{ networkState: NetworkState; cloudLoggedIn: boolean }> = ({
  networkState, cloudLoggedIn,
}) => (
  <View style={statusStyles.bar}>
    <View style={statusStyles.indicator}>
      <View style={[statusStyles.dot, {
        backgroundColor: networkState.isDriveReachable ? COLORS.success : COLORS.danger,
      }]} />
      <Text style={statusStyles.label}>Drive</Text>
    </View>
    <View style={statusStyles.separator} />
    <View style={statusStyles.indicator}>
      <View style={[statusStyles.dot, {
        backgroundColor: networkState.isCloudReachable ? COLORS.success : COLORS.danger,
      }]} />
      <Text style={statusStyles.label}>Cloud</Text>
    </View>
    {networkState.isCloudReachable && (
      <>
        <View style={statusStyles.separator} />
        <View style={statusStyles.indicator}>
          <View style={[statusStyles.dot, {
            backgroundColor: cloudLoggedIn ? COLORS.success : COLORS.warning,
          }]} />
          <Text style={statusStyles.label}>{cloudLoggedIn ? 'Logged In' : 'Not Authed'}</Text>
        </View>
      </>
    )}
    <View style={{ flex: 1 }} />
    <Text style={statusStyles.connType}>
      {networkState.connectionType === 'none' ? 'Offline' : networkState.connectionType.toUpperCase()}
    </Text>
  </View>
);

const statusStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  separator: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.border,
    marginHorizontal: 10,
  },
  connType: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export const AppNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('Dashboard');
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: false, connectionType: 'none', isDriveReachable: false, isCloudReachable: false,
  });
  const [cloudLoggedIn, setCloudLoggedIn] = useState(false);

  // Service singletons
  const cloudApi = useMemo(() => new CloudApiService(), []);
  const networkService = useMemo(() => new NetworkService(), []);
  const driveComm = useMemo(() => new DriveCommService(), []);
  const logsService = useMemo(() => new LogsService(), []);
  const firmwareService = useMemo(() => new FirmwareService(), []);
  const wifiService = useMemo(() => new WiFiService(), []);

  // Wire cloud API and drive comm into services
  useEffect(() => {
    networkService.setCloudApi(cloudApi);
    networkService.setDriveComm(driveComm);
    logsService.setCloudApi(cloudApi);
    firmwareService.setCloudApi(cloudApi);

    // Start monitoring cloud connectivity
    networkService.startCloudMonitoring();

    // Listen for network state changes
    const unsubNetwork = networkService.onStateChange(setNetworkState);

    // Listen for auth changes
    const unsubAuth = cloudApi.onAuthChange(setCloudLoggedIn);

    return () => {
      networkService.stopCloudMonitoring();
      unsubNetwork();
      unsubAuth();
    };
  }, [cloudApi, networkService, logsService, firmwareService]);

  const navigateTo = (screen: string) => setCurrentScreen(screen as ScreenName);
  const navigateBack = () => setCurrentScreen('Dashboard');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Dashboard':
        return (
          <DashboardScreen
            networkService={networkService}
            driveComm={driveComm}
            logsService={logsService}
            onNavigate={navigateTo}
          />
        );
      case 'DeviceList':
        return (
          <DeviceListScreen
            driveComm={driveComm}
            onNavigateBack={navigateBack}
          />
        );
      case 'LogsUpload':
        return (
          <LogsUploadScreen
            logsService={logsService}
            driveComm={driveComm}
            networkService={networkService}
            onNavigateBack={navigateBack}
          />
        );
      case 'FirmwareUpdate':
        return (
          <FirmwareUpdateScreen
            firmwareService={firmwareService}
            networkService={networkService}
            onNavigateBack={navigateBack}
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            networkService={networkService}
            cloudApi={cloudApi}
            driveComm={driveComm}
            onNavigate={navigateTo}
            onNavigateBack={navigateBack}
          />
        );
      case 'WiFiSetup':
        return (
          <WiFiSetupScreen
            wifiService={wifiService}
            driveComm={driveComm}
            networkService={networkService}
            onNavigateBack={navigateBack}
            onConnected={() => navigateTo('Dashboard')}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Persistent Connection Status Bar */}
      <ConnectionStatusBar networkState={networkState} cloudLoggedIn={cloudLoggedIn} />

      <View style={styles.screenWrap}>{renderScreen()}</View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = currentScreen === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => navigateTo(tab.key)}
              activeOpacity={0.6}
            >
              <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{tab.icon}</Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screenWrap: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 20,
    paddingTop: 8,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabIconWrapActive: {
    backgroundColor: COLORS.primaryLight,
  },
  tabIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabIconActive: {
    color: COLORS.primary,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
