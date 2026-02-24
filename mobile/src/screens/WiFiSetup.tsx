import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { WiFiService } from '../services/WiFiService';
import { DriveCommService } from '../services/DriveCommService';
import { NetworkService } from '../services/NetworkService';
import { WiFiNetwork, DriveConnectionPhase } from '../types/Network';
import { DRIVE_CONFIG } from '../config';
import { COLORS } from '../theme/colors';

interface WiFiSetupProps {
  wifiService: WiFiService;
  driveComm: DriveCommService;
  networkService: NetworkService;
  onNavigateBack: () => void;
  onConnected: () => void;
}

const PHASE_LABELS: Record<DriveConnectionPhase, string> = {
  idle: 'Ready to scan',
  scanning: 'Scanning for drives...',
  connecting: 'Connecting to WiFi...',
  authenticating: 'Verifying drive...',
  connected: 'Connected to drive',
  failed: 'Connection failed',
};

const PHASE_COLORS: Record<DriveConnectionPhase, string> = {
  idle: COLORS.textMuted,
  scanning: COLORS.primary,
  connecting: COLORS.warning,
  authenticating: COLORS.warning,
  connected: COLORS.success,
  failed: COLORS.danger,
};

function signalBars(level: number): string {
  if (level >= -50) return '||||';
  if (level >= -60) return '||| ';
  if (level >= -70) return '||  ';
  return '|   ';
}

function isSecured(capabilities: string): boolean {
  return /WPA|WEP|PSK/i.test(capabilities);
}

export const WiFiSetupScreen: React.FC<WiFiSetupProps> = ({
  wifiService,
  driveComm,
  networkService,
  onNavigateBack,
  onConnected,
}) => {
  const [phase, setPhase] = useState<DriveConnectionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [selectedSSID, setSelectedSSID] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [authToken, setAuthToken] = useState(DRIVE_CONFIG.authToken);
  const [connectedSSID, setConnectedSSID] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setPhase('scanning');
    setError(null);
    setNetworks([]);
    setSelectedSSID(null);
    try {
      await wifiService.requestPermissions();
      const results = await wifiService.scanForDrives();
      setNetworks(results);
      setPhase('idle');
      if (results.length === 0) {
        setError('No Sync-V drives found nearby. Make sure the drive is powered on.');
      }
    } catch (err) {
      setPhase('failed');
      setError(err instanceof Error ? err.message : 'Scan failed');
    }
  }, [wifiService]);

  const handleConnect = useCallback(async () => {
    if (!selectedSSID) return;
    setPhase('connecting');
    setError(null);

    const success = await wifiService.connectToNetwork(selectedSSID, password);
    if (!success) {
      setPhase('failed');
      setError('Could not connect to WiFi network. Check the password.');
      return;
    }

    // WiFi connected — now ping the drive
    setPhase('authenticating');
    const address = DRIVE_CONFIG.defaultAddress;
    const port = DRIVE_CONFIG.defaultPort;
    driveComm.setDriveEndpoint(address, port, authToken);

    const alive = await driveComm.pingDrive();
    if (!alive) {
      setPhase('failed');
      setError('WiFi connected but drive is not responding. Check the auth token.');
      driveComm.clearDriveEndpoint();
      return;
    }

    // Success
    networkService.setDriveReachable(true);
    networkService.startDriveMonitoring();
    setConnectedSSID(selectedSSID);
    setPhase('connected');
  }, [selectedSSID, password, authToken, wifiService, driveComm, networkService]);

  const handleDisconnect = useCallback(async () => {
    networkService.stopDriveMonitoring();
    networkService.setDriveReachable(false);
    driveComm.clearDriveEndpoint();
    await wifiService.disconnect();
    setConnectedSSID(null);
    setPhase('idle');
    setNetworks([]);
  }, [wifiService, driveComm, networkService]);

  const handleNetworkTap = (ssid: string) => {
    setSelectedSSID(ssid === selectedSSID ? null : ssid);
    setPassword('');
  };

  const renderNetwork = ({ item }: { item: WiFiNetwork }) => {
    const selected = item.SSID === selectedSSID;
    const secured = isSecured(item.capabilities);
    return (
      <View>
        <TouchableOpacity
          style={[listStyles.item, selected && listStyles.itemSelected]}
          onPress={() => handleNetworkTap(item.SSID)}
          activeOpacity={0.6}
        >
          <View style={listStyles.info}>
            <Text style={listStyles.ssid}>{item.SSID}</Text>
            <Text style={listStyles.meta}>
              {secured ? 'Secured' : 'Open'} · {signalBars(item.level)}
            </Text>
          </View>
          <Text style={listStyles.signal}>{signalBars(item.level)}</Text>
        </TouchableOpacity>
        {selected && (
          <View style={listStyles.expandedArea}>
            {secured && (
              <TextInput
                style={listStyles.input}
                placeholder="WiFi password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
              />
            )}
            <TextInput
              style={listStyles.input}
              placeholder="Auth token (optional)"
              value={authToken}
              onChangeText={setAuthToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={listStyles.connectBtn}
              onPress={handleConnect}
              activeOpacity={0.7}
            >
              <Text style={listStyles.connectBtnText}>Connect</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const isWorking = phase === 'scanning' || phase === 'connecting' || phase === 'authenticating';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect to Drive</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Phase Banner */}
      <View style={[styles.banner, { backgroundColor: PHASE_COLORS[phase] + '18' }]}>
        {isWorking && <ActivityIndicator size="small" color={PHASE_COLORS[phase]} style={{ marginRight: 8 }} />}
        <View style={[styles.phaseDot, { backgroundColor: PHASE_COLORS[phase] }]} />
        <Text style={[styles.phaseText, { color: PHASE_COLORS[phase] }]}>
          {PHASE_LABELS[phase]}
        </Text>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Connected State */}
      {phase === 'connected' && connectedSSID ? (
        <View style={styles.connectedCard}>
          <View style={styles.connectedHeader}>
            <View style={[styles.bigDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.connectedSSID}>{connectedSSID}</Text>
          </View>
          <Text style={styles.connectedDetail}>
            Drive at {DRIVE_CONFIG.defaultAddress}:{DRIVE_CONFIG.defaultPort}
          </Text>
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={handleDisconnect}
            activeOpacity={0.7}
          >
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onConnected}
            activeOpacity={0.7}
          >
            <Text style={styles.doneBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Scan Button */}
          <View style={styles.scanSection}>
            <TouchableOpacity
              style={[styles.scanBtn, isWorking && styles.scanBtnDisabled]}
              onPress={handleScan}
              disabled={isWorking}
              activeOpacity={0.7}
            >
              {phase === 'scanning' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.scanBtnText}>Scan for Drives</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Network List */}
          <FlatList
            data={networks}
            keyExtractor={(item) => item.BSSID || item.SSID}
            renderItem={renderNetwork}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              networks.length === 0 && phase === 'idle' ? (
                <Text style={styles.emptyText}>
                  Tap "Scan for Drives" to find nearby Sync-V drives
                </Text>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { paddingVertical: 8, paddingRight: 16 },
  backText: { fontSize: 16, color: COLORS.primary, fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textDark },
  headerSpacer: { width: 60 },
  banner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  phaseDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  phaseText: { fontSize: 14, fontWeight: '600' },
  errorBanner: {
    backgroundColor: COLORS.dangerBg, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.danger + '30',
  },
  errorText: { fontSize: 13, color: COLORS.danger },
  scanSection: { paddingHorizontal: 16, paddingVertical: 12 },
  scanBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 10,
    alignItems: 'center',
  },
  scanBtnDisabled: { opacity: 0.6 },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyText: {
    textAlign: 'center', color: COLORS.textMuted, fontSize: 14,
    marginTop: 40, paddingHorizontal: 20,
  },
  connectedCard: {
    margin: 16, backgroundColor: COLORS.card, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: COLORS.success + '40',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  connectedHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bigDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  connectedSSID: { fontSize: 20, fontWeight: '700', color: COLORS.textDark },
  connectedDetail: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  disconnectBtn: {
    borderWidth: 1, borderColor: COLORS.danger, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginBottom: 10,
    backgroundColor: COLORS.dangerBg,
  },
  disconnectBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },
  doneBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  doneBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});

const listStyles = StyleSheet.create({
  item: {
    backgroundColor: COLORS.card, borderRadius: 10, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  itemSelected: { borderColor: COLORS.primary, borderWidth: 2 },
  info: { flex: 1 },
  ssid: { fontSize: 16, fontWeight: '600', color: COLORS.textDark },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  signal: { fontSize: 12, fontFamily: 'monospace', color: COLORS.textMuted },
  expandedArea: {
    backgroundColor: COLORS.card, borderRadius: 10, padding: 14,
    marginTop: -4, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.primary, borderTopWidth: 0,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
  },
  input: {
    fontSize: 15, color: COLORS.textDark, backgroundColor: COLORS.bg,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  connectBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  connectBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
