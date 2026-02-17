import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { DriveCommService } from '../services/DriveCommService';
import { MetadataParserRegistry } from '../parsers/MetadataParser';
import { DeviceMetadata, FileInfo } from '../types/Device';

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
      <View>
        <Text style={styles.deviceName}>{device.id}</Text>
        <Text style={styles.deviceType}>Type: {device.type}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: device.status === 'online' ? '#22c55e' : '#94a3b8' }]} />
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
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Devices</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>!</Text>
          <Text style={styles.emptyTitle}>Connection Issue</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDevices}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : devices.length === 0 && !refreshing ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>D</Text>
          <Text style={styles.emptyTitle}>No Devices Found</Text>
          <Text style={styles.emptySubtitle}>Connect to a Sync-V Drive to see devices.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDevices}>
            <Text style={styles.retryText}>Scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DeviceCard device={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDevices} tintColor="#6366f1" />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backText: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerSpacer: {
    width: 60,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  deviceType: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  cardBody: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  infoValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 32,
    fontWeight: '700',
    color: '#cbd5e1',
    backgroundColor: '#f1f5f9',
    width: 64,
    height: 64,
    borderRadius: 32,
    textAlign: 'center',
    lineHeight: 64,
    overflow: 'hidden',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
