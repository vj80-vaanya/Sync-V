import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DashboardScreen } from './Dashboard';
import { DeviceListScreen } from './DeviceList';
import { LogsUploadScreen } from './LogsUpload';
import { FirmwareUpdateScreen } from './FirmwareUpdate';
import { SettingsScreen } from './Settings';
import { NetworkService } from '../services/NetworkService';
import { DriveCommService } from '../services/DriveCommService';
import { LogsService } from '../services/LogsService';
import { FirmwareService } from '../services/FirmwareService';
import { COLORS } from '../theme/colors';

type ScreenName = 'Dashboard' | 'DeviceList' | 'LogsUpload' | 'FirmwareUpdate' | 'Settings';

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

export const AppNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('Dashboard');

  // Service singletons
  const networkService = useMemo(() => new NetworkService(), []);
  const driveComm = useMemo(() => new DriveCommService(), []);
  const logsService = useMemo(() => new LogsService(), []);
  const firmwareService = useMemo(() => new FirmwareService(), []);

  const navigateTo = (screen: string) => setCurrentScreen(screen as ScreenName);
  const navigateBack = () => setCurrentScreen('Dashboard');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Dashboard':
        return (
          <DashboardScreen
            networkService={networkService}
            driveComm={driveComm}
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
            onNavigateBack={navigateBack}
          />
        );
      case 'FirmwareUpdate':
        return (
          <FirmwareUpdateScreen
            firmwareService={firmwareService}
            onNavigateBack={navigateBack}
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            networkService={networkService}
            onNavigateBack={navigateBack}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
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
