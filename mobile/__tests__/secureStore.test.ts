import { SecureStore } from '../src/services/SecureStore';
import { LogsService } from '../src/services/LogsService';
import { LogFile, EncryptedLogEntry } from '../src/types/Log';
import { resetSessionKey, setSessionKey, initializeSessionKey } from '../src/utils/crypto';

describe('SecureStore', () => {
  let store: SecureStore;

  beforeEach(() => {
    store = new SecureStore();
    store.setMockMode(true);
    resetSessionKey();
  });

  test('saves and loads encryption key', async () => {
    await store.saveEncryptionKey('test-key-abc123');
    const loaded = await store.loadEncryptionKey();
    expect(loaded).toBe('test-key-abc123');
  });

  test('returns null when no key saved', async () => {
    const loaded = await store.loadEncryptionKey();
    expect(loaded).toBeNull();
  });

  test('deletes encryption key', async () => {
    await store.saveEncryptionKey('test-key');
    await store.deleteEncryptionKey();
    const loaded = await store.loadEncryptionKey();
    expect(loaded).toBeNull();
  });

  test('saves and loads encrypted log entry', async () => {
    const entry: EncryptedLogEntry = {
      metadata: { filename: 'sensor.csv', size: 1024, deviceId: 'DEV001', collectedAt: '2026-01-01' },
      encryptedData: 'opaque-base64-blob-from-drive',
      encryptedAt: new Date().toISOString(),
    };

    await store.saveEncryptedLog('sensor.csv', entry);
    const loaded = await store.loadAllEncryptedLogs();
    expect(loaded.size).toBe(1);
    expect(loaded.get('sensor.csv')?.metadata.filename).toBe('sensor.csv');
  });

  test('loads multiple encrypted logs', async () => {
    const entry1: EncryptedLogEntry = {
      metadata: { filename: 'log1.csv', size: 100, deviceId: 'DEV001', collectedAt: '2026-01-01' },
      encryptedData: 'blob1-from-drive',
      encryptedAt: new Date().toISOString(),
    };
    const entry2: EncryptedLogEntry = {
      metadata: { filename: 'log2.csv', size: 200, deviceId: 'DEV002', collectedAt: '2026-01-02' },
      encryptedData: 'blob2-from-drive',
      encryptedAt: new Date().toISOString(),
    };

    await store.saveEncryptedLog('log1.csv', entry1);
    await store.saveEncryptedLog('log2.csv', entry2);

    const loaded = await store.loadAllEncryptedLogs();
    expect(loaded.size).toBe(2);
  });

  test('deletes encrypted log', async () => {
    const entry: EncryptedLogEntry = {
      metadata: { filename: 'todelete.csv', size: 50, deviceId: 'DEV001', collectedAt: '2026-01-01' },
      encryptedData: 'blob-to-delete',
      encryptedAt: new Date().toISOString(),
    };

    await store.saveEncryptedLog('todelete.csv', entry);
    await store.deleteEncryptedLog('todelete.csv');

    const loaded = await store.loadAllEncryptedLogs();
    expect(loaded.size).toBe(0);
  });

  test('saves and loads upload queue', async () => {
    const queue = [
      { id: 'q1', logFile: { filename: 'a.csv', size: 100, deviceId: 'D1', collectedAt: '' }, encrypted: true, attempts: 1, maxAttempts: 3 },
      { id: 'q2', logFile: { filename: 'b.csv', size: 200, deviceId: 'D2', collectedAt: '' }, encrypted: true, attempts: 0, maxAttempts: 3 },
    ];

    await store.saveUploadQueue(queue);
    const loaded = await store.loadUploadQueue();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('q1');
    expect(loaded[1].logFile.filename).toBe('b.csv');
  });

  test('returns empty queue when nothing saved', async () => {
    const loaded = await store.loadUploadQueue();
    expect(loaded).toHaveLength(0);
  });
});

describe('LogsService persistence', () => {
  let logsService: LogsService;
  let store: SecureStore;

  const mockLogs: LogFile[] = [
    { filename: 'persist1.txt', size: 512, deviceId: 'DEV001', collectedAt: '2026-01-01T00:00:00Z' },
    { filename: 'persist2.txt', size: 1024, deviceId: 'DEV002', collectedAt: '2026-01-02T00:00:00Z' },
  ];

  beforeEach(() => {
    resetSessionKey();
    setSessionKey('fixed-test-key-for-persistence');
    store = new SecureStore();
    store.setMockMode(true);
    logsService = new LogsService();
    logsService.setSecureStore(store);
  });

  test('persists encrypted logs to disk on receive', async () => {
    logsService.setMockDriveLogs(mockLogs);
    await logsService.getLogsFromDrive();

    // Verify stored in SecureStore
    const persisted = await store.loadAllEncryptedLogs();
    expect(persisted.size).toBe(2);
    expect(persisted.has('persist1.txt')).toBe(true);
    expect(persisted.has('persist2.txt')).toBe(true);
  });

  test('deletes from disk after successful upload', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(true);

    await logsService.getLogsFromDrive();
    await logsService.uploadToCloud(mockLogs[0]);

    const persisted = await store.loadAllEncryptedLogs();
    expect(persisted.size).toBe(1);
    expect(persisted.has('persist1.txt')).toBe(false);
    expect(persisted.has('persist2.txt')).toBe(true);
  });

  test('restores encrypted logs after simulated restart', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(false);

    await logsService.getLogsFromDrive();
    await logsService.uploadToCloud(mockLogs[0]); // Queued (offline)

    // Simulate app restart — create new LogsService, same store
    const newLogsService = new LogsService();
    newLogsService.setSecureStore(store);
    await newLogsService.loadPersistedState();

    // Both encrypted logs should be restored
    expect(newLogsService.isEncryptedOnDevice('persist1.txt')).toBe(true);
    expect(newLogsService.isEncryptedOnDevice('persist2.txt')).toBe(true);
    expect(newLogsService.getEncryptedCount()).toBe(2);

    // Upload queue should be restored
    expect(newLogsService.getUploadQueue()).toHaveLength(1);
    expect(newLogsService.getUploadQueue()[0].logFile.filename).toBe('persist1.txt');
  });

  test('processes restored queue after reconnect', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(false);

    await logsService.getLogsFromDrive();
    await logsService.uploadToCloud(mockLogs[0]);

    // Simulate restart
    const newLogsService = new LogsService();
    newLogsService.setSecureStore(store);
    await newLogsService.loadPersistedState();

    // Reconnect and process
    newLogsService.setMockCloudAvailable(true);
    const result = await newLogsService.processUploadQueue();
    expect(result.successful).toBe(1);

    // Uploaded log deleted from disk
    const persisted = await store.loadAllEncryptedLogs();
    expect(persisted.has('persist1.txt')).toBe(false);
  });
});

describe('initializeSessionKey persistence', () => {
  beforeEach(() => {
    resetSessionKey();
  });

  test('generates and persists key on first run', async () => {
    const store = new SecureStore();
    store.setMockMode(true);

    const key = await initializeSessionKey(store);
    expect(key).toBeTruthy();
    expect(key.length).toBe(64);

    // Key should be persisted
    const persisted = await store.loadEncryptionKey();
    expect(persisted).toBe(key);
  });

  test('restores persisted key on subsequent run', async () => {
    const store = new SecureStore();
    store.setMockMode(true);

    // First run — generates key
    const key1 = await initializeSessionKey(store);

    // Reset in-memory key
    resetSessionKey();

    // Second run — should restore same key
    const key2 = await initializeSessionKey(store);
    expect(key2).toBe(key1);
  });
});
