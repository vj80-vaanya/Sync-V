import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { DriveCommService } from '../services/DriveCommService';
import { MetadataParserRegistry } from '../parsers/MetadataParser';
import { DeviceMetadata, FileInfo } from '../types/Device';
import { COLORS } from '../theme/colors';

interface DeviceListProps {
  driveComm: DriveCommService;
  onNavigateBack: () => void;
}

interface DeviceItem {
  id: string;
  name: string;
  type: string;
  firmware: string;
  status: 'online' | 'offline';
  fields: Record<string, string>;
}

const DeviceCard: React.FC<{ device: DeviceItem }> = ({ device }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderLeft}>
        <View style={styles.deviceIconWrap}>
          <Text style={styles.deviceIconText}>{device.type.charAt(0).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.deviceName}>{device.id}</Text>
          <Text style={styles.deviceType}>{device.type}</Text>
        </View>
      </View>
      <View style={[
        styles.statusPill,
        { backgroundColor: device.status === 'online' ? COLORS.successBg : COLORS.borderLight },
      ]}>
        <View style={[
          styles.statusDot,
          { backgroundColor: device.status === 'online' ? COLORS.success : COLORS.textMuted },
        ]} />
        <Text style={[
          styles.statusLabel,
          { color: device.status === 'online' ? COLORS.success : COLORS.textMuted },
        ]}>
          {device.status}
        </Text>
      </View>
    </View>

    <View style={styles.cardBody}>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Firmware</Text>
        <Text style={styles.infoValue}>{device.firmware || 'Unknown'}</Text>
      </View>
      {Object.entries(device.fields).slice(0, 3).map(([key, value]) => (
        <View style={styles.infoRow} key={key}>
          <Text style={styles.infoLabel}>{key.replace(/_/g, ' ')}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  </View>
);

export const DeviceListScreen: React.FC<DeviceListProps> = ({ driveComm, onNavigateBack }) => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parser = new MetadataParserRegistry();

  const loadDevices = async () => {
    setRefreshing(true);
    setError(null);
    try {
      if (!driveComm.isConnected()) {
        setError('Drive not connected. Connect to the Sync-V Drive Wi-Fi network.');
        setRefreshing(false);
        return;
      }

      const files = await driveComm.getFileList();
      const metadataFiles = files.filter((f: FileInfo) =>
        f.name.endsWith('.json') || f.name.includes('metadata')
      );

      const deviceItems: DeviceItem[] = [];
      for (const file of metadataFiles) {
        const result = await driveComm.getFileContent(file.name);
        if (result.success) {
          const meta = parser.parse(result.data, file.name.includes('typeB') ? 'typeB' : 'typeA');
          if (meta.parseSuccessful) {
            deviceItems.push({
              id: meta.deviceId,
              name: meta.deviceId,
              type: meta.deviceType,
              firmware: meta.firmwareVersion,
              status: 'online',
              fields: meta.fields,
            });
          }
        }
      }
      setDevices(deviceItems);
    } catch {
      setError('Failed to load devices from drive.');
    }
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton} activeOpacity={0.6}>
          <Text style={styles.backArrow}>{'<'}</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Devices</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Device count badge */}
      {!error && devices.length > 0 && (
        <View style={styles.countBar}>
          <Text style={styles.countText}>{devices.length} device{devices.length !== 1 ? 's' : ''} found</Text>
        </View>
      )}

      {error ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIconText}>!</Text>
          </View>
          <Text style={styles.emptyTitle}>Connection Issue</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDevices} activeOpacity={0.7}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : devices.length === 0 && !refreshing ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIconText}>D</Text>
          </View>
          <Text style={styles.emptyTitle}>No Devices Found</Text>
          <Text style={styles.emptySubtitle}>Connect to a Sync-V Drive to see devices.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDevices} activeOpacity={0.7}>
            <Text style={styles.retryText}>Scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DeviceCard device={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDevices} tintColor={COLORS.primary} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 16,
  },
  backArrow: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '600',
    marginRight: 4,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  headerSpacer: {
    width: 70,
  },
  countBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryLight,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  deviceType: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cardBody: {
    gap: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    textTransform: 'capitalize',
  },
  infoValue: {
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textMid,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
