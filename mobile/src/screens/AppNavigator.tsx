import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { DashboardScreen } from './Dashboard';
import { DeviceListScreen } from './DeviceList';
import { LogsUploadScreen } from './LogsUpload';
import { FirmwareUpdateScreen } from './FirmwareUpdate';
import { SettingsScreen } from './Settings';
import { NetworkService } from '../services/NetworkService';
import { DriveCommService } from '../services/DriveCommService';
import { LogsService } from '../services/LogsService';
import { FirmwareService } from '../services/FirmwareService';

type ScreenName = 'Dashboard' | 'DeviceList' | 'LogsUpload' | 'FirmwareUpdate' | 'Settings';

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

  return <View style={styles.container}>{renderScreen()}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
