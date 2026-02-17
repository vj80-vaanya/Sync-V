import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { NetworkService } from '../services/NetworkService';
import { DriveCommService } from '../services/DriveCommService';
import { NetworkState } from '../types/Network';
import { COLORS } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - CARD_GAP) / 2;

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
  const colorMap = { ok: COLORS.success, warn: COLORS.warning, error: COLORS.danger };
  const bgMap = { ok: COLORS.successBg, warn: COLORS.warningBg, error: COLORS.dangerBg };
  return (
    <View style={[styles.badge, { backgroundColor: bgMap[status], borderColor: colorMap[status] }]}>
      <View style={[styles.badgeDot, { backgroundColor: colorMap[status] }]} />
      <Text style={[styles.badgeText, { color: colorMap[status] }]}>{label}</Text>
    </View>
  );
};

const StatCard: React.FC<{ value: number; label: string; accent?: string }> = ({
  value, label, accent = COLORS.primary,
}) => (
  <View style={[styles.statCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
    <Text style={[styles.statNumber, { color: accent }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const QuickActionCard: React.FC<{
  title: string; subtitle: string; icon: string; onPress: () => void;
}> = ({ title, subtitle, icon, onPress }) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.6}>
    <View style={styles.actionIconWrap}>
      <Text style={styles.actionIcon}>{icon}</Text>
    </View>
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

  const refresh = useCallback(async () => {
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
  }, [driveComm, networkState.isCloudReachable]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.header}>Sync-V</Text>
        <Text style={styles.subheader}>Industrial IoT Fleet Manager</Text>
      </View>

      {/* Connection Status */}
      <View style={styles.statusRow}>
        <StatusBadge label="Drive" status={stats.driveConnected ? 'ok' : 'error'} />
        <StatusBadge label="Cloud" status={stats.cloudReachable ? 'ok' : 'error'} />
        <StatusBadge
          label={networkState.connectionType.toUpperCase()}
          status={networkState.isConnected ? 'ok' : 'warn'}
        />
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <StatCard value={stats.filesOnDrive} label="Files on Drive" accent={COLORS.primary} />
        <StatCard value={stats.pendingUploads} label="Pending Uploads" accent={COLORS.warning} />
        <StatCard value={stats.firmwareUpdates} label="FW Updates" accent={COLORS.success} />
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
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 32,
  },
  headerSection: {
    marginBottom: 20,
  },
  header: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: -0.8,
  },
  subheader: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
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
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statNumber: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  actionCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  actionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 3,
  },
});
