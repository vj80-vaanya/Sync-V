import { LogsService } from '../src/services/LogsService';
import { LogFile, LogUploadStatus } from '../src/types/Log';
import { resetSessionKey } from '../src/utils/crypto';

describe('LogsService', () => {
  let logsService: LogsService;

  const mockLogs: LogFile[] = [
    { filename: 'log1.txt', size: 1024, deviceId: 'DEV001', collectedAt: '2026-01-01T00:00:00Z' },
    { filename: 'log2.csv', size: 2048, deviceId: 'DEV001', collectedAt: '2026-01-02T00:00:00Z' },
  ];

  beforeEach(() => {
    logsService = new LogsService();
    resetSessionKey();
  });

  test('reads log list from drive', async () => {
    logsService.setMockDriveLogs(mockLogs);

    const logs = await logsService.getLogsFromDrive();
    expect(logs).toHaveLength(2);
    expect(logs[0].filename).toBe('log1.txt');
  });

  test('stores opaque blobs on receipt from drive', async () => {
    logsService.setMockDriveLogs(mockLogs);

    await logsService.getLogsFromDrive();

    // Logs should be stored on-device as opaque blobs
    expect(logsService.isEncryptedOnDevice('log1.txt')).toBe(true);
    expect(logsService.isEncryptedOnDevice('log2.csv')).toBe(true);
    expect(logsService.getEncryptedCount()).toBe(2);
  });

  test('triggers upload to cloud', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(true);

    const result = await logsService.uploadToCloud(mockLogs[0]);
    expect(result.success).toBe(true);
    expect(result.status).toBe('uploaded');
  });

  test('auto-deletes blob after successful upload', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(true);

    // Get logs to store them
    await logsService.getLogsFromDrive();
    expect(logsService.isEncryptedOnDevice('log1.txt')).toBe(true);

    // Upload — should auto-delete
    await logsService.uploadToCloud(mockLogs[0]);
    expect(logsService.isEncryptedOnDevice('log1.txt')).toBe(false);

    // Other log still stored
    expect(logsService.isEncryptedOnDevice('log2.csv')).toBe(true);
    expect(logsService.getEncryptedCount()).toBe(1);
  });

  test('queues upload when offline', async () => {
    logsService.setMockCloudAvailable(false);

    const result = await logsService.uploadToCloud(mockLogs[0]);
    expect(result.success).toBe(false);
    expect(result.status).toBe('pending');

    const queue = logsService.getUploadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].logFile.filename).toBe('log1.txt');
    expect(queue[0].encrypted).toBe(true);
  });

  test('keeps blob when offline (not deleted)', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(false);

    await logsService.getLogsFromDrive();
    await logsService.uploadToCloud(mockLogs[0]);

    // Data should remain since upload failed
    expect(logsService.isEncryptedOnDevice('log1.txt')).toBe(true);
  });

  test('retries queued uploads when online', async () => {
    logsService.setMockCloudAvailable(false);
    await logsService.uploadToCloud(mockLogs[0]);
    await logsService.uploadToCloud(mockLogs[1]);

    expect(logsService.getUploadQueue()).toHaveLength(2);

    logsService.setMockCloudAvailable(true);
    const results = await logsService.processUploadQueue();

    expect(results.successful).toBe(2);
    expect(results.failed).toBe(0);
    expect(logsService.getUploadQueue()).toHaveLength(0);
  });

  test('auto-deletes blobs when queue processes successfully', async () => {
    logsService.setMockDriveLogs(mockLogs);
    logsService.setMockCloudAvailable(false);

    await logsService.getLogsFromDrive();
    await logsService.uploadToCloud(mockLogs[0]);
    await logsService.uploadToCloud(mockLogs[1]);

    expect(logsService.getEncryptedCount()).toBe(2);

    logsService.setMockCloudAvailable(true);
    await logsService.processUploadQueue();

    // Both should be deleted after successful upload
    expect(logsService.isEncryptedOnDevice('log1.txt')).toBe(false);
    expect(logsService.isEncryptedOnDevice('log2.csv')).toBe(false);
    expect(logsService.getEncryptedCount()).toBe(0);
  });

  test('tracks per-log status', async () => {
    logsService.setMockCloudAvailable(true);
    await logsService.uploadToCloud(mockLogs[0]);

    const status = logsService.getLogStatus(mockLogs[0].filename);
    expect(status).toBe('uploaded');
  });

  test('reports encrypted flag on upload', async () => {
    logsService.setMockCloudAvailable(true);
    logsService.setMockDriveLogs(mockLogs);

    const result = await logsService.uploadToCloud(mockLogs[0]);
    expect(result.encrypted).toBe(true);
  });

  test('purges after confirmed upload', async () => {
    logsService.setMockCloudAvailable(true);
    await logsService.uploadToCloud(mockLogs[0]);

    const purged = await logsService.purgeUploadedLog(mockLogs[0].filename);
    expect(purged).toBe(true);

    const status = logsService.getLogStatus(mockLogs[0].filename);
    expect(status).toBe('purged');
  });

  test('refuses to purge non-uploaded log', async () => {
    const purged = await logsService.purgeUploadedLog('nonexistent.txt');
    expect(purged).toBe(false);
  });
});
