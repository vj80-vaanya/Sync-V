import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator } from 'react-native';
import { NetworkService } from '../services/NetworkService';
import { CloudApiService } from '../services/CloudApiService';
import { NetworkState } from '../types/Network';
import { CLOUD_CONFIG } from '../config';
import { COLORS } from '../theme/colors';

interface SettingsProps {
  networkService: NetworkService;
  cloudApi: CloudApiService;
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
  valueColor?: string;
  rightElement?: React.ReactNode;
}> = ({ label, value, valueColor, rightElement }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    {value ? <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text> : null}
    {rightElement}
  </View>
);

export const SettingsScreen: React.FC<SettingsProps> = ({ networkService, cloudApi, onNavigateBack }) => {
  const [driveAddress, setDriveAddress] = useState('192.168.4.1');
  const [drivePort, setDrivePort] = useState('8080');
  const [autoUpload, setAutoUpload] = useState(false);
  const [encryptLogs, setEncryptLogs] = useState(true);

  // Cloud config
  const [cloudUrl, setCloudUrl] = useState(cloudApi.getBaseUrl());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(cloudApi.isAuthenticated());
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  // Network state
  const [networkState, setNetworkState] = useState<NetworkState>(networkService.getNetworkState());

  useEffect(() => {
    const unsubNet = networkService.onStateChange(setNetworkState);
    const unsubAuth = cloudApi.onAuthChange(setIsLoggedIn);
    return () => { unsubNet(); unsubAuth(); };
  }, [networkService, cloudApi]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    cloudApi.setBaseUrl(cloudUrl);
    const ok = await cloudApi.checkHealth();
    setTestResult(ok ? 'ok' : 'fail');
    setTestingConnection(false);
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setLoginError('Username and password required');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    cloudApi.setBaseUrl(cloudUrl);
    const result = await cloudApi.login(username.trim(), password.trim());
    if (result.success) {
      setPassword('');
      setLoginError('');
    } else {
      setLoginError(result.error || 'Login failed');
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    cloudApi.logout();
    setLoginError('');
  };

  const cloudUser = cloudApi.getUser();

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

        {/* Cloud Backend */}
        <SettingsSection title="Cloud Backend">
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Backend URL</Text>
            <TextInput
              style={styles.input}
              value={cloudUrl}
              onChangeText={setCloudUrl}
              placeholder={CLOUD_CONFIG.baseUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.testBtn, testResult === 'ok' && styles.testBtnOk, testResult === 'fail' && styles.testBtnFail]}
              onPress={handleTestConnection}
              disabled={testingConnection}
              activeOpacity={0.7}
            >
              {testingConnection ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.testBtnText}>
                  {testResult === 'ok' ? 'Connected' : testResult === 'fail' ? 'Failed — Retry' : 'Test Connection'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {isLoggedIn ? (
            <View style={styles.loggedInRow}>
              <View style={styles.loggedInInfo}>
                <View style={[styles.authDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.loggedInText}>
                  Logged in as <Text style={styles.loggedInUser}>{cloudUser?.username}</Text>
                  {' '}({cloudUser?.role})
                </Text>
              </View>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
                <Text style={styles.logoutBtnText}>Logout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="admin"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                />
              </View>
              {loginError ? (
                <View style={styles.errorRow}>
                  <Text style={styles.errorText}>{loginError}</Text>
                </View>
              ) : null}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.loginBtn}
                  onPress={handleLogin}
                  disabled={loginLoading}
                  activeOpacity={0.7}
                >
                  {loginLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.loginBtnText}>Sign In to Cloud</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </SettingsSection>

        {/* Drive Connection */}
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
          <SettingsRow
            label="Drive"
            value={networkState.isDriveReachable ? 'Connected' : 'Disconnected'}
            valueColor={networkState.isDriveReachable ? COLORS.success : COLORS.danger}
          />
          <SettingsRow
            label="Cloud"
            value={networkState.isCloudReachable ? 'Connected' : 'Disconnected'}
            valueColor={networkState.isCloudReachable ? COLORS.success : COLORS.danger}
          />
          <SettingsRow label="Connection Type" value={networkState.connectionType} />
          <SettingsRow
            label="Authenticated"
            value={isLoggedIn ? 'Yes' : 'No'}
            valueColor={isLoggedIn ? COLORS.success : COLORS.textMuted}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow label="Version" value="1.1.0" />
          <SettingsRow label="Build" value="Stage 2 (Cloud)" />
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
  backText: { fontSize: 16, color: COLORS.primary, fontWeight: '500' },
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
  buttonRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  testBtn: {
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary,
  },
  testBtnOk: { backgroundColor: COLORS.successBg, borderColor: COLORS.success },
  testBtnFail: { backgroundColor: COLORS.dangerBg, borderColor: COLORS.danger },
  testBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  loginBtn: {
    paddingVertical: 12, borderRadius: 8, alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  loginBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  errorRow: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  errorText: { fontSize: 13, color: COLORS.danger },
  loggedInRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  loggedInInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  authDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  loggedInText: { fontSize: 14, color: COLORS.textMid },
  loggedInUser: { fontWeight: '700', color: COLORS.textDark },
  logoutBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6,
    backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: COLORS.danger,
  },
  logoutBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.danger },
});
