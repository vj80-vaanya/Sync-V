import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { FirmwareService } from '../services/FirmwareService';
import { NetworkService } from '../services/NetworkService';
import { FirmwarePackage, FirmwareProgress } from '../types/Firmware';
import { NetworkState } from '../types/Network';
import { COLORS } from '../theme/colors';

interface FirmwareUpdateProps {
  firmwareService: FirmwareService;
  networkService: NetworkService;
  onNavigateBack: () => void;
}

const ProgressBar: React.FC<{ progress: number; color?: string }> = ({ progress, color = '#6366f1' }) => (
  <View style={styles.progressTrack}>
    <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: color }]} />
  </View>
);

const FirmwareCard: React.FC<{
  firmware: FirmwarePackage;
  progress?: FirmwareProgress;
  onUpdateDrive: () => void;
  isUpdating: boolean;
}> = ({ firmware, progress, onUpdateDrive, isUpdating }) => (
  <View style={styles.fwCard}>
    <View style={styles.fwHeader}>
      <View>
        <Text style={styles.fwVersion}>v{firmware.version}</Text>
        <Text style={styles.fwType}>Device Type: {firmware.deviceType}</Text>
      </View>
      <View style={styles.fwSizeBadge}>
        <Text style={styles.fwSizeText}>{(firmware.size / 1024).toFixed(0)} KB</Text>
      </View>
    </View>

    {firmware.description ? (
      <Text style={styles.fwDescription}>{firmware.description}</Text>
    ) : null}

    <Text style={styles.fwDate}>Released: {firmware.releaseDate}</Text>

    {/* Security notice */}
    <View style={styles.securityNotice}>
      <Text style={styles.securityText}>
        Firmware is encrypted in transit. Not stored on this device.
      </Text>
    </View>

    {progress && (
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressPhase}>
            {progress.phase === 'downloading' ? 'Downloading from cloud...' :
             progress.phase === 'transferring' ? 'Transferring to drive (encrypted)...' :
             progress.phase === 'verifying' ? 'Verifying integrity...' :
             progress.phase === 'complete' ? 'Complete — firmware delivered' :
             progress.phase === 'failed' ? 'Failed' : progress.phase}
          </Text>
          <Text style={styles.progressPct}>{Math.round(progress.percentage)}%</Text>
        </View>
        <ProgressBar
          progress={progress.percentage}
          color={progress.phase === 'failed' ? '#ef4444' : progress.phase === 'complete' ? '#22c55e' : '#6366f1'}
        />
        {progress.error && <Text style={styles.errorText}>{progress.error}</Text>}
      </View>
    )}

    <View style={styles.fwActions}>
      {(!progress || progress.phase === 'failed') && (
        <TouchableOpacity
          style={[styles.updateButton, isUpdating && styles.updateButtonDisabled]}
          onPress={onUpdateDrive}
          disabled={isUpdating}
          activeOpacity={0.7}
        >
          <Text style={styles.updateButtonText}>
            {isUpdating ? 'Updating...' : 'Update Drive'}
          </Text>
        </TouchableOpacity>
      )}
      {progress?.phase === 'complete' && (
        <View style={styles.completeBadge}>
          <Text style={styles.completeText}>Firmware delivered to drive</Text>
        </View>
      )}
    </View>
  </View>
);

export const FirmwareUpdateScreen: React.FC<FirmwareUpdateProps> = ({ firmwareService, networkService, onNavigateBack }) => {
  const [available, setAvailable] = useState<FirmwarePackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, FirmwareProgress>>({});
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [networkState, setNetworkState] = useState<NetworkState>(networkService.getNetworkState());

  useEffect(() => {
    return networkService.onStateChange(setNetworkState);
  }, [networkService]);

  const checkUpdates = async () => {
    setRefreshing(true);
    try {
      const updates = await firmwareService.checkForUpdates('typeA', '1.0.0');
      setAvailable(updates);
    } catch {
      // Handle error
    }
    setRefreshing(false);
  };

  const handleUpdateDrive = async (fw: FirmwarePackage) => {
    setUpdatingIds((prev) => new Set(prev).add(fw.id));
    firmwareService.onProgress((p) => {
      setProgressMap((prev) => ({ ...prev, [fw.id]: { ...p } }));
    });
    await firmwareService.downloadAndTransfer(fw);
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(fw.id);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Firmware Updates</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.cloudStatus}>
        <View style={[styles.cloudDot, {
          backgroundColor: networkState.isCloudReachable ? COLORS.success : COLORS.danger,
        }]} />
        <Text style={styles.cloudStatusText}>
          Cloud: {networkState.isCloudReachable ? 'Connected — will fetch from server' : 'Offline — cannot download firmware'}
        </Text>
      </View>

      {/* Encryption Info Banner */}
      <View style={styles.encryptionBanner}>
        <Text style={styles.encryptionBannerText}>
          Firmware is encrypted during transfer and never stored on this device.
        </Text>
      </View>

      <TouchableOpacity style={styles.checkButton} onPress={checkUpdates} activeOpacity={0.7}>
        <Text style={styles.checkButtonText}>Check for Updates</Text>
      </TouchableOpacity>

      {available.length === 0 && !refreshing ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>F</Text>
          <Text style={styles.emptyTitle}>No Updates Available</Text>
          <Text style={styles.emptySubtitle}>All devices are running the latest firmware.</Text>
        </View>
      ) : (
        <FlatList
          data={available}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FirmwareCard
              firmware={item}
              progress={progressMap[item.id]}
              onUpdateDrive={() => handleUpdateDrive(item)}
              isUpdating={updatingIds.has(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={checkUpdates} tintColor="#6366f1" />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backText: { fontSize: 16, color: '#6366f1', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  headerSpacer: { width: 60 },
  cloudStatus: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 6,
  },
  cloudDot: { width: 8, height: 8, borderRadius: 4 },
  cloudStatusText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  encryptionBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  encryptionBannerText: {
    fontSize: 12,
    color: '#4338ca',
    fontWeight: '500',
  },
  checkButton: {
    margin: 16, backgroundColor: '#6366f1', paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  checkButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  fwCard: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  fwHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  fwVersion: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  fwType: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  fwSizeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  fwSizeText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  fwDescription: { fontSize: 13, color: '#475569', marginBottom: 6, lineHeight: 18 },
  fwDate: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  securityNotice: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  securityText: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  progressSection: { marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressPhase: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  progressPct: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
  progressTrack: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  fwActions: { flexDirection: 'row', gap: 8 },
  updateButton: {
    flex: 1, paddingVertical: 12, backgroundColor: '#6366f1', borderRadius: 8, alignItems: 'center',
  },
  updateButtonDisabled: { opacity: 0.6 },
  updateButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  completeBadge: {
    flex: 1, paddingVertical: 10, backgroundColor: '#f0fdf4', borderRadius: 8, alignItems: 'center',
  },
  completeText: { color: '#16a34a', fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: {
    fontSize: 32, fontWeight: '700', color: '#cbd5e1', backgroundColor: '#f1f5f9',
    width: 64, height: 64, borderRadius: 32, textAlign: 'center', lineHeight: 64,
    overflow: 'hidden', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
});
