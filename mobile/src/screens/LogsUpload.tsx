import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { LogsService } from '../services/LogsService';
import { DriveCommService } from '../services/DriveCommService';
import { NetworkService } from '../services/NetworkService';
import { LogFile, LogUploadStatus } from '../types/Log';
import { NetworkState } from '../types/Network';
import { COLORS } from '../theme/colors';

interface LogsUploadProps {
  logsService: LogsService;
  driveComm: DriveCommService;
  networkService: NetworkService;
  onNavigateBack: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  uploading: '#3b82f6',
  uploaded: '#22c55e',
  failed: '#ef4444',
  purged: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  failed: 'Failed',
  purged: 'Purged',
};

const LogItem: React.FC<{
  log: LogFile;
  status?: LogUploadStatus;
  onUpload: () => void;
  onPurge: () => void;
}> = ({ log, status, onUpload, onPurge }) => (
  <View style={styles.logCard}>
    <View style={styles.logHeader}>
      <View style={styles.logInfo}>
        <Text style={styles.logFilename} numberOfLines={1}>{log.filename}</Text>
        <Text style={styles.logMeta}>
          {(log.size / 1024).toFixed(1)} KB  |  {log.deviceId}
        </Text>
      </View>
      {status && (
        <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[status] || '#94a3b8') + '18' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[status] || '#94a3b8' }]}>
            {STATUS_LABELS[status] || status}
          </Text>
        </View>
      )}
    </View>

    <View style={styles.logActions}>
      {(!status || status === 'pending' || status === 'failed') && (
        <TouchableOpacity style={styles.uploadButton} onPress={onUpload} activeOpacity={0.7}>
          <Text style={styles.uploadButtonText}>Upload</Text>
        </TouchableOpacity>
      )}
      {status === 'uploaded' && (
        <TouchableOpacity style={styles.purgeButton} onPress={onPurge} activeOpacity={0.7}>
          <Text style={styles.purgeButtonText}>Purge</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

export const LogsUploadScreen: React.FC<LogsUploadProps> = ({ logsService, driveComm, networkService, onNavigateBack }) => {
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, LogUploadStatus>>({});
  const [networkState, setNetworkState] = useState<NetworkState>(networkService.getNetworkState());
  const queueCount = logsService.getUploadQueue().length;

  useEffect(() => {
    return networkService.onStateChange(setNetworkState);
  }, [networkService]);

  const loadLogs = async () => {
    setRefreshing(true);
    try {
      // Try drive logs first, fall back to cloud logs
      let allLogs = await logsService.getLogsFromDrive();
      if (allLogs.length === 0) {
        allLogs = await logsService.getLogsFromCloud();
      }
      setLogs(allLogs);

      const newStatuses: Record<string, LogUploadStatus> = {};
      for (const log of allLogs) {
        const status = logsService.getLogStatus(log.filename);
        if (status) newStatuses[log.filename] = status;
      }
      setStatusMap(newStatuses);
    } catch {
      // Handle error
    }
    setRefreshing(false);
  };

  useEffect(() => { loadLogs(); }, []);

  const handleUpload = async (log: LogFile) => {
    const result = await logsService.uploadToCloud(log);
    setStatusMap((prev) => ({ ...prev, [log.filename]: result.status }));
  };

  const handlePurge = async (filename: string) => {
    const success = await logsService.purgeUploadedLog(filename);
    if (success) {
      setStatusMap((prev) => ({ ...prev, [filename]: 'purged' }));
    }
  };

  const handleUploadAll = async () => {
    for (const log of logs) {
      const status = statusMap[log.filename];
      if (!status || status === 'pending' || status === 'failed') {
        await handleUpload(log);
      }
    }
  };

  const handleProcessQueue = async () => {
    const result = await logsService.processUploadQueue();
    // Refresh status map
    const newStatuses: Record<string, LogUploadStatus> = { ...statusMap };
    for (const log of logs) {
      const status = logsService.getLogStatus(log.filename);
      if (status) newStatuses[log.filename] = status;
    }
    setStatusMap(newStatuses);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Upload</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Cloud Status */}
      <View style={styles.cloudStatus}>
        <View style={[styles.cloudDot, {
          backgroundColor: networkState.isCloudReachable ? COLORS.success : COLORS.danger,
        }]} />
        <Text style={styles.cloudStatusText}>
          Cloud: {networkState.isCloudReachable ? 'Connected' : 'Offline'}
        </Text>
      </View>

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionButton} onPress={handleUploadAll} activeOpacity={0.7}>
          <Text style={styles.actionButtonText}>Upload All</Text>
        </TouchableOpacity>
        {queueCount > 0 && (
          <TouchableOpacity style={[styles.actionButton, styles.queueButton]} onPress={handleProcessQueue} activeOpacity={0.7}>
            <Text style={styles.actionButtonText}>Process Queue ({queueCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      {logs.length === 0 && !refreshing ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>L</Text>
          <Text style={styles.emptyTitle}>No Logs Available</Text>
          <Text style={styles.emptySubtitle}>
            Connect to the Sync-V Drive and pull to refresh.
          </Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.filename}
          renderItem={({ item }) => (
            <LogItem
              log={item}
              status={statusMap[item.filename]}
              onUpload={() => handleUpload(item)}
              onPurge={() => handlePurge(item.filename)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadLogs} tintColor="#6366f1" />}
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
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backText: { fontSize: 16, color: '#6366f1', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  headerSpacer: { width: 60 },
  cloudStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  cloudDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cloudStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  queueButton: {
    backgroundColor: '#f59e0b',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  logInfo: { flex: 1, marginRight: 8 },
  logFilename: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  logMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  logActions: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#eef2ff',
    borderRadius: 6,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#6366f1',
    fontSize: 13,
    fontWeight: '600',
  },
  purgeButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    alignItems: 'center',
  },
  purgeButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 32, fontWeight: '700', color: '#cbd5e1', backgroundColor: '#f1f5f9',
    width: 64, height: 64, borderRadius: 32, textAlign: 'center', lineHeight: 64,
    overflow: 'hidden', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
});
