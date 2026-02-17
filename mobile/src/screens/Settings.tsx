import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { NetworkService } from '../services/NetworkService';

interface SettingsProps {
  networkService: NetworkService;
  onNavigateBack: () => void;
}

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionContent}>{children}</View>
  </View>
);

const SettingsRow: React.FC<{
  label: string;
  value?: string;
  rightElement?: React.ReactNode;
}> = ({ label, value, rightElement }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    {rightElement}
  </View>
);

export const SettingsScreen: React.FC<SettingsProps> = ({ networkService, onNavigateBack }) => {
  const [driveAddress, setDriveAddress] = useState('192.168.4.1');
  const [drivePort, setDrivePort] = useState('8080');
  const [autoUpload, setAutoUpload] = useState(false);
  const [encryptLogs, setEncryptLogs] = useState(true);
  const networkState = networkService.getNetworkState();

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onNavigateBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SettingsSection title="Drive Connection">
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Drive IP Address</Text>
            <TextInput
              style={styles.input}
              value={driveAddress}
              onChangeText={setDriveAddress}
              placeholder="192.168.4.1"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Port</Text>
            <TextInput
              style={styles.input}
              value={drivePort}
              onChangeText={setDrivePort}
              placeholder="8080"
              keyboardType="numeric"
            />
          </View>
        </SettingsSection>

        <SettingsSection title="Upload Preferences">
          <SettingsRow
            label="Auto-upload when online"
            rightElement={
              <Switch
                value={autoUpload}
                onValueChange={setAutoUpload}
                trackColor={{ false: '#e2e8f0', true: '#c7d2fe' }}
                thumbColor={autoUpload ? '#6366f1' : '#94a3b8'}
              />
            }
          />
          <SettingsRow
            label="Encrypt logs before upload"
            rightElement={
              <Switch
                value={encryptLogs}
                onValueChange={setEncryptLogs}
                trackColor={{ false: '#e2e8f0', true: '#c7d2fe' }}
                thumbColor={encryptLogs ? '#6366f1' : '#94a3b8'}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="Network Status">
          <SettingsRow label="Connected" value={networkState.isConnected ? 'Yes' : 'No'} />
          <SettingsRow label="Connection Type" value={networkState.connectionType} />
          <SettingsRow label="Drive Reachable" value={networkState.isDriveReachable ? 'Yes' : 'No'} />
          <SettingsRow label="Cloud Reachable" value={networkState.isCloudReachable ? 'Yes' : 'No'} />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow label="Version" value="1.0.0" />
          <SettingsRow label="Build" value="Stage 1 (TDD)" />
          <SettingsRow label="Platform" value="React Native" />
        </SettingsSection>
      </ScrollView>
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
  scrollContent: { padding: 16, paddingBottom: 48 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: '#ffffff', borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  rowLabel: { fontSize: 15, color: '#334155' },
  rowValue: { fontSize: 15, color: '#94a3b8' },
  inputRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  inputLabel: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  input: {
    fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
});
