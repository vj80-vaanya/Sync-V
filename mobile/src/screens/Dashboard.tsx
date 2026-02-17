import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { NetworkService } from '../services/NetworkService';
import { DriveCommService } from '../services/DriveCommService';
import { NetworkState } from '../types/Network';

interface FleetStats {
  driveConnected: boolean;
  cloudReachable: boolean;
  filesOnDrive: number;
  pendingUploads: number;
  firmwareUpdates: number;
}

interface DashboardProps {
  networkService: NetworkService;
  driveComm: DriveCommService;
  onNavigate: (screen: string) => void;
}

const StatusBadge: React.FC<{ label: string; status: 'ok' | 'warn' | 'error' }> = ({ label, status }) => {
  const colors = { ok: '#22c55e', warn: '#f59e0b', error: '#ef4444' };
  return (
    <View style={[styles.badge, { backgroundColor: colors[status] + '18', borderColor: colors[status] }]}>
      <View style={[styles.badgeDot, { backgroundColor: colors[status] }]} />
      <Text style={[styles.badgeText, { color: colors[status] }]}>{label}</Text>
    </View>
  );
};

const QuickActionCard: React.FC<{ title: string; subtitle: string; icon: string; onPress: () => void }> = ({
  title, subtitle, icon, onPress,
}) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.actionIcon}>{icon}</Text>
    <Text style={styles.actionTitle}>{title}</Text>
    <Text style={styles.actionSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

export const DashboardScreen: React.FC<DashboardProps> = ({ networkService, driveComm, onNavigate }) => {
  const [stats, setStats] = useState<FleetStats>({
    driveConnected: false,
    cloudReachable: false,
    filesOnDrive: 0,
    pendingUploads: 0,
    firmwareUpdates: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>(networkService.getNetworkState());

  useEffect(() => {
    const unsubscribe = networkService.onStateChange(setNetworkState);
    return unsubscribe;
  }, [networkService]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const connected = driveComm.isConnected();
      let fileCount = 0;
      if (connected) {
        const files = await driveComm.getFileList();
        fileCount = files.length;
      }
      setStats({
        driveConnected: connected,
        cloudReachable: networkState.isCloudReachable,
        filesOnDrive: fileCount,
        pendingUploads: 0,
        firmwareUpdates: 0,
      });
    } catch {
      // Connection lost during refresh
    }
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6366f1" />}
    >
      <Text style={styles.header}>Sync-V Dashboard</Text>
      <Text style={styles.subheader}>Industrial IoT Fleet Manager</Text>

      {/* Connection Status */}
      <View style={styles.statusRow}>
        <StatusBadge label="Drive" status={stats.driveConnected ? 'ok' : 'error'} />
        <StatusBadge label="Cloud" status={stats.cloudReachable ? 'ok' : 'error'} />
        <StatusBadge label={networkState.connectionType.toUpperCase()} status={networkState.isConnected ? 'ok' : 'warn'} />
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.filesOnDrive}</Text>
          <Text style={styles.statLabel}>Files on Drive</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.pendingUploads}</Text>
          <Text style={styles.statLabel}>Pending Uploads</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.firmwareUpdates}</Text>
          <Text style={styles.statLabel}>FW Updates</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <QuickActionCard
          title="Devices"
          subtitle="View connected devices"
          icon="D"
          onPress={() => onNavigate('DeviceList')}
        />
        <QuickActionCard
          title="Upload Logs"
          subtitle="Sync logs to cloud"
          icon="L"
          onPress={() => onNavigate('LogsUpload')}
        />
        <QuickActionCard
          title="Firmware"
          subtitle="Check for updates"
          icon="F"
          onPress={() => onNavigate('FirmwareUpdate')}
        />
        <QuickActionCard
          title="Settings"
          subtitle="Configure connection"
          icon="S"
          onPress={() => onNavigate('Settings')}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    paddingTop: 48,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subheader: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6366f1',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366f1',
    backgroundColor: '#eef2ff',
    width: 36,
    height: 36,
    borderRadius: 8,
    textAlign: 'center',
    lineHeight: 36,
    overflow: 'hidden',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
});
